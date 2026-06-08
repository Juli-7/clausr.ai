import { generateSkill } from "../../loading/extractors/skill-generator";
import { logPipeline } from "../../pipeline/logger";
import type { PipelineContext } from "../../pipeline/pipeline-context";

/**
 * Generate a skill from the user's request and uploaded files.
 * Updates ctx.skill in place with the generated skill.
 */
export interface SkillGenResult {
  promptTokens: number;
  completionTokens: number;
}

export async function skillGenPhase(
  ctx: PipelineContext,
  message: string,
  fileTexts: string[] = []
): Promise<SkillGenResult> {
  logPipeline("→ SKILL-GEN: generating skill from user request + files");

  const { skill, usage } = await generateSkill(message, fileTexts);

  // Update the pipeline context with the generated skill
  ctx.skill.name = skill.name;
  ctx.skill.skillmd = skill.skillmd;
  ctx.skill.checks = skill.checks;
  ctx.skill.regulationIds = skill.regulationIds;

  logPipeline(`  ✓ skill generated: "${skill.name}" checks=${skill.checks.length} regulationIds=${skill.regulationIds.join(", ") || "none"}`);

  return usage;
}
