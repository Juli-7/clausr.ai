import { SkillLoadError } from "@/lib/agent/pipeline/errors";

export type StepType = "llm" | "llm+tool" | `builtin:${string}`;

export interface ParsedStep {
  number: number;
  title: string;
  type: StepType;
  instructions: string;
  temperature?: number;
}

/**
 * Parse SKILL.md §2 Execution Flow into executable steps.
 *
 * Recognizes a markdown table with columns: # | Step | Executor
 * The Executor column explicitly sets the step type.
 */
export function parseSteps(skillmd: string): ParsedStep[] {
  const sectionMatch = skillmd.match(
    /##\s*2\.\s*Execution Flow\s*\n([\s\S]*?)(?=\n##\s|\n*$)/
  );
  if (!sectionMatch) {
    throw new SkillLoadError("SKILL_PARSE_FAILED", "SKILL.md missing §2 Execution Flow", "unknown");
  }

  const section = sectionMatch[1];

  // Parse markdown table rows: | number | title | executor |
  const rowRegex = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\S+)\s*\|/gm;
  const steps: ParsedStep[] = [];

  let match;
  while ((match = rowRegex.exec(section)) !== null) {
    const number = parseInt(match[1], 10);
    const title = match[2].trim();
    const executor = match[3].trim();

    steps.push({
      number,
      title,
      type: executor as StepType,
      instructions: title,
    });
  }

  if (steps.length === 0) {
    throw new SkillLoadError("SKILL_PARSE_FAILED", "SKILL.md §2: no steps found in markdown table format", "unknown");
  }

  return steps;
}
