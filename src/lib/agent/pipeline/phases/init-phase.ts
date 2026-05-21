import { loadSkill } from "@/lib/agent/skill/loader";
import { getOrCreateSession, addUserMessage } from "@/lib/agent/memory/repository";
import { pruneOldSessions } from "@/lib/agent/memory/cleanup";
import { createPipelineContext } from "../pipeline-context";
import { PipelineError, generateCorrelationId, formatPipelineError } from "../errors";
import { logPipeline, truncate } from "../logger";
import type { PipelineContext } from "../pipeline-context";

export interface InitPhaseResult {
  ctx: PipelineContext;
  correlationId: string;
}

export async function initPhase(
  skillName: string,
  sessionId: string,
  message: string,
  useTemplate: boolean | undefined,
): Promise<InitPhaseResult> {
  const correlationId = generateCorrelationId();
  logPipeline(`=== PIPELINE START === cid=${correlationId} skill="${skillName}" session="${sessionId}" msg="${truncate(message, 100)}"`);

  const skill = loadSkill(skillName);
  if (!skill) {
    throw new PipelineError("SKILL_NOT_FOUND", `Skill "${skillName}" not found`);
  }
  logPipeline(`skill loaded: "${skill.name}" template="${skill.template?.name ?? "none"}" scripts=${skill.scripts.length} refs=${skill.references.length}`);

  getOrCreateSession(sessionId, skillName);
  addUserMessage(sessionId, message);
  try { pruneOldSessions(); } catch { /* best-effort */ }

  const ctx = createPipelineContext(
    skill.name,
    skill.skillmd,
    skill.template,
    sessionId,
    correlationId,
    useTemplate,
    skill.checks
  );

  return { ctx, correlationId };
}
