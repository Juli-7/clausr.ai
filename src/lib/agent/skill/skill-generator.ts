import { streamText } from "ai";
import matter from "gray-matter";
import { createModel } from "@/lib/agent/llm/factory";
import { parseChecks, extractRegulationIds } from "@/lib/agent/skill/check-parser";
import { parseSteps } from "@/lib/agent/skill/step-parser";
import { SkillLoadError } from "@/lib/agent/pipeline/errors";
import type { SkillLoader } from "@/lib/agent/skill/loader";
import { logPipeline } from "@/lib/agent/pipeline/logger";

const SKILL_GENERATION_PROMPT = `You are a compliance assessment skill designer. Generate a SKILL.md file that configures an AI pipeline to assess uploaded documents.

The SKILL.md MUST follow this exact format:

---
name: "Short descriptive name"
description: "What this assessment evaluates"
triggers: []
---

## §1 Checks (Domain Schema)

A markdown table with columns: Field | Type | Constraint | Clause | Depends On | Notes

Examples:
| Field | Type | Constraint | Clause | Depends On | Notes |
| luminous_flux | number(0-200) | >= 150 | R48.5.11 | | Measured in lumens |
| beam_pattern | enum(symmetric|asymmetric) | | R48.5.7 | | |
| colour_temperature | number(4000-6000) | range(4000-6000) | R83.7.1 | | Kelvin |

Rules:
- Field: snake_case, descriptive
- Type: number(min-max), string, enum(a|b|c), boolean
- Constraint: >=, <=, >, <, range(a-b), or empty
- Clause: Regulation reference like R48.5.11 or R112.5.3. Only use real UN ECE regulations.
- Depends On: another field name if conditional, or empty
- Notes: extra guidance for the LLM

## §2 Execution Flow

A markdown table with columns: # | Step | Executor

Examples:
| # | Step | Executor |
| 1 | Analyze uploaded documents and identify relevant regulations | llm |
| 2 | Extract test data values from the documents | llm |
| 3 | Load regulation references for cited clauses | builtin:load-references |
| 4 | Run numerical compliance checks using extracted values | llm+tool |

Rules:
- Executor options: llm, llm+tool, builtin:load-references
- Step titles should be concise (max 10 words) but descriptive
- Typically 2-4 steps total
- Step 1 should analyze documents, Step 2 should extract data, Step 3 should load refs, Step 4 should run checks

## §3 Expected Output

A brief description of what the final report should contain (1-2 sentences).

Now generate the SKILL.md for the user's request below.`;

/**
 * Generate a SkillLoader-compatible object from a user message and optional file texts.
 * Uses the LLM to generate a SKILL.md, then parses it.
 */
export async function generateSkill(
  message: string,
  fileTexts: string[]
): Promise<SkillLoader> {
  const fileContext =
    fileTexts.length > 0
      ? `\n\n## Uploaded Files (${fileTexts.length})\n${fileTexts
          .map((f, i) => `[File ${i + 1}]\n${f.slice(0, 3000)}`)
          .join("\n\n---\n\n")}`
      : "";

  const userPrompt = `User request: ${message}${fileContext}`;

  logPipeline("[SKILL-GEN] generating SKILL.md from user request");

  const result = streamText({
    model: createModel(),
    system: SKILL_GENERATION_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.3,
  });

  let fullText = "";
  for await (const chunk of result.textStream) {
    fullText += chunk;
  }

  logPipeline(`[SKILL-GEN] raw output length=${fullText.length}chars`);

  // Parse frontmatter and body
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(fullText);
  } catch {
    throw new SkillLoadError(
      "SKILL_GENERATION_FAILED",
      "LLM generated invalid frontmatter",
      "auto-generated"
    );
  }

  const skillmd = parsed.content.trim();

  // Parse checks
  const checks = parseChecks(skillmd);
  const regulationIds = extractRegulationIds(checks);

  // Parse steps
  let steps;
  try {
    steps = parseSteps(skillmd);
  } catch (err) {
    throw new SkillLoadError(
      "SKILL_GENERATION_FAILED",
      `Generated SKILL.md missing or invalid §2 Execution Flow: ${err instanceof Error ? err.message : String(err)}`,
      "auto-generated"
    );
  }

  logPipeline(
    `[SKILL-GEN] name="${parsed.data?.name ?? "auto-generated"}" checks=${checks.length} steps=${steps.length} regulationIds=${regulationIds.join(", ") || "none"}`
  );

  return {
    name: parsed.data?.name ?? "auto-generated",
    description: parsed.data?.description ?? "",
    triggers: parsed.data?.triggers ?? [],
    skillmd,
    scripts: [],
    template: null,
    checks,
    regulationIds,
  };
}
