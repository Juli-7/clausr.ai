import { streamText, tool } from "ai";
import { z } from "zod";
import { createModel } from "@/lib/agent/llm/factory";
import { runScript } from "./script-runner";
import { ComplianceCheckSchema, type ComplianceCheckInput } from "@/lib/agent/shared/schemas";
import { executeComplianceCheck } from "@/lib/agent/pipeline/builtins";
import type { ExecutableStep } from "../types";
import type { ParsedCheck } from "@/lib/agent/loading/skill/check-parser";
import type { PipelineContext, CheckResult, CitationPaletteEntry } from "../pipeline-context";
import type { StepResult } from "../types";
import type { ToolCallRecord } from "@/lib/agent/shared/types";
import { logPipeline, truncate } from "../logger";

export async function executeLlmToolStep(
  step: ExecutableStep,
  ctx: PipelineContext,
  previousError?: string
): Promise<StepResult> {
  try {
    const scripts = ctx.skill.scripts;

    const contextSummary = buildContextSummary(ctx);
    const retryContext = previousError
      ? `\n\nPREVIOUS ATTEMPT FAILED: ${previousError}\nPlease fix the issue and retry.`
      : "";

    const systemPrompt = `# Role
${ctx.skill.skillmd}

# Current Step: ${step.number}. ${step.title}

${step.instructions}

# Available Context
${contextSummary}
${retryContext}

# Instructions
- Use the uploaded files and available context above to complete this step.
- Extract all relevant information from the files — do not ask the user to provide information that is already in the files.
- You MUST call the available tools to execute compliance checks. Numerical checks require the tool.
- Output a narrative analysis paragraph starting with "### {Field Name}" with citation markers like [S1.c1] and [R48.5.11].
- Then call the 'submitCheckResult' tool with the structured result containing the field value, citations, and verdict.
- CRITICAL: The tool parameters are the source of truth for rendering badges. Every [Sx.cx] marker in the narrative MUST have a matching entry in the 'sourceCitation' parameter. Every [Rx.x.x] marker MUST have a matching entry in the 'citationRef' parameter. Markers without parameter entries will be silently discarded.
`;

    logPipeline(`  [LLM+TOOL] step=${step.number} promptLen=${systemPrompt.length}chars scripts=${scripts.length}`);

    const tools: Record<string, any> = {};

    // submitCheckResult is always available — the LLM MUST call this to submit the structured result
    const SubmitResultSchema = z.object({
      value: z.string().min(1).describe("Narrative finding for this assessment field"),
      sourceCitation: z.array(z.string()).describe("Source chunk IDs cited — every [Sx.cx] in the narrative MUST appear here"),
      citationRef: z.array(z.string()).describe("Regulation reference IDs cited — every [Rx.x.x] in the narrative MUST appear here"),
      verdict: z.enum(["PASS", "FAIL"]).describe("Compliance verdict"),
    });
    tools.submitCheckResult = tool({
      description: "Submit the structured assessment result for this step. YOU MUST CALL THIS TOOL to complete the step.",
      inputSchema: SubmitResultSchema,
      execute: async (input: z.infer<typeof SubmitResultSchema>) => input,
    });

    // Always register compliance-check builtin when there are checks that need it
    const hasNumericalChecks = ctx.skill.checks.some(
      c => c.type.kind === "number" || c.constraint
    );
    if (hasNumericalChecks) {
      tools.checkCompliance = tool({
        description: "Run numerical compliance checks. Pass multiple checks as a JSON array.",
        inputSchema: ComplianceCheckSchema,
        execute: async (input) => {
          const checks = (input as any)?.checks;
          logPipeline(`  [TOOL EXEC] compliance-check builtin with ${checks?.length ?? 0} check(s): ${checks ? JSON.stringify(checks).slice(0, 200) : "none"}`);
          const result = executeComplianceCheck(input as ComplianceCheckInput);
          logPipeline(`  [TOOL EXEC] result: ${truncate(JSON.stringify(result), 200)}`);
          return result;
        },
      });
    }

    for (const script of scripts) {
      if (script.name === "compliance-check") continue;
      logPipeline(`  [TOOL] registering generic tool "${script.name}"`);
      tools[script.name] = tool({
        description: script.desc || `Run ${script.name} script`,
        inputSchema: ComplianceCheckSchema,
        execute: async (input) => {
          const result = await runScript(script.path, input);
          if (!result.success) {
            return { error: true, message: result.stderr || "Failed" };
          }
          try {
            return JSON.parse(result.stdout);
          } catch {
            return { raw: result.stdout };
          }
        },
      });
    }

    logPipeline(`  [LLM+TOOL] step=${step.number} calling streamText with ${Object.keys(tools).length} tool(s)`);

    const citationGuide = buildCitationGuide(ctx);
    const toolSystemPrompt = systemPrompt + citationGuide;

    const collectedToolRuns: {
      inputs: Record<string, unknown>[];
      outputs: Record<string, unknown>[];
    }[] = [];

    const perCheckResults: {
      name: string;
      value: number;
      limit: number | string;
      comparison: string;
      status: "pass" | "fail";
      note?: string;
    }[] = [];

    const humanField = step.title.replace("Evaluate: ", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const userMessage = `Execute step ${step.number}: ${step.title}. Write a narrative analysis starting with "### ${humanField}". Then call the submitCheckResult tool with these exact fields: value (narrative text with citations), sourceCitation (array of chunk IDs), citationRef (array of regulation IDs), and verdict (PASS or FAIL). The tool parameters are the source of truth for badge rendering — every [Sx.cx] marker in the narrative MUST appear in sourceCitation, and every [Rx.x.x] marker MUST appear in citationRef.`;

    let submittedResult: { value: string; sourceCitation: string[]; citationRef: string[]; verdict: string } | null = null;

    const result = streamText({
      model: createModel(),
      system: toolSystemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      toolChoice: "required",
      ...(step.temperature !== undefined ? { temperature: step.temperature } : {}),
      onStepFinish: (event) => {
        logPipeline(`  [LLM+TOOL] step=${step.number} onStepFinish: toolResults=${event.toolResults?.length ?? 0} textLen=${(event.text ?? "").length}`);
        if (event.toolResults?.length) {
          for (const tr of event.toolResults) {
            if (tr.toolName === "submitCheckResult" && tr.output) {
              submittedResult = tr.output as typeof submittedResult;
              if (submittedResult) logPipeline(`  [LLM+TOOL] submitCheckResult: verdict=${submittedResult.verdict} citations=${submittedResult.citationRef.length} source=${submittedResult.sourceCitation.length} valueLen=${submittedResult.value.length}`);
              continue;
            }

            const checksInput = (tr.input as Record<string, unknown>)?.checks as Record<string, unknown>[] ?? [];
            const resultsOutput = (typeof tr.output === "object" && tr.output !== null)
              ? ((tr.output as Record<string, unknown>).results as Record<string, unknown>[] ?? [])
              : [];

            const passCount = resultsOutput.filter((x: Record<string, unknown>) => x.status === "pass").length;
            logPipeline(`  [LLM+TOOL] tool "${tr.toolName}": ${passCount}/${resultsOutput.length} passed`);

            const merged: Record<string, unknown>[] = resultsOutput.map((out, idx) => {
              const inp = checksInput[idx] ?? {};
              return {
                ...out,
                clause: inp.clause as string ?? "",
                regulation: inp.regulation as string ?? (ctx.skill.regulationIds[0] ?? ""),
              };
            });
            collectedToolRuns.push({ inputs: checksInput, outputs: merged });

            const existingToolCalls = (ctx.steps.getRaw("toolCalls") as ToolCallRecord[]) ?? [];
            for (const out of resultsOutput) {
              const checkName = (out.name as string) ?? "check";
              const checkStatus = (out.status as string) === "pass" ? "success" : "error";
              existingToolCalls.push({
                step: Object.keys(ctx.steps.entries()).length + 1,
                toolName: `numerical check - ${checkName}`,
                summary: `${out.value ?? "?"} ${out.comparison ?? ""} → ${out.status ?? "?"}`,
                status: checkStatus,
              });
              perCheckResults.push({
                name: checkName,
                value: out.value as number,
                limit: (out.limit as number | string) ?? "?",
                comparison: (out.comparison as string) ?? "",
                status: out.status as "pass" | "fail",
                note: out.note as string | undefined,
              });
            }
            ctx.steps.setRaw("toolCalls", existingToolCalls);
          }
        }
      },
    });

    const tokens: string[] = [];
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
      tokens.push(chunk);
    }

    logPipeline(`  [LLM+TOOL] step=${step.number} finalText=${fullText.length}chars preview=${truncate(fullText, 150)}`);

    // Require submitCheckResult for every step
    if (!submittedResult) {
      logPipeline(`  [LLM+TOOL] submitCheckResult was NOT called — will retry`);
      return {
        success: false,
        error: `Step ${step.number}: You MUST call the submitCheckResult tool with the field value, sourceCitation (array), citationRef (array), and verdict (PASS or FAIL).`,
        errorCode: "LLM_ERROR",
      };
    }

    const submitData: { value: string; sourceCitation: string[]; citationRef: string[]; verdict: string } = submittedResult;
    const currentCheck = ctx.skill.checks[step.number - 1];
    const stepNeedsTool = currentCheck && (currentCheck.type.kind === "number" || currentCheck.constraint);
    if (stepNeedsTool && collectedToolRuns.length === 0) {
      logPipeline(`  [LLM+TOOL] compliance tool was NOT called for numerical step — will retry`);
      return {
        success: false,
        error: `Step ${step.number}: You MUST call the compliance tool for all numerical checks. Extract values from the file data and pass them as structured check objects to the tool.`,
        errorCode: "LLM_ERROR",
      };
    }

    const checkDef = ctx.skill.checks[step.number - 1];
    const checkName = checkDef?.field ?? `step-${step.number}`;
    const checkType = checkDef?.type.kind === "number" ? ("numerical" as const) : ("qualitative" as const);

    if (collectedToolRuns.length > 0) {
      // Build CheckResults from compliance tool output, merge submitCheckResult data
      const palette = ctx.palette.getCitationPalette();
      const allResults = collectedToolRuns.flatMap(run => run.outputs);
      const mergedResults = allResults.map((r, i) => {
        const clause = (r.clause as string) ?? "";
        return {
          name: (r.name as string) ?? `check-${i + 1}`,
          type: "numerical" as const,
          finding: submitData.value,
          verdict: r.status === "pass" ? ("PASS" as const) : ("FAIL" as const),
          citationRef: submitData.citationRef.length > 0 ? submitData.citationRef : resolveCitationRef(palette, clause),
          sourceCitation: submitData.sourceCitation,
          toolResult: {
            value: r.value as number,
            limit: r.limit as number,
            comparison: r.comparison as string,
            status: r.status as "pass" | "fail",
          },
        };
      });
      ctx.checks.addResults(mergedResults);
      logPipeline(`  [LLM+TOOL] merged ${mergedResults.length} CheckResult(s) from compliance tool + submitCheckResult`);
    } else {
      // No compliance tool calls — use submitCheckResult directly (qualitative checks)
      const result: CheckResult = {
        name: checkName,
        type: checkType,
        finding: submitData.value,
        verdict: submitData.verdict as "PASS" | "FAIL",
        citationRef: submitData.citationRef,
        sourceCitation: submitData.sourceCitation,
      };
      ctx.checks.addResults([result]);
      logPipeline(`  [LLM+TOOL] extracted CheckResult from submitCheckResult: verdict=${result.verdict}`);
    }

    storeOutput(ctx, step.number, fullText);
    return {
      success: true,
      contextSnapshot: { systemPrompt: toolSystemPrompt, userMessage, contextSummary },
      streamedTokens: tokens,
      toolResults: perCheckResults.length > 0 ? perCheckResults : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: `Step ${step.number} tool LLM error: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "LLM_ERROR",
    };
  }
}

// ── Helpers ──

function storeOutput(ctx: PipelineContext, stepNumber: number, text: string): void {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      ctx.steps.write(stepNumber, JSON.parse(trimmed));
    } catch {
      ctx.steps.write(stepNumber, trimmed);
    }
  } else {
    ctx.steps.write(stepNumber, trimmed);
  }
}

function resolveCitationRef(palette: readonly CitationPaletteEntry[], clause: string): string[] {
  if (!clause) return [];
  if (palette.some(e => e.id === clause)) return [clause];
  const dot = clause.indexOf(".");
  const reg = dot !== -1 ? clause.substring(0, dot) : "";
  if (!reg) return [];
  const fallback = palette.find(e => e.id.startsWith(reg + "."));
  return fallback ? [fallback.id] : [`${reg}.0`];
}

export function buildDomainSchemaGuide(checks: ParsedCheck[]): string {
  const parts: string[] = [];
  parts.push("");
  parts.push("# Expected Data Schema");
  parts.push("Output your response as a JSON object matching this schema.");
  parts.push("Extract every listed field from the uploaded files. Do not skip fields.");
  parts.push("");
  for (const check of checks) {
    let line = `- \`${check.field}\` (${check.type.kind}`;
    if (check.type.kind === "enum") {
      line += `: ${check.type.values.join("|")}`;
    }
    line += ")";
    if (check.constraint) line += ` — ${check.constraint}`;
    if (check.clause) line += ` — ${check.clause}`;
    if (check.dependsOn) line += ` — conditional on ${check.dependsOn}`;
    if (check.description) line += ` — ${check.description}`;
    parts.push(line);
  }
  parts.push("");
  parts.push("For numerical checks, use the compliance-check tool to validate. Include the tool result.");
  parts.push("For conditional checks, evaluate the condition first before including the result.");
  parts.push("Every field entry MUST include citationRef (regulation reference) and sourceCitation (source chunk ID).");
  return parts.join("\n");
}

function buildContextSummary(ctx: PipelineContext): string {
  const parts: string[] = [];

  const fileSummary = ctx.files.buildContextSummary();
  if (fileSummary) parts.push(fileSummary);

  const latestStep = ctx.steps.latest();
  if (latestStep) {
    const text = typeof latestStep.value === "string"
      ? latestStep.value
      : JSON.stringify(latestStep.value, null, 2);
    parts.push(`Previous Step Output:\n[Step ${latestStep.stepNumber} Output]\n${text.slice(0, 500)}`);
  }

  const citationSummary = ctx.palette.formatContextSummary();
  if (citationSummary) parts.push(citationSummary);

  if (ctx.checks.getResults().length > 0) {
    const summary = ctx.checks.getResults()
      .map((c) => `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef.join(", ")}]`)
      .join("\n");
    parts.push(`Check Results:\n${summary}`);
  }

  if (ctx.skill.checks.length > 0) {
    const guide = buildDomainSchemaGuide(ctx.skill.checks);
    if (guide) parts.push(guide);
  }

  const sourcePalette = ctx.files.getSourcePalette();
  if (sourcePalette.length > 0) {
    const summary = ctx.palette.formatSourceSummary(sourcePalette);
    if (summary) parts.push(summary);
  }

  if (ctx.previousTurns.length > 0) {
    const summary = ctx.previousTurns
      .map((t) => `Turn ${t.turnNumber}: ${t.reasoningSummary}`)
      .join("\n");
    parts.push(`Previous Turns:\n${summary}`);
  }

  return parts.join("\n\n");
}

function buildCitationGuide(ctx: PipelineContext): string {
  const parts: string[] = [];
  const citationPalette = ctx.palette.getCitationPalette();
  const sourcePalette = ctx.files.getSourcePalette();

  if (citationPalette.length > 0 || sourcePalette.length > 0) {
    parts.push("");
    parts.push("# Citation Format");
    parts.push("The submitCheckResult tool parameters MUST include both citation arrays:");
    parts.push("- `citationRef`: regulation references — use the EXACT IDs from Available Citations (e.g., \"R48.5.11\")");
    parts.push("- `sourceCitation`: source chunk IDs — use the EXACT chunk IDs from source palette (e.g., [\"S1.c3\", \"S2.c1\"])");
    parts.push("CRITICAL: Every `[Sx.cx]` marker in the narrative MUST appear in `sourceCitation`. Every `[Rx.x.x]` marker MUST appear in `citationRef`. Arrays are the source of truth for badge rendering — markers without corresponding array entries are silently discarded.");
    parts.push("Arrays can be empty if not applicable, but must be present.");
  }

  const hasChunks = ctx.files.getFiles().some(f => f.chunks && f.chunks.length > 0);
  if (hasChunks) {
    parts.push("");
    parts.push("# Source Chunk References (sourceCitation)");
    parts.push("Source text above is annotated with chunk IDs like [S1.c3]. Use these in claims:");
    parts.push("- `sourceCitation` field: the source chunk ID that backs this claim (e.g., \"S1.c3\")");
    parts.push("- `citationRef` field: the regulation reference (e.g., \"R48.5.11\")");
    parts.push("Every factual claim MUST include a sourceCitation pointing to the source chunk that supports it.");
  }

  return parts.join("\n");
}


