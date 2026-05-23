import { loadSkill } from "@/lib/agent/loading/skill/loader";
import { getOrCreateSession, addUserMessage } from "@/lib/agent/shared/memory/repository";
import { getResponsesForSession } from "@/lib/agent/shared/memory/repository";
import { pruneOldSessions } from "@/lib/agent/shared/memory/cleanup";
import { PipelineError } from "@/lib/agent/pipeline/errors";
import { logPipeline, truncate } from "@/lib/agent/pipeline/logger";
import type { PipelineContext, CheckResult } from "@/lib/agent/pipeline/pipeline-context";

/**
 * Once-per-session: load (or prepare for auto-generation) a skill
 * and create the DB session row. Does NOT create PipelineContext
 * or add user messages — those are split across setup and pipeline layers.
 */
export async function initSession(
  skillName: string | undefined,
  sessionId: string,
): Promise<{
  skill: {
    name: string;
    description: string;
    triggers: string[];
    skillmd: string;
    scripts: { name: string; path: string; desc: string; params: string }[];
    checks: import("@/lib/agent/loading/skill/check-parser").ParsedCheck[];
    regulationIds: string[];
  };
  isAutoSkill: boolean;
}> {
  const isAutoSkill = !skillName;
  let skill;

  if (skillName) {
    skill = loadSkill(skillName);
    if (!skill) {
      throw new PipelineError("SKILL_NOT_FOUND", `Skill "${skillName}" not found`);
    }
    logPipeline(`[INIT-SESSION] skill loaded: "${skill.name}" scripts=${skill.scripts.length} regulationIds=${skill.regulationIds.length}`);
  } else {
    logPipeline("[INIT-SESSION] auto-skill mode: no skill chosen, will generate after file processing");
    skill = {
      name: "auto-generated",
      description: "",
      triggers: [],
      skillmd: "",
      scripts: [],
      checks: [],
      regulationIds: [],
    };
  }

  getOrCreateSession(sessionId, skill.name);
  return { skill, isAutoSkill };
}

/**
 * Per-pipeline-turn: add user message, prune sessions, and restore
 * previous step outputs + check results from the last response.
 * The PipelineContext is already created/restored by the caller.
 */
export async function initPipelineTurn(
  ctx: PipelineContext,
  sessionId: string,
  message: string,
  correlationId: string,
): Promise<void> {
  ctx.correlationId = correlationId;
  addUserMessage(sessionId, message);
  try { pruneOldSessions(); } catch (err) {
    logPipeline(`session pruning failed (non-critical): ${err instanceof Error ? err.message : String(err)}`);
  }

  // Load previous turns from DB
  const previousResponses = getResponsesForSession(sessionId);
  ctx.previousTurns = previousResponses.map((r) => ({
    turnNumber: r.round,
    userMessage: "",
    checkResults: [] as CheckResult[],
    reasoningSummary: r.reasoning?.slice(0, 300) ?? "",
  }));

  if (ctx.previousTurns.length > 0) {
    logPipeline(`[PIPELINE-TURN] loaded ${ctx.previousTurns.length} previous turn(s)`);
  }

  // Restore previous step outputs from the most recent response's reasoningSteps
  const lastResponse = previousResponses[previousResponses.length - 1];
  if (lastResponse?.reasoningSteps && lastResponse.reasoningSteps.length > 0) {
    for (const rs of lastResponse.reasoningSteps) {
      ctx.steps.write(rs.stepNumber, restoreStepOutput(rs.body));
    }
    logPipeline(`[PIPELINE-TURN] restored ${lastResponse.reasoningSteps.length} step output(s) from previous turn`);
  }

  // Restore previous CheckResults from the most recent response's findings
  if (lastResponse?.sections?.findings && typeof lastResponse.sections.findings === "object") {
    const restoredResults: CheckResult[] = [];
    for (const [field, finding] of Object.entries(lastResponse.sections.findings)) {
      const checkDef = ctx.skill.checks.find((c) => c.field === field);
      const regMatch = String(finding).match(/\[(R\d+\.\d+(?:\.\d+)*)\]/);
      restoredResults.push({
        name: field,
        type: checkDef?.type.kind === "number" ? "numerical" : "qualitative",
        finding: String(finding),
        verdict: String(finding).startsWith("FAIL") ? "FAIL" : "PASS",
        citationRef: regMatch?.[1] ? [regMatch[1]] : [],
        sourceCitation: [],
      });
    }
    ctx.checks.addResults(restoredResults);
    logPipeline(`[PIPELINE-TURN] restored ${restoredResults.length} CheckResult(s) from previous turn`);
  }
}

function restoreStepOutput(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { return JSON.parse(trimmed); } catch { return body; }
  }
  return body;
}
