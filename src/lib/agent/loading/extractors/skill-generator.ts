import { streamText } from "ai";
import matter from "gray-matter";
import { createModel } from "@/lib/agent/llm/factory";
import { parseChecks } from "@/lib/agent/loading/skill/check-parser";
import { SkillLoadError } from "@/lib/agent/pipeline/errors";
import type { SkillLoader } from "@/lib/agent/loading/skill/loader";
import { logPipeline } from "@/lib/agent/pipeline/logger";

const SKILL_GENERATION_PROMPT = `You are a compliance assessment skill designer. Generate a SKILL.md file that configures an AI pipeline to assess uploaded documents.

The SKILL.md MUST follow this exact format:

---
name: "Short descriptive name"
description: "What this assessment evaluates"
triggers: []
regulation_ids:
  - R48
  - R112
---

## Checks

### field_name
1. **type**: boolean | string | number | number(0-100) | enum(a, b, c)
2. **description**: Human-readable description of what this check evaluates
3. **clause**: Art 4(7) | R13.5.2 | (none)
4. **constraint**: >= 50 | <= 95 | range(500-1200) | (none) — only for numerical checks
5. **depends_on**: other_field | (none)
6. **sample**: Example narrative output for this field showing the expected style and citations

Examples:
### luminous_flux
1. **type**: number(0-200)
2. **description**: Luminous flux in lumens per lamp
3. **clause**: R112.5.2
4. **constraint**: >= 150
5. **depends_on**: (none)
6. **sample**: The luminous flux per lamp is 180 lumens [S1.c6], exceeding the 150 lumen minimum under R112.5.2.

### beam_pattern
1. **type**: enum(symmetric, asymmetric)
2. **description**: The beam pattern type determines which requirements apply
3. **clause**: R48.5.7
4. **depends_on**: (none)
5. **sample**: The headlamp uses an asymmetric beam pattern [S1.c2], conforming to R48.5.7 requirements.

### colour_temperature
1. **type**: number(4000-6000)
2. **description**: Colour temperature in Kelvin
3. **clause**: R83.7.1
4. **constraint**: range(4000-6000)
5. **depends_on**: (none)
6. **sample**: The colour temperature is 5000 K [S1.c4], within the required range under R83.7.1.

Rules:
- Field: snake_case, descriptive
- Type: number(min-max), string, boolean, enum(a, b, c)
- Constraint: >=, <=, >, <, range(a-b), or (none) — only for numerical checks
- Clause: Regulation reference like R48.5.11 or R112.5.3 or Art 4(7)
- Depends On: another field name if conditional, or (none)
- Sample: a realistic example of what the LLM should output as the narrative value
- regulation_ids: list of regulation codes in YAML frontmatter (e.g., R48, R112, GDPR)

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
  const regulationIds: string[] = parsed.data?.regulation_ids ?? [];

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
    hasTemplate: false,
  };
}
