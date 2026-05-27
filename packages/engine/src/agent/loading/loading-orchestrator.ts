import { initSession } from "../loading/phases/init-phase";
import { inputPhase } from "../loading/phases/input-phase";
import { skillGenPhase } from "../loading/phases/skill-gen-phase";
import { generateStepsFromChecks } from "../loading/generate-steps";
import { createPipelineContext } from "../pipeline/pipeline-context";
import { generateCorrelationId } from "../pipeline/errors";
import { saveSessionSetup } from "../shared/memory/repository";
import { logPipeline } from "../pipeline/logger";

export interface SetupSessionParams {
  skillName?: string;
  sessionId: string;
  files?: { name: string; size: number; type: string; dataUrl?: string }[];
  message?: string;
}

/**
 * Once-per-session setup orchestrator.
 *
 * Loads/generates the skill, processes files (via vector-store),
 * builds steps from ##Checks, and persists to session_setup.
 * Regulation reference loading and chunk retrieval happen
 * in the pipeline layer — loading only sets up skill + steps.
 */
export async function setupSession(params: SetupSessionParams): Promise<{ correlationId: string }> {
  const correlationId = generateCorrelationId();
  logPipeline(`=== SETUP START === skill="${params.skillName ?? "(auto)"}" session="${params.sessionId}"`);

  // 1. Load or prepare skill + create DB session
  const { skill, isAutoSkill } = await initSession(params.skillName, params.sessionId);

  // 2. Create fresh PipelineContext
  const ctx = createPipelineContext(
    skill.name,
    skill.skillmd,
    params.sessionId,
    correlationId,
    skill.checks,
    skill.scripts,
    skill.regulationIds,
  );

  // 3. Extract files if provided (user-info layer)
  let fileTexts: string[] = [];
  if (params.files && params.files.length > 0) {
    logPipeline(`[SETUP] processing ${params.files.length} file(s)`);
    fileTexts = await inputPhase(ctx, { files: params.files, sessionId: params.sessionId });
  }

  // 4. Auto-skill generation (loading layer decides if it needs file texts)
  if (isAutoSkill) {
    if (!params.message) {
      throw new Error("Auto-skill requires a 'message' describing what to assess");
    }
    logPipeline("[SETUP] generating auto-skill from user message + file texts");
    await skillGenPhase(ctx, params.message, fileTexts);
  }

  // 5. Generate steps from skill checks
  const steps = generateStepsFromChecks(ctx.skill.checks, ctx.skill.regulationIds);
  logPipeline(`[SETUP] generated ${steps.length} step(s) from ${ctx.skill.checks.length} check(s)`);

  // 6. Persist everything to DB (palette is loaded by pipeline layer)
  saveSessionSetup(params.sessionId, {
    skillName: ctx.skill.name,
    skillmd: ctx.skill.skillmd,
    checks: ctx.skill.checks,
    scripts: ctx.skill.scripts,
    regulationIds: ctx.skill.regulationIds,
    steps,
    fileRegistry: ctx.files.toJSON(),
  });

  logPipeline(`=== SETUP DONE === session="${params.sessionId}" cid=${correlationId}`);
  return { correlationId };
}
