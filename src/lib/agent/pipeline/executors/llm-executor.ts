import { streamText, tool } from "ai";
import { createModel } from "@/lib/agent/llm/factory";
import { runScript } from "./script-runner";
import { ComplianceCheckSchema, type ComplianceCheckInput } from "@/lib/agent/shared/schemas";
import { executeComplianceCheck } from "@/lib/agent/pipeline/builtins";
import type { ExecutableStep } from "../types";
import type { ParsedCheck } from "@/lib/agent/loading/skill/check-parser";
import type { PipelineContext, CheckResult } from "../pipeline-context";
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
- Then output a JSON code block with the structured result containing the field value and citations.
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
    const userMessage = `Execute step ${step.number}: ${step.title}. Write a narrative analysis starting with "### ${humanField}". Then output a JSON code block with this exact structure:\n\`\`\`json\n{"${step.title.replace("Evaluate: ", "")}": {"value": "narrative text with citations", "sourceRef": 1, "chunkRef": "S1.c1", "citationRef": "R37.1b", "verdict": "PASS"}}\n\`\`\``;

    const result = streamText({
      model: createModel(),
      system: toolSystemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
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

    // Always parse narrative from LLM text output
    const textResults = ctx.skill.checks.length > 0
      ? extractCheckResultsFromText(fullText, ctx.skill.checks, step.number)
      : [];

    if (collectedToolRuns.length > 0) {
      // Build CheckResults from tool output, merge narrative from text
      const allResults = collectedToolRuns.flatMap(run => run.outputs);
      const mergedResults = allResults.map((r, i) => {
        const name = (r.name as string) ?? `check-${i + 1}`;
        const narrative = textResults.find(tr => tr.name === name);
        return {
          name,
          type: "numerical" as const,
          regulation: narrative?.regulation ?? (r.regulation as string) ?? "",
          clause: narrative?.clause ?? (r.clause as string) ?? "",
          finding: narrative?.finding ?? `${r.name}: ${r.value} ${r.comparison} → ${r.status}`,
          verdict: r.status === "pass" ? ("PASS" as const) : ("FAIL" as const),
          citationRef: narrative?.citationRef ?? findCitationRef(ctx, r),
          sourceRef: narrative?.sourceRef,
          chunkRef: narrative?.chunkRef,
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

function findCitationRef(ctx: PipelineContext, result: Record<string, unknown>): string {
  const clauseStr = (result.clause as string) ?? "";
  const regulation = deriveRegFromClause(clauseStr) || (result.regulation as string) || (ctx.skill.regulationIds[0] ?? "");

  let clauseNum = "";
  const clauseIdx = clauseStr.indexOf("§");
  if (clauseIdx !== -1) {
    clauseNum = clauseStr.substring(clauseIdx + 1);
  } else {
    const firstDot = clauseStr.indexOf(".");
    if (firstDot !== -1) {
      clauseNum = clauseStr.substring(firstDot + 1);
    }
  }

  if (clauseNum) {
    for (const entry of ctx.palette.getCitationPalette()) {
      if (entry.regulation === regulation && entry.clause === clauseNum) {
        return entry.id;
      }
    }
  }

  for (const entry of ctx.palette.getCitationPalette()) {
    if (entry.regulation === regulation) {
      return entry.id;
    }
  }

  return regulation ? `${regulation}.0` : "";
}

function deriveRegFromClause(clause: string): string {
  if (!clause) return "";
  const dotIdx = clause.indexOf(".");
  return dotIdx !== -1 ? clause.substring(0, dotIdx) : "";
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
  parts.push("Every factual value MUST end with citation markers like [R48.5.11] or [S1].");
  parts.push("For numerical checks, use the compliance-check tool to validate. Include the tool result.");
  parts.push("For conditional checks, evaluate the condition first before including the result.");
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
      .map((c) => `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef}]`)
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
    parts.push("When referencing regulations in your output, use the following format:");
    parts.push("- `[R48.5.11]` for regulation citations (regulation + clause, e.g., [R48.5.11], [R112.5.3])");
    parts.push("- `[SN]` for source file citations (e.g., [S1] for the first uploaded file)");
    parts.push("Place these markers at the end of each claim or value they support.");
    parts.push("Every factual claim MUST end with the appropriate citation marker.");
    if (citationPalette.length > 0) {
      const available = citationPalette.map(e => `[${e.id}]`).join(", ");
      parts.push(`Available regulation markers: ${available}`);
    }
  }

  const hasChunks = ctx.files.getFiles().some(f => f.chunks && f.chunks.length > 0);
  if (hasChunks) {
    parts.push("");
    parts.push("# Source Chunk References (chunkRef)");
    parts.push("Source text above is annotated with chunk IDs like [S1.c3]. Use these in claims:");
    parts.push("- `chunkRef` field: the specific source chunk that backs this claim (e.g., \"S1.c3\")");
    parts.push("- `sourceRef` field: the source file number (e.g., 1 for S1)");
    parts.push("- `citationRef` field: the regulation marker only (e.g., \"R48.5.11\") — do NOT put source refs here");
    parts.push("Every factual claim MUST include a chunkRef pointing to the source chunk that supports it.");
  }

  return parts.join("\n");
}

/**
 * Parse the LLM's JSON output and extract a CheckResult for the current step.
 *
 * Expected JSON format (per field):
 *   {"field_name": {"value": "narrative...", "sourceRef": 1, "chunkRef": "S1.c1", "citationRef": "R37.1b", "verdict": "PASS"}}
 */
function extractCheckResultsFromText(
  text: string,
  checks: ParsedCheck[],
  stepNumber: number
): CheckResult[] {
  let cleaned = text.trim();
  const startFence = cleaned.indexOf("```");
  if (startFence !== -1) {
    const endFence = cleaned.indexOf("```", startFence + 3);
    if (endFence !== -1) {
      cleaned = cleaned.substring(startFence + 3, endFence).trim();
      const jsonIdx = cleaned.indexOf("json");
      if (jsonIdx === 0) cleaned = cleaned.substring(4).trim();
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const checkDef = checks[stepNumber - 1];
  if (!checkDef) return [];

  const field = checkDef.field;
  const entry = (parsed as Record<string, unknown>)[field];
  if (!entry || typeof entry !== "object") return [];

  const e = entry as Record<string, unknown>;
  const value = typeof e.value === "string" ? e.value : "";
  const sourceRef = typeof e.sourceRef === "number" ? e.sourceRef : undefined;
  const chunkRef = typeof e.chunkRef === "string" ? e.chunkRef : "";
  const citationRef = typeof e.citationRef === "string" ? e.citationRef : "";
  const verdictRaw = typeof e.verdict === "string" ? e.verdict : "PASS";
  const verdict = verdictRaw.toUpperCase() === "FAIL" ? "FAIL" as const : "PASS" as const;

  const clause = checkDef.clause ?? "";
  const regulation = deriveRegFromClause(clause);

  if (!value) return [];

  return [{
    name: field,
    type: checkDef.type.kind === "number" ? "numerical" as const : "qualitative" as const,
    regulation,
    clause,
    finding: value,
    verdict,
    citationRef,
    sourceRef,
    chunkRef,
  }];
}

function deriveRegulation(clause: string, regulationIds: string[]): string {
  if (regulationIds.length === 1) return regulationIds[0];
  for (const id of regulationIds) {
    if (clause.startsWith(id) || clause.includes(id)) return id;
  }
  if (regulationIds.length > 0) return regulationIds[0];
  return "";
}
