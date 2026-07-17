import { streamText, tool, type ToolSet } from "ai";
import { z } from "zod";
import { createModel } from "../../llm/factory";
import { runScript } from "./script-runner";
import { ComplianceCheckSchema } from "../../shared/schemas";
import { executeComplianceCheck } from "../../pipeline/builtins";
import { getRegulationApi } from "../../knowledge/regulation-api";
import { buildSystemPrompt, buildUserMessage } from "../../pipeline/prompts";
import type { ExecutableStep } from "../types";
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
    const regulationSection = formatRegulationSection(ctx);
    const systemPrompt = buildSystemPrompt(regulationSection, previousError);

    logPipeline(`  [LLM+TOOL] step=${step.number} promptLen=${systemPrompt.length}chars`);

    const abortController = new AbortController();
    const llmTimeout = setTimeout(() => abortController.abort("LLM request timed out"), 120_000);

    const scripts = ctx.skill.scripts;
    const tools: ToolSet = {};
    let toolCalled = false;

    const perCheckResults: {
      name: string;
      value: number;
      limit: number | string;
      comparison: string;
      status: "pass" | "fail";
      note?: string;
    }[] = [];

    const currentCheck = ctx.skill.checks[step.number - 1];
    const stepNeedsTool = currentCheck?.type.kind === "number";
    if (stepNeedsTool) {
      tools.checkCompliance = tool({
        description: "Run a numerical compliance check. Provide the extracted value, the constraint limit, and the comparison operator. Optionally pass rounding to round the value before comparing.",
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

    // Always available: fetch full clause text from regulation DB
    tools.get_clause = tool({
      description: "Get the full text of a regulation clause by its ID (e.g. R48.6.2). Use this before citing a clause to get the exact wording.",
      inputSchema: z.object({
        ref: z.string().describe("Clause reference, e.g. R48.6.2"),
      }),
      execute: async (input) => {
        const { ref } = input as { ref: string };
        logPipeline(`  [TOOL EXEC] get_clause: ${ref}`);
        const dot = ref.indexOf(".");
        if (dot === -1) return { error: `Invalid clause ref: ${ref}` };
        const regCode = ref.substring(0, dot);
        const clauseNum = ref.substring(dot + 1);
        const api = await getRegulationApi();
        const result = await api.getClause({ regulationCode: regCode, clauseNumber: clauseNum });
        if (!result.success || !result.data) {
          logPipeline(`  [TOOL EXEC] get_clause: not found`);
          return { error: `Clause ${ref} not found` };
        }
        const text = result.data.title
          ? `\xA7${result.data.number} ${result.data.title}\n${result.data.text}`
          : `\xA7${result.data.number}\n${result.data.text}`;
        logPipeline(`  [TOOL EXEC] get_clause: ${text.slice(0, 120)}...`);
        return { ref, text };
      },
    });

    for (const script of scripts) {
      if (script.name === "compliance-check") continue;
      logPipeline(`  [TOOL] registering generic tool "${script.name}"`);
      tools[script.name] = tool({
        description: script.desc || `Run ${script.name} script`,
        inputSchema: z.any(),
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

    const attentionQuery = revisionContext?.userFeedback ?? step.attention ?? step.title.replace(/^Evaluate: /, "");
    const fileChunks = ctx.files.searchRelevantChunks(ctx.sessionId, attentionQuery);
    logPipeline(`  [LLM+TOOL] step=${step.number} attentionQuery="${attentionQuery}" fileChunks=${fileChunks.length}chars`);

    const dependencyContext = buildDependencyContext(ctx, step.number);
    const chatPrefix = ctx.chatContext ? `${ctx.chatContext}\n\n` : "";
    const userMessage = chatPrefix + buildUserMessage(
      step.number,
      step.title,
      step.instructions,
      fileChunks,
      dependencyContext,
      revisionContext
        ? {
            userFeedback: revisionContext.userFeedback,
            previousOutput: (() => {
              const raw = ctx.steps.read(step.number);
              if (!raw) throw new Error("Revision requires previous step output");
              return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
            })(),
          }
        : undefined
    );

    logPipeline(`  [LLM+TOOL] step=${step.number} FINAL PROMPT: systemPrompt=${systemPrompt.length}chars userMessage=${userMessage.length}chars`);

    let accumulatedPromptTokens = 0;
    let accumulatedCompletionTokens = 0;

    const result = streamText({
      model: createModel({ cache: true }),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: ({ steps }) => {
        const lastStep = steps[steps.length - 1];
        return !lastStep || lastStep.toolCalls.length === 0 || steps.length >= 10;
      },
      maxRetries: 3,
      abortSignal: abortController.signal,
      ...(step.temperature !== undefined ? { temperature: step.temperature } : {}),
      onStepFinish: (event) => {
        if (event.usage) {
          accumulatedPromptTokens += event.usage.inputTokens ?? 0;
          accumulatedCompletionTokens += event.usage.outputTokens ?? 0;
        }
        logPipeline(`  [LLM+TOOL] step=${step.number} onStepFinish: toolResults=${event.toolResults?.length ?? 0}`);
        if (!event.toolResults?.length) return;
        for (const tr of event.toolResults) {
          if (tr.toolName !== "checkCompliance") continue;
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
    try {
      for await (const token of result.textStream) {
        tokens.push(token);
      }
    } finally {
      clearTimeout(llmTimeout);
    }

    const fullText = tokens.join("");
    const finalUsage = await result.usage;

    const inputTokens = accumulatedPromptTokens || finalUsage?.inputTokens || 0;
    const outputTokens = accumulatedCompletionTokens || finalUsage?.outputTokens || 0;

    logPipeline(`  [LLM+TOOL] step=${step.number} fullText=${fullText.length}chars preview=${truncate(fullText, 150)}`);

    const finalObject = parseLlmOutput(fullText);
    if (!finalObject) {
      logPipeline(`  [LLM+TOOL] ⚠ step ${step.number}: no parseable JSON`);
      return {
        success: false,
        error: `Step ${step.number}: LLM output not parseable. Full text: ${truncate(fullText, 300)}`,
        errorCode: "JSON_PARSE_FAILED",
      };
    }

    const checkResult = await buildCheckResult({
      finalObject,
      toolCalled,
      perCheckResults,
      ctx,
      step,
      fileChunks,
    });
    ctx.checks.addResults([checkResult]);

    storeOutput(ctx, step.number, fullText);
    return {
      success: true,
      contextSnapshot: { systemPrompt, userMessage, contextSummary: "" },
      streamedTokens: tokens,
      usage: {
        promptTokens: inputTokens ?? 0,
        completionTokens: outputTokens ?? 0,
      },
      toolResults: perCheckResults.length > 0 ? perCheckResults : undefined,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      error: `Step ${step.number} tool LLM error: ${isTimeout ? "request timed out" : err instanceof Error ? err.message : String(err)}`,
      errorCode: isTimeout ? "TIMEOUT" : "LLM_ERROR",
    };
  }
}

// ── Helpers ──

export function parseLlmOutput(text: string): { value: string; sourceCitation: string[]; citationRef: string[]; verdict: string } | null {
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
    return null;
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) return null;

  // Try flat format: { value, sourceCitation, citationRef, verdict }
  if (typeof parsed.value === "string" && typeof parsed.verdict === "string") {
    return {
      value: parsed.value,
      sourceCitation: Array.isArray(parsed.sourceCitation) ? parsed.sourceCitation.filter(s => typeof s === "string") as string[] : [],
      citationRef: Array.isArray(parsed.citationRef) ? parsed.citationRef.filter(s => typeof s === "string") as string[] : [],
      verdict: parsed.verdict,
    };
  }

  // Fallback: nested format { "field_name": { value, sourceCitation, citationRef, verdict } }
  const nested = Object.values(parsed).find(
    (v): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).value === "string" && typeof (v as Record<string, unknown>).verdict === "string"
  );
  if (nested) {
    return {
      value: nested.value as string,
      sourceCitation: Array.isArray(nested.sourceCitation) ? nested.sourceCitation.filter(s => typeof s === "string") as string[] : [],
      citationRef: Array.isArray(nested.citationRef) ? nested.citationRef.filter(s => typeof s === "string") as string[] : [],
      verdict: nested.verdict as string,
    };
  }

  return null;
}

function storeOutput(ctx: PipelineContext, stepNumber: number, text: string): void {
  let trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch) trimmed = fenceMatch[1]!.trim();
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

function formatRegulationSection(ctx: PipelineContext): string {
  const parts: string[] = [];
  const summaries = ctx.palette.getSummaries();
  if (summaries.length > 0) {
    parts.push("# Available Regulations");
    for (const s of summaries) {
      const clauses = s.clauseIndex
        .map((c) => (c.title ? `\xA7${c.number} — ${c.title}` : `\xA7${c.number}`))
        .join(", ");
      parts.push(`${s.code} — ${s.title}\n  Clauses: ${clauses}`);
    }
  }
  return parts.join("\n\n");
}

function buildDependencyContext(ctx: PipelineContext, stepNumber: number): string {
  const currentCheck = ctx.skill.checks[stepNumber - 1];
  if (!currentCheck?.dependsOn) return "";

  const allResults = ctx.checks.getResults();
  const depField = currentCheck.dependsOn;

  const relevant = allResults.filter((r) => r.name.startsWith(depField));
  if (relevant.length === 0) return "";

  const lines = relevant.map(
    (c) => `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef.join(", ")}]`
  );
  return `Dependent Check Results:\n${lines.join("\n")}`;
}

function extractChunkIdsFromFileChunks(fileChunks: string): string[] {
  const ids = new Set<string>();
  const regex = /\[(S\d+(?:\.\S+?))\]/g;
  let match;
  while ((match = regex.exec(fileChunks)) !== null) {
    ids.add(match[1]!);
  }
  return [...ids];
}

interface BuildCheckResultParams {
  finalObject: { value: string; sourceCitation: string[]; citationRef: string[]; verdict: string };
  toolCalled: boolean;
  perCheckResults: { name: string; value: number; limit: number | string; comparison: string; status: "pass" | "fail"; note?: string }[];
  ctx: PipelineContext;
  step: ExecutableStep;
  fileChunks: string;
}

async function buildCheckResult(params: BuildCheckResultParams): Promise<CheckResult> {
  const { finalObject, toolCalled, perCheckResults, ctx, step, fileChunks } = params;
  const currentCheck = ctx.skill.checks[step.number - 1];
  const checkDef = ctx.skill.checks[step.number - 1];
  const checkName = currentCheck?.field ?? "check";
  const checkType = checkDef?.type.kind === "number" ? "numerical" as const : "qualitative" as const;
  const clause = currentCheck?.clause ?? "";
  const palette = ctx.palette.getCitationPalette();

  let citRef = resolveCitations(finalObject.citationRef, palette, clause);
  citRef = await lazyResolveCitations(citRef, ctx);
  const srcCit = resolveSourceCitations(finalObject.sourceCitation, fileChunks);

  if (toolCalled && perCheckResults.length > 0) {
    const run = perCheckResults[0]!;
    logPipeline(`  [LLM+TOOL] merged CheckResult from tool "${checkName}"`);
    return {
      name: checkName,
      type: "numerical" as const,
      finding: finalObject.value,
      verdict: run.status === "pass" ? "PASS" as const : "FAIL" as const,
      citationRef: citRef,
      sourceCitation: srcCit,
      toolResult: {
        value: run.value,
        limit: run.limit as number,
        comparison: run.comparison,
        status: run.status,
      },
    };
  }

  logPipeline(`  [LLM+TOOL] extracted CheckResult from structured output "${checkName}"`);
  return {
    name: checkName,
    type: checkType,
    finding: finalObject.value,
    verdict: finalObject.verdict.toUpperCase().startsWith("FAIL") ? "FAIL" as const : "PASS" as const,
    citationRef: citRef,
    sourceCitation: srcCit,
  };
}

function resolveCitations(
  llmRefs: string[],
  palette: readonly CitationPaletteEntry[],
  clause: string,
): string[] {
  if (llmRefs.length > 0) return llmRefs;
  const match = palette.find(e => e.clause === clause || e.id === clause);
  if (match) {
    logPipeline(`  [LLM+TOOL] ⚠ citationRef empty — fell back to "${match.regulation}"`);
    return [match.regulation];
  }
  if (clause) {
    logPipeline(`  [LLM+TOOL] ⚠ citationRef empty — using clause "${clause}"`);
    return [clause];
  }
  return [];
}

export async function lazyResolveCitations(
  refs: string[],
  ctx: PipelineContext,
): Promise<string[]> {
  const palette = ctx.palette.getCitationPalette();
  const missing: string[] = [];
  for (const ref of refs) {
    if (!palette.some((e) => e.id === ref)) missing.push(ref);
  }
  if (missing.length === 0) return refs;

  await ctx.palette.resolveMissingRefs(missing);
  return refs;
}

function resolveSourceCitations(
  llmSources: string[],
  fileChunks: string,
): string[] {
  if (llmSources.length > 0) return llmSources;
  const extracted = fileChunks ? extractChunkIdsFromFileChunks(fileChunks) : [];
  if (extracted.length > 0) {
    logPipeline(`  [LLM+TOOL] ⚠ sourceCitation empty — backfilled from chunks: ${extracted.join(", ")}`);
    return extracted;
  }
  return [];
}
