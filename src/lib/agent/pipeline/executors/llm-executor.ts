import { stepCountIs, streamText, tool } from "ai";
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
- Output ONLY one JSON code block. Do not write prose outside the JSON block.
- The JSON field 'value' is the single narrative source of truth and MUST start with "### {Field Name}". Include citation markers like [S1.c1] and [R48.5.11] inside 'value'.
`;

    logPipeline(`  [LLM+TOOL] step=${step.number} promptLen=${systemPrompt.length}chars scripts=${scripts.length}`);

    const tools: Record<string, any> = {};

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
    const userMessage = `Execute step ${step.number}: ${step.title}. Output ONLY this JSON code block shape — no prose before or after it:\n\`\`\`json\n{"${step.title.replace("Evaluate: ", "")}": {"value": "### ${humanField}\\nNarrative assessment text with citations like [S1.c1] and [R48.5.11]", "sourceCitation": ["S1.c1", "S1.c2"], "citationRef": ["R48.5.11"], "verdict": "PASS"}}\n\`\`\`\n\nThe JSON MUST include exactly these fields: value (non-empty string), sourceCitation (array), citationRef (array), and verdict (PASS or FAIL). The value is the only narrative; every [Sx.cx] marker in value MUST appear in sourceCitation, and every [Rx.x.x] marker MUST appear in citationRef.`;

    const result = streamText({
      model: createModel(),
      system: toolSystemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(3),
      ...(step.temperature !== undefined ? { temperature: step.temperature } : {}),
      onStepFinish: (event) => {
        logPipeline(`  [LLM+TOOL] step=${step.number} onStepFinish: toolResults=${event.toolResults?.length ?? 0} textLen=${(event.text ?? "").length}`);
        if (event.toolResults?.length) {
          for (const tr of event.toolResults) {
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

    // Retry only when numerical checks exist AND tool should have been called for this step
    const currentCheck = ctx.skill.checks[step.number - 1];
    const stepNeedsTool = currentCheck && (currentCheck.type.kind === "number" || currentCheck.constraint);
    if (stepNeedsTool && Object.keys(tools).length > 0 && collectedToolRuns.length === 0) {
      logPipeline(`  [LLM+TOOL] tool was NOT called for numerical step — will retry with error context`);
      return {
        success: false,
        error: `Step ${step.number}: You MUST call the compliance tool for all numerical checks. Extract values from the file data and pass them as structured check objects to the tool.`,
        errorCode: "LLM_ERROR",
      };
    }

    // Parse the single JSON output. The JSON value is the narrative source of truth.
    const parsedText = ctx.skill.checks.length > 0
      ? extractCheckResultsFromText(fullText, ctx.skill.checks, step.number)
      : { results: [] as CheckResult[] };
    if (parsedText.error) {
      logPipeline(`  [LLM+TOOL] invalid JSON result — will retry: ${parsedText.error}`);
      return {
        success: false,
        error: `Step ${step.number}: ${parsedText.error}. Output ONLY a valid JSON code block with value, sourceCitation, citationRef, and verdict.`,
        errorCode: "LLM_ERROR",
      };
    }
    const textResults = parsedText.results;

    if (collectedToolRuns.length > 0) {
      // Build CheckResults from tool output, merge narrative from text
      const palette = ctx.palette.getCitationPalette();
      const allResults = collectedToolRuns.flatMap(run => run.outputs);
      const mergedResults = allResults.map((r, i) => {
        const name = (r.name as string) ?? `check-${i + 1}`;
        const narrative = textResults.find(tr => tr.name === name);
        const clause = (r.clause as string) ?? "";
        return {
          name,
          type: "numerical" as const,
          finding: narrative?.finding ?? `${r.name}: ${r.value} ${r.comparison} → ${r.status}`,
          verdict: r.status === "pass" ? ("PASS" as const) : ("FAIL" as const),
          citationRef: narrative?.citationRef ?? resolveCitationRef(palette, clause),
          sourceCitation: narrative?.sourceCitation ?? [],
          toolResult: {
            value: r.value as number,
            limit: r.limit as number,
            comparison: r.comparison as string,
            status: r.status as "pass" | "fail",
          },
        };
      });
      ctx.checks.addResults(mergedResults);
      logPipeline(`  [LLM+TOOL] merged ${mergedResults.length} CheckResult entry(ies) from tool + narrative`);
    } else if (textResults.length > 0) {
      // No tool calls — use narrative results directly (qualitative checks)
      ctx.checks.addResults(textResults);
      logPipeline(`  [LLM+TOOL] extracted ${textResults.length} CheckResult(s) from LLM text output`);
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
  // Use the clause itself as fallback — even if not in the palette,
  // check-store will create a minimal entry for it
  return [clause];
}

export function buildDomainSchemaGuide(checks: ParsedCheck[]): string {
  const parts: string[] = [];
  parts.push("");
  parts.push("# Expected Data Schema");
  parts.push("Output ONLY one JSON code block matching this schema; do not write prose outside JSON.");
  parts.push("Extract every listed field from the uploaded files. Do not skip fields. Put the narrative assessment in the JSON value field.");
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
    parts.push("Every field entry in the JSON block MUST include these two arrays:");
    parts.push("- `citationRef`: regulation references — use the EXACT IDs from Available Citations (e.g., \"R48.5.11\")");
    parts.push("- `sourceCitation`: source chunk IDs — use the EXACT chunk IDs from source palette (e.g., [\"S1.c3\", \"S2.c1\"])");
    parts.push("Arrays can be empty if not applicable, but must be present.");
    parts.push("The JSON value field is the only narrative source. Every `[Sx.cx]` marker in value MUST appear in `sourceCitation`; every `[Rx.x.x]` marker in value MUST appear in `citationRef`.");
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

/**
 * Parse the LLM's JSON output and extract a CheckResult for the current step.
 *
 * Expected JSON format (per field):
 *   {"field_name": {"value": "narrative...", "sourceCitation": ["S1.c1"], "citationRef": ["R48.5.11"], "verdict": "PASS"}}
 */
const CheckFieldEntrySchema = z.object({
  value: z.string().min(1),
  sourceCitation: z.array(z.string()),
  citationRef: z.array(z.string()),
  verdict: z.enum(["PASS", "FAIL"]),
}).strict();

function extractCheckResultsFromText(
  text: string,
  checks: ParsedCheck[],
  stepNumber: number
): { results: CheckResult[]; error?: string } {
  let cleaned = text.trim();
  const startFence = cleaned.indexOf("```");
  if (startFence === -1) {
    return { results: [], error: "Missing JSON code block" };
  }

  const endFence = cleaned.indexOf("```", startFence + 3);
  if (endFence === -1) {
    return { results: [], error: "Unclosed JSON code block" };
  }

  cleaned = cleaned.substring(startFence + 3, endFence).trim();
  const jsonIdx = cleaned.indexOf("json");
  if (jsonIdx === 0) cleaned = cleaned.substring(4).trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { results: [], error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
    return { results: [], error: "JSON root must be an object" };
  }

  const checkDef = checks[stepNumber - 1];
  if (!checkDef) return { results: [] };

  const field = checkDef.field;
  const entry = (parsed as Record<string, unknown>)[field];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { results: [], error: `JSON must include object field "${field}"` };
  }

  const validation = CheckFieldEntrySchema.safeParse(entry);
  if (!validation.success) {
    const msg = `Field "${field}" schema validation failed: ${validation.error.message}`;
    logPipeline(`  [LLM] ${msg}`);
    return { results: [], error: msg };
  }

  const data = validation.data;

  return {
    results: [{
      name: field,
      type: checkDef.type.kind === "number" ? "numerical" as const : "qualitative" as const,
      finding: data.value,
      verdict: data.verdict,
      citationRef: data.citationRef,
      sourceCitation: data.sourceCitation,
    }],
  };
}

function deriveRegulation(clause: string, regulationIds: string[]): string {
  if (regulationIds.length === 1) return regulationIds[0];
  for (const id of regulationIds) {
    if (clause.startsWith(id) || clause.includes(id)) return id;
  }
  if (regulationIds.length > 0) return regulationIds[0];
  return "";
}
