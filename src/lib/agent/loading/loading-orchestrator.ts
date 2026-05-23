import { initSession } from "@/lib/agent/loading/phases/init-phase";
import { inputPhase } from "@/lib/agent/loading/phases/input-phase";
import { skillGenPhase } from "@/lib/agent/loading/phases/skill-gen-phase";
import { generateStepsFromChecks } from "@/lib/agent/loading/generate-steps";
import { loadReferences } from "@/lib/agent/pipeline/builtins";
import { createPipelineContext } from "@/lib/agent/pipeline/pipeline-context";
import { generateCorrelationId } from "@/lib/agent/pipeline/errors";
import { saveSessionSetup } from "@/lib/agent/shared/memory/repository";
import { logPipeline } from "@/lib/agent/pipeline/logger";

export interface SetupSessionParams {
  skillName?: string;
  sessionId: string;
  files?: { name: string; size: number; type: string; dataUrl?: string }[];
  message?: string;
}

/**
 * Once-per-session setup orchestrator.
 *
 * Loads/generates the skill, extracts files, builds steps,
 * loads regulation references, and persists everything to the
 * session_setup table so the pipeline layer can restore it on
 * subsequent /api/chat calls.
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

  // 3. Extract files if provided
  if (params.files && params.files.length > 0) {
    logPipeline(`[SETUP] extracting ${params.files.length} file(s)`);
    await inputPhase(ctx, { files: params.files, sessionId: params.sessionId });
  }

  // 4. Auto-skill generation (must happen after file extraction)
  if (isAutoSkill) {
    if (!params.message) {
      throw new Error("Auto-skill requires a 'message' describing what to assess");
    }
    logPipeline("[SETUP] generating auto-skill from user message + file texts");
    await skillGenPhase(ctx, params.message);
  }

  // 5. Generate steps from skill checks
  const steps = generateStepsFromChecks(ctx.skill.checks);
  logPipeline(`[SETUP] generated ${steps.length} step(s) from ${ctx.skill.checks.length} check(s)`);

  // 6. Load regulation references into palette
  await loadReferences(ctx);

  // 7. Persist everything to DB
  saveSessionSetup(params.sessionId, {
    skillName: ctx.skill.name,
    skillmd: ctx.skill.skillmd,
    checks: ctx.skill.checks,
    scripts: ctx.skill.scripts,
    regulationIds: ctx.skill.regulationIds,
    steps,
    paletteReferences: ctx.palette.toJSON().references,
    paletteCitations: ctx.palette.toJSON().citationPalette,
    fileRegistry: ctx.files.toJSON(),
  });

  logPipeline(`=== SETUP DONE === session="${params.sessionId}" cid=${correlationId}`);
  return { correlationId };
}
