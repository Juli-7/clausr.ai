import { loadSkill } from "@/lib/agent/skill/loader";
import { getOrCreateSession, addUserMessage } from "@/lib/agent/memory/repository";
import { pruneOldSessions } from "@/lib/agent/memory/cleanup";
import { getResponsesForSession } from "@/lib/agent/memory/repository";
import { createPipelineContext } from "../pipeline-context";
import { PipelineError, generateCorrelationId, formatPipelineError } from "../errors";
import { logPipeline, truncate } from "../logger";
import type { PipelineContext } from "../pipeline-context";
import type { CheckResult } from "../pipeline-context";

export interface InitPhaseResult {
  ctx: PipelineContext;
  correlationId: string;
}

export async function initPhase(
  skillName: string,
  sessionId: string,
  message: string,
): Promise<InitPhaseResult> {
  const correlationId = generateCorrelationId();
  logPipeline(`=== PIPELINE START === cid=${correlationId} skill="${skillName}" session="${sessionId}" msg="${truncate(message, 100)}"`);

  const skill = loadSkill(skillName);
  if (!skill) {
    throw new PipelineError("SKILL_NOT_FOUND", `Skill "${skillName}" not found`);
  }
  logPipeline(`skill loaded: "${skill.name}" template="${skill.template?.name ?? "none"}" scripts=${skill.scripts.length} regulationIds=${skill.regulationIds.length}`);

  getOrCreateSession(sessionId, skillName);
  addUserMessage(sessionId, message);
  try { pruneOldSessions(); } catch { /* best-effort */ }

  const ctx = createPipelineContext(
    skill.name,
    skill.skillmd,
    skill.template,
    sessionId,
    correlationId,
    skill.checks
  );

  // Load previous turns from DB into ctx.previousTurns
  const previousResponses = getResponsesForSession(sessionId);
  ctx.previousTurns = previousResponses.map((r, i) => ({
    turnNumber: r.round,
    userMessage: "",
    checkResults: [] as CheckResult[],
    reasoningSummary: r.reasoning?.slice(0, 300) ?? "",
  }));

  if (ctx.previousTurns.length > 0) {
    logPipeline(`loaded ${ctx.previousTurns.length} previous turn(s) into context`);
  }

  return { ctx, correlationId };
}
