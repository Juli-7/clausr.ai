import { getResponseCount, addAssistantResponse } from "@/lib/agent/memory/repository";
import { buildClauseTextsFromPalette } from "../clause-texts";
import { postValidate } from "../post-validate";
import { AgentResponseSchema } from "@/lib/agent/schemas";
import type { AgentResponse } from "@/lib/agent/types";
import type { ExecutableStep } from "../step-executor";
import { logPipeline, truncate } from "../logger";
import type { PipelineContext } from "../pipeline-context";

export interface FinalizePhaseResult {
  response: AgentResponse;
  validationErrors: ReturnType<typeof postValidate>;
  confidence: ReturnType<typeof computeObjectiveConfidence>;
}

export async function finalizePhase(
  ctx: PipelineContext,
  steps: ExecutableStep[],
  sessionId: string
): Promise<FinalizePhaseResult> {
  logPipeline("→ AUTO: computing verdict");
  const verdict = ctx.checks.computeVerdict();
  ctx.report.setVerdict(verdict);
  logPipeline(`  ✓ auto verdict=${verdict} (${ctx.checks.getResults().length} checks, ${ctx.checks.failureCount} failures)`);

  logPipeline("→ AUTO: computing confidence");
  const confidence = computeObjectiveConfidence(ctx);
  logPipeline(`  ✓ confidence=${confidence.score.toFixed(1)}% (ocr=${confidence.ocrConfidence.toFixed(0)}% data=${confidence.dataCompleteness.toFixed(0)}% llm×${confidence.llmMultiplier.toFixed(2)})${confidence.needsExpert ? " NEEDS_EXPERT" : ""}`);

  const validationErrors = postValidate(ctx, steps);

  if (validationErrors.length > 0) {
    logPipeline(`⚠ POST-VALIDATION found ${validationErrors.length} issue(s): ${validationErrors.map(e => e.message).join("; ")}`);
  } else {
    logPipeline("✓ post-validation passed");
  }

  const round = getResponseCount(sessionId) + 1;

  const clauseTexts = buildClauseTextsFromPalette([...ctx.palette.getCitationPalette()]);

  const responseData: Record<string, unknown> = {
    content: formatContent(ctx, steps),
    reasoning: buildReasoningFromSteps(ctx, steps),
    citations: [...ctx.checks.getCitations()],
    sourceCitations:
      ctx.checks.getSourceCitations().length > 0
        ? [...ctx.checks.getSourceCitations()]
        : undefined,
    round,
    sessionId,
    verdict: ctx.report.getVerdict() ?? "PASS",
    clauseTexts: Object.keys(clauseTexts).length > 0
      ? clauseTexts
      : undefined,
    sections: ctx.report.getSections() ?? undefined,
  };

  const toolCalls = ctx.steps.getRaw("toolCalls");
  if (toolCalls) {
    responseData.toolCalls = toolCalls;
    logPipeline(`tool calls in response: ${JSON.stringify(toolCalls)}`);
  }

  const reasoningSteps = buildReasoningSteps(ctx, steps);
  if (reasoningSteps.length > 0) {
    responseData.reasoningSteps = reasoningSteps;
  }

  if (ctx.checks.getClaims().length > 0) {
    responseData.claims = [...ctx.checks.getClaims()];
  }

  responseData.confidence = confidence;

  if (validationErrors.length > 0) {
    responseData.validationErrors = validationErrors;
  }

  logPipeline(`final response: content=${(responseData.content as string).length}chars citations=${(responseData.citations as any[])?.length} verdict=${responseData.verdict}`);

  const agentResponse = AgentResponseSchema.parse(responseData);
  addAssistantResponse(sessionId, agentResponse);

  logPipeline(`=== PIPELINE DONE === round=${round}`);

  return { response: agentResponse, validationErrors, confidence };
}

// ── Helpers ──

function formatContent(
  ctx: PipelineContext,
  steps: ExecutableStep[]
): string {
  const sections = ctx.report.getSections();
  if (sections) {
    const parts: string[] = [];
    for (const [sectionId, value] of Object.entries(sections)) {
      if (typeof value === "string") {
        parts.push(`## ${sectionId}\n${value}`);
      } else if (typeof value === "object" && value !== null) {
        const tableRows = Object.entries(value)
          .map(([k, v]) => `| ${k} | ${v} |`)
          .join("\n");
        parts.push(`## ${sectionId}\n| Field | Value |\n| --- | --- |\n${tableRows}`);
      }
    }
    return parts.join("\n\n");
  }

  const llmSteps = steps.filter(
    (s) => s.type === "llm" || s.type === "llm+tool"
  );
  const lastLlm = llmSteps[llmSteps.length - 1];
  if (lastLlm) {
    const output = ctx.steps.read(lastLlm.number);
    if (typeof output === "string") return output;
    if (output) return JSON.stringify(output, null, 2);
  }

  return "Assessment not available.";
}

function computeObjectiveConfidence(ctx: PipelineContext): {
  score: number;
  ocrConfidence: number;
  dataCompleteness: number;
  llmMultiplier: number;
  llmReasoning: string;
  needsExpert: boolean;
} {
  const avgOcr = ctx.files.averageOcrConfidence();
  const ocrPenalty = (1 - avgOcr / 100) * 30;

  let pdfPenalty = 0;
  for (const f of ctx.files.getFiles()) {
    if (f.extractorUsed === "pdf-parse") pdfPenalty = Math.max(pdfPenalty, 5);
    else if (f.extractorUsed === "fallback") pdfPenalty = Math.max(pdfPenalty, 10);
  }

  const baseScore = Math.max(0, 100 - ocrPenalty - pdfPenalty);

  let llmMultiplier = 1.0;
  let llmReasoning = "No LLM assessment available";
  const entries = ctx.steps.entries();
  for (const key of Object.keys(entries)) {
    const output = entries[key];
    if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      if (obj.confidence && typeof obj.confidence === "object") {
        const c = obj.confidence as Record<string, unknown>;
        if (typeof c.llmMultiplier === "number") llmMultiplier = c.llmMultiplier;
        if (typeof c.llmReasoning === "string") llmReasoning = c.llmReasoning;
      }
    }
  }
  llmMultiplier = Math.max(0.5, Math.min(1.0, llmMultiplier));

  const finalScore = Math.round(baseScore * llmMultiplier * 10) / 10;

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    ocrConfidence: Math.round(avgOcr),
    dataCompleteness: 100,
    llmMultiplier: Math.round(llmMultiplier * 100) / 100,
    llmReasoning,
    needsExpert: finalScore < 50,
  };
}

function buildReasoningSteps(
  ctx: PipelineContext,
  steps: ExecutableStep[]
): { stepNumber: number; title: string; body: string }[] {
  const result: { stepNumber: number; title: string; body: string }[] = [];
  for (const step of steps) {
    const output = ctx.steps.read(step.number);
    if (output === undefined || output === null) continue;
    const body = typeof output === "string" ? output : JSON.stringify(output, null, 2);
    result.push({ stepNumber: step.number, title: step.title, body });
  }
  return result;
}

function buildReasoningFromSteps(
  ctx: PipelineContext,
  steps: ExecutableStep[]
): string {
  const parts: string[] = [];

  for (const step of steps) {
    const output = ctx.steps.read(step.number);
    if (!output) continue;

    parts.push(`---STEP ${step.number}---`);
    parts.push(`${step.title}`);
    parts.push("");

    if (typeof output === "string") {
      parts.push(output.slice(0, 500));
    } else if (typeof output === "object") {
      parts.push(JSON.stringify(output, null, 2).slice(0, 500));
    }
  }

  return parts.join("\n");
}
