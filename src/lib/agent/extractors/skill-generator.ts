import { streamText } from "ai";
import matter from "gray-matter";
import { createModel } from "@/lib/agent/llm/factory";
import { parseChecks, extractRegulationIds } from "@/lib/agent/skill/check-parser";
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

## Checks

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

## Red Lines

Hard constraints the LLM must never violate. Use ❌ bullet format.

Examples:
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip auto-leveling check for LED — legally required
- ❌ Do not make numerical pass/fail without calling the compliance-check tool

## Lessons Learnt

(System-maintained area, initially empty.)

Now generate the SKILL.md for the user's request below.`;

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

  const checks = parseChecks(skillmd);
  const regulationIds = extractRegulationIds(checks);

  logPipeline(
    `[SKILL-GEN] name="${parsed.data?.name ?? "auto-generated"}" checks=${checks.length} regulationIds=${regulationIds.join(", ") || "none"}`
  );

  return {
    name: parsed.data?.name ?? "auto-generated",
    description: parsed.data?.description ?? "",
    triggers: parsed.data?.triggers ?? [],
    skillmd,
    scripts: [],
    checks,
    regulationIds,
  };
}
