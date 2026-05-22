import { getResponseCount, addAssistantResponse } from "@/lib/agent/shared/memory/repository";
import { AgentResponseSchema } from "@/lib/agent/shared/schemas";
import type { AgentResponse } from "@/lib/agent/shared/types";
import type { ExecutableStep } from "@/lib/agent/pipeline/types";
import { logPipeline } from "@/lib/agent/pipeline/logger";
import type { PipelineContext } from "@/lib/agent/pipeline/pipeline-context";
import { evaluate } from "@/lib/agent/evaluation";
import type { ParsedCheck } from "@/lib/agent/loading/skill/check-parser";

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

  const stepTitles: Record<number, string> = {};
  for (const s of steps) stepTitles[s.number] = s.title;

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
    toolCalls: ctx.steps.getRaw("toolCalls"),
  });

  logPipeline(`  ✓ confidence=${result.confidence.score.toFixed(1)}% errors=${result.validationErrors.length}`);

  const round = getResponseCount(sessionId) + 1;

  // Verdict: simple — FAIL if any check failed (required by schema, not rendered)
  const verdict = ctx.checks.getResults().length > 0 && ctx.checks.getResults().some((c) => c.verdict === "FAIL") ? "FAIL" : "PASS";

  // Clause texts for citation popovers (trivial map, not evaluation concern)
  const clauseTexts: Record<string, string> = {};
  for (const entry of ctx.palette.getCitationPalette()) {
    const key = `${entry.regulation}.${entry.clause}`;
    if (!clauseTexts[key]) clauseTexts[key] = entry.text;
  }

  const responseData: Record<string, unknown> = {
    content: formatContent(result.findings, ctx.steps.entries(), ctx.skill.checks),
    reasoning: result.reason,
    citations: result.citations,
    sourceCitations: result.sourceCitations.length > 0 ? result.sourceCitations : undefined,
    round,
    sessionId,
    verdict,
    sections: { findings: result.findings },
    clauseTexts: Object.keys(clauseTexts).length > 0 ? clauseTexts : undefined,
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

  logPipeline(`final response: content=${(responseData.content as string).length}chars citations=${result.citations.length} verdict=${verdict}`);

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
  findings: Record<string, string>,
  stepOutputs: Record<number | string, unknown>,
  checks: ParsedCheck[]
): string {
  const sections: string[] = [];

  for (let i = 0; i < checks.length; i++) {
    const stepNum = i + 1;
    const output = stepOutputs[stepNum];
    if (!output || typeof output !== "string") continue;

    const text = output.trim();
    const narrative = text.replace(/```[\s\S]*?```/g, "").trim();
    if (narrative.length > 0) {
      sections.push(narrative);
    }
  }

  const findingsTable = buildFindingsTable(findings);
  if (findingsTable) sections.push(findingsTable);

  return sections.length > 0 ? sections.join("\n\n") : "Assessment not available.";
}

function buildFindingsTable(findings: Record<string, string>): string {
  const rows = Object.entries(findings)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
  if (!rows) return "";
  return `## Findings\n| Field | Value |\n| --- | --- |\n${rows}`;
}
