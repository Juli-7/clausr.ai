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
You are an expert in executing information handling jobs in general.

# Instructions
- Retrieve relevant chunks according to the step description provided in the user's message.
- When the step type is "number", you MUST call the available compliance-check tool to execute compliance checks.
- Output ONLY the JSON format specified in # Output Format below — do not write any prose outside the JSON block.

# Session Context
${contextSummary}
${retryContext}

# Output Format
\`\`\`json
{"{step_name}": {"value": "narrative assessment with citation markers like [S1.c1] and [R48.5.11]", "sourceCitation": ["S1.c1", "S1.c2"], "citationRef": ["R48.5.11"], "verdict": "PASS"}}
\`\`\`

The JSON MUST include all fields:
- value: string — your narrative assessment with citation markers
- sourceCitation: string[] — source chunk references like "S1.c3"
- citationRef: string[] — exact regulation references like "R48.5.11"
- verdict: string — "PASS" or "FAIL"

# Citation Format
Every field entry in the JSON block MUST include these two arrays:
- \`citationRef\`: regulation references — use the EXACT IDs from Available Citations (e.g., "R48.5.11")
- \`sourceCitation\`: source chunk IDs — use the EXACT chunk IDs from source palette (e.g., ["S1.c3", "S2.c1"])
Arrays can be empty if not applicable, but must be present.`;

    logPipeline(`  [LLM+TOOL] step=${step.number} promptLen=${systemPrompt.length}chars scripts=${scripts.length}`);

    const tools: Record<string, any> = {};

    // Register compliance-check tool only when current step is numerical
    const currentCheck = ctx.skill.checks[step.number - 1];
    const stepNeedsTool = currentCheck && (currentCheck.type.kind === "number" || currentCheck.constraint);
    if (stepNeedsTool) {
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

    const fileChunks = ctx.files.searchRelevantChunks(ctx.sessionId, step.instructions);
    const userMessage = `### Step ${step.number}: ${step.title}\n\n${step.instructions}` +
      (fileChunks ? `\n\n# Available Chunks\n${fileChunks}` : "");

    const result = streamText({
      model: createModel(),
      system: systemPrompt,
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
    for await (const token of result.textStream) {
      tokens.push(token);
    }
    const fullText = tokens.join("");

    logPipeline(`  [LLM+TOOL] step=${step.number} finalText=${fullText.length}chars preview=${truncate(fullText, 150)}`);

    // Retry when tool should have been called but wasn't
    if (stepNeedsTool && collectedToolRuns.length === 0) {
      logPipeline(`  [LLM+TOOL] tool was NOT called for numerical step — will retry with error context`);
      return {
        success: false,
        error: `Step ${step.number}: This step requires the compliance-check tool (type: ${currentCheck.type.kind}) but it was not called.`,
        errorCode: "LLM_ERROR",
      };
    }

    // Always parse narrative from LLM text output
    const textResults = ctx.skill.checks.length > 0
      ? extractCheckResultsFromText(fullText, ctx.skill.checks, step.number)
      : [];

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
    } else if (fullText) {
      logPipeline(`  [LLM+TOOL] ⚠ step ${step.number}: LLM produced text but no parseable JSON results`);
    } else {
      logPipeline(`  [LLM+TOOL] ⚠ step ${step.number}: no tool calls and no text output — check may be missing`);
    }

    storeOutput(ctx, step.number, fullText);
    return {
      success: true,
      contextSnapshot: { systemPrompt, userMessage, contextSummary },
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
  let trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch) trimmed = fenceMatch[1].trim();
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

function resolveCitationRef(_palette: readonly CitationPaletteEntry[], clause: string): string[] {
  if (!clause) return [];
  return [clause];
}

function buildContextSummary(ctx: PipelineContext): string {
  const parts: string[] = [];

  const citationSummary = ctx.palette.formatContextSummary();
  if (citationSummary) parts.push(citationSummary);

  if (ctx.checks.getResults().length > 0) {
    const summary = ctx.checks.getResults()
      .map((c) => `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef.join(", ")}]`)
      .join("\n");
    parts.push(`Check Results:\n${summary}`);
  }

  const sourcePalette = ctx.files.getSourcePalette();
  if (sourcePalette.length > 0) {
    const summary = ctx.palette.formatSourceSummary(sourcePalette);
    if (summary) parts.push(summary);
  }

  const latestStep = ctx.steps.latest();
  if (latestStep) {
    const text = typeof latestStep.value === "string"
      ? latestStep.value
      : JSON.stringify(latestStep.value, null, 2);
    parts.push(`Previous Step Output:\n[Step ${latestStep.stepNumber} Output]\n${text.slice(0, 500)}`);
  }

  if (ctx.previousTurns.length > 0) {
    const summary = ctx.previousTurns
      .map((t) => `Turn ${t.turnNumber}: ${t.reasoningSummary}`)
      .join("\n");
    parts.push(`Previous Turns:\n${summary}`);
  }

  return parts.join("\n\n");
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
  verdict: z.string(),
});

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
  const validation = CheckFieldEntrySchema.safeParse(e);
  if (!validation.success) {
    logPipeline(`  [LLM] invalid check field entry for "${field}": ${validation.error.message}`);
    return [];
  }

    const data = validation.data;
  const verdict = data.verdict.toUpperCase() === "FAIL" ? "FAIL" as const : "PASS" as const;

  if (!data.value) return [];

  return [{
    name: field,
    type: checkDef.type.kind === "number" ? "numerical" as const : "qualitative" as const,
    finding: data.value,
    verdict,
    citationRef: data.citationRef,
    sourceCitation: data.sourceCitation,
  }];
}
