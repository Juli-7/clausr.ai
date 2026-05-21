import { getResponseCount, addAssistantResponse } from "@/lib/agent/memory/repository";
import { AgentResponseSchema } from "@/lib/agent/schemas";
import type { AgentResponse } from "@/lib/agent/types";
import type { ExecutableStep } from "../step-executor";
import { logPipeline } from "../logger";
import type { PipelineContext } from "../pipeline-context";
import { evaluate } from "@/lib/agent/evaluation";

export interface FinalizePhaseResult {
  response: AgentResponse;
  validationErrors: { type: string; message: string }[];
  confidence: { score: number; ocrConfidence: number; dataCompleteness?: number; llmMultiplier: number; llmReasoning: string; needsExpert: boolean };
}

export async function finalizePhase(
  ctx: PipelineContext,
  steps: ExecutableStep[],
  sessionId: string
): Promise<FinalizePhaseResult> {
  logPipeline("→ EVAL: running evaluation layer");

  // Build step titles map
  const stepTitles: Record<number, string> = {};
  for (const s of steps) stepTitles[s.number] = s.title;

  // Gather pipeline raw output as plain data
  const result = evaluate({
    checkResults: ctx.checks.getResults(),
    citationPalette: ctx.palette.getCitationPalette(),
    sourcePalette: ctx.files.getSourcePalette(),
    files: ctx.files.getFiles().map((f) => ({
      ocrConfidence: f.ocrConfidence,
      extractorUsed: f.extractorUsed,
    })),
    stepOutputs: ctx.steps.entries(),
    stepTitles,
    claims: ctx.checks.getClaims(),
    citations: [...ctx.checks.getCitations()],
    sourceCitations: [...ctx.checks.getSourceCitations()],
    checks: ctx.skill.checks,
    reportSections: ctx.report.getSections(),
    toolCalls: ctx.steps.getRaw("toolCalls"),
  });

  logPipeline(`  ✓ verdict=${result.verdict} confidence=${result.confidence.score.toFixed(1)}% errors=${result.validationErrors.length}`);

  const round = getResponseCount(sessionId) + 1;

  const responseData: Record<string, unknown> = {
    content: formatContent(result.sections, steps),
    reasoning: result.reason,
    citations: result.citations,
    sourceCitations: result.sourceCitations.length > 0 ? result.sourceCitations : undefined,
    round,
    sessionId,
    verdict: result.verdict,
    sections: result.sections,
    clauseTexts: Object.keys(result.clauseTexts).length > 0 ? result.clauseTexts : undefined,
  };

  const toolCalls = ctx.steps.getRaw("toolCalls");
  if (toolCalls) responseData.toolCalls = toolCalls;

  if (result.reasoningSteps.length > 0) {
    responseData.reasoningSteps = result.reasoningSteps;
  }

  if (result.claims.length > 0) {
    responseData.claims = result.claims;
  }

  responseData.confidence = result.confidence;

  if (result.validationErrors.length > 0) {
    responseData.validationErrors = result.validationErrors;
  }

  logPipeline(`final response: content=${(responseData.content as string).length}chars citations=${(result.citations as any[])?.length} verdict=${result.verdict}`);

  const agentResponse = AgentResponseSchema.parse(responseData);
  addAssistantResponse(sessionId, agentResponse);

  logPipeline(`=== PIPELINE DONE === round=${round}`);

  return {
    response: agentResponse,
    validationErrors: result.validationErrors,
    confidence: result.confidence,
  };
}

function formatContent(
  sections: Record<string, Record<string, string> | string>,
  steps: ExecutableStep[]
): string {
  if (Object.keys(sections).length > 0) {
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

  return "Assessment not available.";
}
