import { streamText, tool } from "ai";
import { z } from "zod";
import { createModel } from "../../llm/factory";
import { runScript } from "./script-runner";
import { ComplianceCheckSchema } from "../../shared/schemas";
import { executeComplianceCheck } from "../../pipeline/builtins";
import { buildSystemPrompt, buildUserMessage } from "../../pipeline/prompts";
import type { ExecutableStep } from "../types";
import type { ParsedCheck } from "../../loading/skill/check-parser";
import type { PipelineContext, CheckResult, CitationPaletteEntry } from "../pipeline-context";
import type { StepResult } from "../types";
import type { ToolCallRecord } from "../../shared/types";
import { logPipeline, truncate } from "../logger";

export async function executeLlmToolStep(
  step: ExecutableStep,
  ctx: PipelineContext,
  previousError?: string,
  revisionContext?: { userFeedback: string }
): Promise<StepResult> {
  try {
    const scripts = ctx.skill.scripts;

    const isRevision = !!revisionContext;
    const contextSummary = buildContextSummary(ctx, isRevision);
    const systemPrompt = buildSystemPrompt(contextSummary, previousError);

    logPipeline(`  [LLM+TOOL] step=${step.number} promptLen=${systemPrompt.length}chars scripts=${scripts.length}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    const currentCheck = ctx.skill.checks[step.number - 1];
    const stepNeedsTool = currentCheck?.type.kind === "number";
    if (stepNeedsTool) {
      tools.checkCompliance = tool({
        description: "Run a numerical compliance check. Provide the extracted value, the constraint limit, and the comparison operator. Optionally pass rounding (number of decimal places) to round the value before comparing.",
        inputSchema: ComplianceCheckSchema,
        execute: async (input) => {
          const { value, limit, operator, rounding } = input as {
            value: number;
            limit: number | string;
            operator: string;
            rounding?: number | string;
          };
          logPipeline(`  [TOOL EXEC] compliance-check: ${value} ${operator} ${limit}${rounding !== undefined ? ` round=${rounding}` : ""}`);
          const result = executeComplianceCheck(value, limit, operator, rounding);
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

    let toolCalled = false;

    const perCheckResults: {
      name: string;
      value: number;
      limit: number | string;
      comparison: string;
      status: "pass" | "fail";
      note?: string;
    }[] = [];

    const attentionQuery = revisionContext?.userFeedback ?? step.attention ?? step.title.replace(/^Evaluate: /, "");
    const fileChunks = ctx.files.searchRelevantChunks(ctx.sessionId, attentionQuery);

    const userMessage = buildUserMessage(
      step.number,
      step.title,
      step.instructions,
      fileChunks,
      revisionContext
        ? {
            userFeedback: revisionContext.userFeedback,
            previousOutput: (() => {
              const prevOutput = ctx.steps.read(step.number);
              return typeof prevOutput === "string" ? prevOutput : JSON.stringify(prevOutput, null, 2);
            })(),
          }
        : undefined,
    );

    const result = streamText({
      model: createModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      ...(step.temperature !== undefined ? { temperature: step.temperature } : {}),
      onStepFinish: (event) => {
        logPipeline(`  [LLM+TOOL] step=${step.number} onStepFinish: toolResults=${event.toolResults?.length ?? 0} textLen=${(event.text ?? "").length}`);
        if (!event.toolResults?.length) return;
        for (const tr of event.toolResults) {
          const input = tr.input as { value: number; limit: number | string; operator: string };
          const output = tr.output as { status?: string; comparison?: string; note?: string };
          const status = output.status === "pass" ? "pass" : "fail";
          const comparison = output.comparison ?? `${input.value} ${input.operator} ${input.limit}`;

          toolCalled = true;

          const checkName = currentCheck?.field ?? "check";
          const checkStatus = status === "pass" ? "success" : "error";
          const existingToolCalls = (ctx.steps.getRaw("toolCalls") as ToolCallRecord[]) ?? [];
          existingToolCalls.push({
            step: Object.keys(ctx.steps.entries()).length + 1,
            toolName: `numerical check - ${checkName}`,
            summary: comparison,
            status: checkStatus,
          });
          ctx.steps.setRaw("toolCalls", existingToolCalls);

          perCheckResults.push({
            name: checkName,
            value: input.value,
            limit: input.limit,
            comparison,
            status,
            note: output.note ?? undefined,
          });
        }
      },
    });

    const tokens: string[] = [];
    for await (const token of result.textStream) {
      tokens.push(token);
    }
    const fullText = tokens.join("");

    logPipeline(`  [LLM+TOOL] step=${step.number} finalText=${fullText.length}chars preview=${truncate(fullText, 150)}`);

    const textResults = ctx.skill.checks.length > 0
      ? extractCheckResultsFromText(fullText, ctx.skill.checks, step.number)
      : [];

    if (toolCalled) {
      const run = perCheckResults[0];
      const palette = ctx.palette.getCitationPalette();
      const narrative = textResults.find(tr => tr.name === currentCheck?.field);
      const clause = currentCheck?.clause ?? "";

      const citRef = narrative?.citationRef && narrative.citationRef.length > 0
        ? narrative.citationRef
        : resolveCitationRef(palette, clause);
      let srcCit = narrative?.sourceCitation ?? [];

      if (!narrative?.citationRef || narrative.citationRef.length === 0) {
        logPipeline(`  [LLM+TOOL] ⚠ step ${step.number}: citationRef empty for "${currentCheck?.field}" — fell back to clause "${clause}"`);
      }

      if (!narrative || srcCit.length === 0) {
        const extracted = fileChunks ? extractChunkIdsFromFileChunks(fileChunks) : [];
        if (extracted.length > 0) {
          srcCit = extracted;
          logPipeline(`  [LLM+TOOL] ⚠ step ${step.number}: sourceCitation empty for "${currentCheck?.field}" — backfilled from available chunks: ${extracted.join(", ")}`);
        }
      }

      if (!narrative?.sourceCitation || narrative.sourceCitation.length === 0) {
        if (srcCit.length === 0) {
          logPipeline(`  [LLM+TOOL] ⚠ step ${step.number}: sourceCitation empty for "${currentCheck?.field}" and no chunks available`);
        }
      }

      ctx.checks.addResults([{
        name: currentCheck?.field ?? "check",
        type: "numerical" as const,
        finding: narrative?.finding ?? `${currentCheck?.field}: ${run.value} ${run.comparison} → ${run.status}`,
        verdict: run.status === "pass" ? ("PASS" as const) : ("FAIL" as const),
        citationRef: citRef,
        sourceCitation: srcCit,
        toolResult: {
          value: run.value,
          limit: run.limit as number,
          comparison: run.comparison,
          status: run.status,
        },
      }]);
      logPipeline(`  [LLM+TOOL] merged CheckResult from tool + narrative for "${currentCheck?.field}"`);
    } else if (textResults.length > 0) {
      for (const result of textResults) {
        if (result.citationRef.length === 0) {
          const clause = currentCheck?.clause;
          if (clause) {
            logPipeline(`  [LLM] ⚠ step ${step.number}: citationRef empty for "${result.name}" — filling from check clause "${clause}"`);
            result.citationRef = [clause];
          } else {
            logPipeline(`  [LLM] ⚠ step ${step.number}: citationRef empty for "${result.name}" and no clause available`);
          }
        }
        if (result.sourceCitation.length === 0) {
          logPipeline(`  [LLM] ⚠ step ${step.number}: sourceCitation empty for "${result.name}"`);
        }
      }
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

function buildContextSummary(ctx: PipelineContext, excludeCheckResults = false): string {
  const parts: string[] = [];

  const citationSummary = ctx.palette.formatContextSummary();
  if (citationSummary) parts.push(citationSummary);

  if (!excludeCheckResults && ctx.checks.getResults().length > 0) {
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

function extractChunkIdsFromFileChunks(fileChunks: string): string[] {
  const ids = new Set<string>();
  const regex = /\[(S\d+(?:\.\S+?))\]/g;
  let match;
  while ((match = regex.exec(fileChunks)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}
