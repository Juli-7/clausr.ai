import { loadSkill, listSkills, type SkillLoader } from "@/lib/agent/skill/loader";

/**
 * Discover and load a skill by ID.
 * Thin wrapper around loader — exists so the orchestrator imports
 * from a stable registry path rather than reaching into loader.ts directly.
 */
export function getSkill(skillId: string): SkillLoader {
  return loadSkill(skillId);
}

/**
 * List all available skill IDs.
 */
export function getAllSkills(): string[] {
  return listSkills();
}
