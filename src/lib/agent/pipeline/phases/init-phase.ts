import { loadSkill } from "@/lib/agent/skill/loader";
import { generateSkill } from "@/lib/agent/skill/skill-generator";
import { getOrCreateSession, addUserMessage } from "@/lib/agent/memory/repository";
import { getResponsesForSession } from "@/lib/agent/memory/repository";
import { pruneOldSessions } from "@/lib/agent/memory/cleanup";
import { createPipelineContext } from "../pipeline-context";
import { PipelineError, generateCorrelationId, formatPipelineError } from "../errors";
import { logPipeline, truncate } from "../logger";
import type { PipelineContext, CheckResult } from "../pipeline-context";

export interface InitPhaseResult {
  ctx: PipelineContext;
  correlationId: string;
  isAutoSkill: boolean;
}

export async function initPhase(
  skillName: string | undefined,
  sessionId: string,
  message: string,
): Promise<InitPhaseResult> {
  const correlationId = generateCorrelationId();
  logPipeline(`=== PIPELINE START === cid=${correlationId} skill="${skillName ?? "(auto)"}" session="${sessionId}" msg="${truncate(message, 100)}"`);

  const isAutoSkill = !skillName;
  let skill;

  if (skillName) {
    skill = loadSkill(skillName);
    if (!skill) {
      throw new PipelineError("SKILL_NOT_FOUND", `Skill "${skillName}" not found`);
    }
    logPipeline(`skill loaded: "${skill.name}" template="${skill.template?.name ?? "none"}" scripts=${skill.scripts.length} regulationIds=${skill.regulationIds.length}`);
  } else {
    // Auto-skill: create a minimal placeholder; will be generated after file processing
    logPipeline("auto-skill mode: no skill chosen, will generate from user request");
    skill = {
      name: "auto-generated",
      description: "",
      triggers: [],
      skillmd: "",
      scripts: [],
      template: null,
      checks: [],
      regulationIds: [],
    };
  }

  getOrCreateSession(sessionId, skill.name);
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
  ctx.previousTurns = previousResponses.map((r) => ({
    turnNumber: r.round,
    userMessage: "",
    checkResults: [] as CheckResult[],
    reasoningSummary: r.reasoning?.slice(0, 300) ?? "",
  }));

  if (ctx.previousTurns.length > 0) {
    logPipeline(`loaded ${ctx.previousTurns.length} previous turn(s) into context`);
  }

  // Restore previous step outputs from the most recent response
  const lastResponse = previousResponses[previousResponses.length - 1];
  if (lastResponse?.reasoningSteps && lastResponse.reasoningSteps.length > 0) {
    for (const rs of lastResponse.reasoningSteps) {
      const restored = restoreStepOutput(rs.body);
      ctx.steps.write(rs.stepNumber, restored);
    }
    logPipeline(`restored ${lastResponse.reasoningSteps.length} step output(s) from previous turn`);
  }

  return { ctx, correlationId, isAutoSkill };
}

/**
 * Restore a step output from its string representation.
 * Tries JSON.parse if it looks like JSON, otherwise keeps as string.
 */
function restoreStepOutput(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return body;
    }
  }
  return body;
}
