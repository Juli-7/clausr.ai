import { getResponseCount, addAssistantResponse } from "@/lib/agent/shared/memory/repository";
import { AgentResponseSchema } from "@/lib/agent/shared/schemas";
import type { AgentResponse } from "@/lib/agent/shared/types";
import type { ExecutableStep } from "@/lib/agent/pipeline/types";
import { logPipeline } from "@/lib/agent/pipeline/logger";
import type { PipelineContext, CheckResult, CitationPaletteEntry } from "@/lib/agent/pipeline/pipeline-context";
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

  // Clause texts for citation popovers
  const clauseTexts: Record<string, string> = {};
  for (const entry of ctx.palette.getCitationPalette()) {
    const key = `${entry.regulation}.${entry.clause}`;
    if (!clauseTexts[key]) clauseTexts[key] = entry.text;
  }

  const responseData: Record<string, unknown> = {
    content: formatContent(ctx.steps.entries(), ctx.skill.checks, ctx.checks.getResults(), ctx.palette.getCitationPalette()),
    reasoning: result.reason,
    citations: result.citations,
    sourceCitations: result.sourceCitations.length > 0 ? result.sourceCitations : undefined,
    round,
    sessionId,
    sections: {
      findings: result.findings,
      _checkResults: JSON.stringify(ctx.checks.getResults().map((r) => ({
        name: r.name,
        type: r.type,
        finding: r.finding,
        verdict: r.verdict,
        citationRef: r.citationRef,
        sourceCitation: r.sourceCitation,
      }))),
    },
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

  logPipeline(`final response: content=${(responseData.content as string).length}chars citations=${result.citations.length} verdict=${responseData.verdict}`);

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
  stepOutputs: Record<number | string, unknown>,
  checks: ParsedCheck[],
  checkResults: readonly CheckResult[],
  citationPalette: readonly CitationPaletteEntry[]
): string {
  const sections: string[] = [];

  for (let i = 0; i < checks.length; i++) {
    const result = checkResults.find(r => r.name === checks[i].field);
    const stepNum = i + 1;
    const output = stepOutputs[stepNum];
    const outputText = typeof output === "string" ? output.trim() : "";
    const text = result?.finding ?? outputText;
    if (!text) continue;

    let narrative = text.replace(/```[\s\S]*?```/g, "").trim();
    if (narrative.length === 0) continue;

    // Strip any lingering [R48.5.11] markers from narrative (now rendered as badges below)
    if (result) {
      for (const ref of result.citationRef) {
        const marker = `[${ref}]`;
        let idx = narrative.indexOf(marker);
        while (idx !== -1) {
          narrative = narrative.substring(0, idx) + narrative.substring(idx + marker.length);
          idx = narrative.indexOf(marker);
        }
      }
    }
    narrative = narrative.trim();
    if (narrative.length === 0) continue;

    const badges: string[] = [];

    if (result) {
      for (const ref of result.citationRef) {
        const entry = citationPalette.find(e => e.id === ref);
        if (entry) {
          badges.push(`<cite class="citation-marker" role="button" tabindex="0" data-ref="${ref}" data-regulation="${entry.regulation}" data-clause="${entry.clause}">${entry.regulation} §${entry.clause}</cite>`);
        }
      }
      for (const ref of result.sourceCitation) {
        badges.push(`<cite class="source-citation-marker" role="button" tabindex="0" data-source-citation="${ref}">${ref}</cite>`);
      }
    }

    const header = `### ${checks[i].field}`;
    if (badges.length > 0) {
      sections.push(header + "\n\n" + narrative + "\n\n" + badges.join(" "));
    } else {
      sections.push(header + "\n\n" + narrative);
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : "Assessment not available.";
}
