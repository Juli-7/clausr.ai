import { generateSkill } from "@/lib/agent/skill/skill-generator";
import { logPipeline } from "../logger";
import type { PipelineContext } from "../pipeline-context";

/**
 * Generate a skill from the user's request and uploaded files.
 * Updates ctx.skill in place with the generated skill.
 */
export async function skillGenPhase(
  ctx: PipelineContext,
  message: string
): Promise<void> {
  const fileTexts = ctx.files.getFiles().map((f) => f.extractedText);

  logPipeline("→ SKILL-GEN: generating skill from user request + files");

  const skill = await generateSkill(message, fileTexts);

  // Update the pipeline context with the generated skill
  ctx.skill.name = skill.name;
  ctx.skill.skillmd = skill.skillmd;
  ctx.skill.template = skill.template;
  ctx.skill.checks = skill.checks;

  logPipeline(`  ✓ skill generated: "${skill.name}" checks=${skill.checks.length} regulationIds=${skill.regulationIds.join(", ") || "none"}`);
}
