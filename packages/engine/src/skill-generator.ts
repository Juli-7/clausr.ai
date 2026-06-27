import { generateText } from "ai";
import { createModel } from "./agent/llm/factory";
import { extractFileContent } from "./agent/user-info/extractors";

const ANALYSIS_PROMPT = `You are a compliance skill reverse-engineer. You are given a reference compliance report — a free-form narrative describing how a human expert assessed a set of documents. The report may use any structure: headings like "Controller Identification Status", bullet lists of findings, tables of pass/fail, etc. There are no predefined field names.

Your job is to study the report and infer what SKILL.md check fields would need to exist for an AI pipeline to produce this same kind of report. For each distinct compliance requirement the report evaluates, define a check.

For each inferred check, you must determine all of the following fields. Here is what each field means and how the pipeline uses it — use this to infer correctly from the report:

1. **field name** (snake_case): Captures what is being evaluated. Used as the programmatic identifier. Example: controller_identified.

2. **type**: Determines the data type and validation logic at runtime.
   - boolean → pass/fail, yes/no check
   - string → free-text narrative output (harder to validate automatically)
   - number(min-max) → numerical score with an expected range, used with constraint for pass/fail
   - enum(a, b, c) → finite set of possible verdicts
   Use the most precise type. If the report shows clear pass/fail, prefer boolean over string.

3. **attention**: RAG keywords. During execution, the pipeline uses these terms for semantic search/retrieval — they are the key terms used to find relevant chunks in uploaded documents. Include essential terms, synonyms, and variations that an AI tutor would search for. Do NOT leave empty — at minimum provide the field name and domain context.

4. **description**: The prompt given to the LLM at runtime telling it how to analyze and evaluate this check. This is the core instruction — be specific about what to look for and how to determine the verdict.

5. **clause**: The specific regulation clause reference this check verifies (e.g. Art 32(1)(d), R13.5.2). Used for citation linking in the output. Infer from context in the report.

6. **constraint**: For number types, the pass/fail threshold or condition (e.g. >= 50, range(500-1200)). For other types, use (none).

7. **rounding**: For number types, the number of decimal places to round to before comparing against the constraint. Use format like "2" (standard), "2:ceil" (round up), "2:floor" (round down). Use (none) if not applicable.

8. **depends_on**: If this check logically follows another (the report evaluates it in context of another finding), declare the dependency. Otherwise (none).

9. **sample**: A realistic example of what the LLM should output as the narrative verdict for this field, matching the report's citation style (use [S1.cN] format).

Critically: the report may not explicitly state fields. You must look at what the report evaluates (e.g. "The controller was identified as required" → this is a boolean check on controller_identified). Be thorough — capture every compliance requirement the report touches.

Output a structured list of inferred checks with all 8 points above for each.`;

const GENERATION_PROMPT = `You are a compliance assessment skill designer. Given sample documents, regulation reference documents, a reference compliance report, and an analysis of the checks inferred from that report, build a complete SKILL.md file.

The analysis is a best-guess at what check fields the report implies. You may need to adjust field names, types, clauses, or constraints to better match how this skill would be used in practice. The SKILL.md must be self-consistent and production-ready.

The SKILL.md MUST follow this exact format:

---
name: "Short descriptive name"
description: "What this assessment evaluates"
triggers: []
regulation_ids:
  - GDPR
---

## Checks

### field_name
1. **type**: boolean | string | number | number(0-100) | enum(a, b, c)
2. **attention**: RAG keywords used for semantic search/retrieval during pipeline execution
3. **description**: The LLM runtime prompt — tells the LLM how to analyze this check
4. **clause**: Regulation clause reference for citation linking (e.g. Art 32(1)(d))
5. **constraint**: Pass/fail threshold for numerical checks (e.g. >= 50)
6. **rounding**: Decimal places to round numerical values before comparing (e.g. "2", "2:ceil", "2:floor")
7. **depends_on**: Execution ordering — this check runs after the depended check
8. **sample**: Example verdict narrative with [S1.cN] citation format

Here is what each field means and how the pipeline uses it:

1. **type**: Determines validation logic at runtime.
   - boolean → pass/fail, yes/no
   - string → free-text narrative output
   - number(min-max) → numerical score with range, used with constraint
   - enum(a, b, c) → finite set of possible verdicts
   Prefer boolean over string when the check is a clear pass/fail.

2. **attention**: RAG keywords. During execution, these terms drive semantic search to find relevant document chunks. Include essential terms, synonyms, and variations. Never leave empty.

3. **description**: The core instruction given to the LLM at runtime telling it how to analyze and evaluate this check. Be specific about what to look for and how to determine the verdict. This is the prompt the LLM executes.

4. **clause**: The regulation clause this check verifies. Used for citation linking in the output. If unsure, infer from context.

5. **constraint**: Only for number types. Defines what value constitutes compliance. Use (none) for non-numerical checks.

6. **rounding**: Only for number types. Number of decimal places to round the extracted value to before comparing against the constraint. Format: "2" for standard rounding, "2:ceil" to always round up, "2:floor" to always round down. Use (none) if not applicable.

7. **depends_on**: If this check logically depends on another field's result, declare it here. Controls execution order. Use (none) if independent.

8. **sample**: A realistic narrative verdict matching the report's citation style (use [S1.cN] format). The LLM uses this as a format reference.

Examples:
### luminous_flux
1. **type**: number(0-200)
2. **attention**: luminous flux lumens per lamp
3. **description**: Luminous flux in lumens per lamp
4. **clause**: R112.5.2
5. **constraint**: >= 150
6. **depends_on**: (none)
7. **sample**: The luminous flux per lamp is 180 lumens [S1.c6], exceeding the 150 lumen minimum under R112.5.2.

### beam_pattern
1. **type**: enum(symmetric, asymmetric)
2. **attention**: beam pattern type symmetric asymmetric
3. **description**: The beam pattern type determines which requirements apply
4. **clause**: R48.5.7
5. **constraint**: (none)
6. **depends_on**: (none)
7. **sample**: The headlamp uses an asymmetric beam pattern [S1.c2], conforming to R48.5.7 requirements.

Examples (note the 8-line format with rounding):
### luminous_flux
1. **type**: number(0-200)
2. **attention**: luminous flux lumens per lamp
3. **description**: Evaluate the luminous flux measurement from the test data and pass if it meets the minimum requirement
4. **clause**: R112.5.2
5. **constraint**: >= 150
6. **rounding**: 2
7. **depends_on**: (none)
8. **sample**: The luminous flux per lamp is 180 lumens [S1.c6], exceeding the 150 lumen minimum under R112.5.2.

### beam_pattern
1. **type**: enum(symmetric, asymmetric)
2. **attention**: beam pattern type symmetric asymmetric
3. **description**: Determine the beam pattern type from the test report
4. **clause**: R48.5.7
5. **constraint**: (none)
6. **rounding**: (none)
7. **depends_on**: (none)
8. **sample**: The headlamp uses an asymmetric beam pattern [S1.c2], conforming to R48.5.7 requirements.

Rules:
- Every check MUST include all 8 fields (type, attention, description, clause, constraint, rounding, depends_on, sample). Use "(none)" for any field that is not applicable. Do NOT skip any field.
- attention must never be empty — at minimum use the field name as keywords
- Field: snake_case, descriptive
- Type: number(min-max), string, boolean, enum(a, b, c)
- Constraint: >=, <=, >, <, range(a-b), or (none) — only for numerical checks
- Rounding: "N", "N:ceil", "N:floor" — only for numerical checks
- Clause: Regulation reference like R48.5.11 or R112.5.3 or Art 4(7)
- Depends On: another field name if conditional, or (none)
- Sample: a realistic example of what the LLM should output as the narrative value
- regulation_ids: list of regulation codes in YAML frontmatter

## Red Lines

Hard constraints the LLM must never violate. Use ❌ bullet format.

Examples:
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip auto-leveling check for LED — legally required
- ❌ Do not make numerical pass/fail without calling the compliance-check tool

## Lessons Learnt

(System-maintained area, initially empty.)

Use the analysis and the reference report to build the most accurate SKILL.md possible.

IMPORTANT: The frontmatter MUST include non-empty values for:
- name: a short descriptive name
- description: what this assessment evaluates
- regulation_ids: one or more regulation codes
- triggers: at least one trigger keyword

Do not leave any of these fields empty.`;

export interface GenerateSkillParams {
  report: string;
  files?: { name: string; type: string; size?: number; dataUrl: string }[];
  regulations?: { name: string; type: string; size?: number; dataUrl: string }[];
}

export interface GenerateSkillResult {
  name: string;
  description: string;
  triggers: string[];
  regulationIds: string[];
  skillmd: string;
  redline?: string;
  lessons?: string;
}

async function callLLM(system: string, user: string): Promise<string> {
  const result = await generateText({
    model: createModel(),
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0.3,
  });
  return result.text;
}

function buildUserInput(sampleTexts: string, regulationTexts: string, report: string): string {
  return `${
    sampleTexts ? `## Sample Documents\n\n${sampleTexts}\n\n` : ""
  }${
    regulationTexts ? `## Regulation References\n\n${regulationTexts}\n\n` : ""
  }## Reference Compliance Report\n\n${report}`;
}

export async function generateSkill(params: GenerateSkillParams): Promise<string> {
  const { report, files, regulations } = params;

  let sampleTexts = "";
  if (files && files.length > 0) {
    const results = await Promise.all(
      files.map((f) => extractFileContent(f).catch(() => null))
    );
    sampleTexts = results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.text.length > 0)
      .map((r, i) => {
        const chunks = r.chunks
          .map((c) => c.pageNumber ? `[Page ${c.pageNumber}]\n${c.text}` : c.text)
          .join("\n\n");
        return `[Document ${i + 1}: ${files![i]!.name}]\n${chunks}`;
      })
      .join("\n\n---\n\n");
  }

  let regulationTexts = "";
  if (regulations && regulations.length > 0) {
    const results = await Promise.all(
      regulations.map((f) => extractFileContent(f).catch(() => null))
    );
    regulationTexts = results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.text.length > 0)
      .map((r, i) => {
        const chunks = r.chunks
          .map((c) => c.pageNumber ? `[Page ${c.pageNumber}]\n${c.text}` : c.text)
          .join("\n\n");
        return `[Regulation ${i + 1}: ${regulations![i]!.name}]\n${chunks}`;
      })
      .join("\n\n---\n\n");
  }

  const userInput = buildUserInput(sampleTexts, regulationTexts, report);

  console.log("[generateSkill] Step 1: Analyzing reference report...");
  const analysis = await callLLM(ANALYSIS_PROMPT, userInput);

  console.log("[generateSkill] Step 2: Generating SKILL.md...");
  const generationInput = `## Check Analysis\n\n${analysis}\n\n---\n\n${userInput}`;
  const fullText = await callLLM(GENERATION_PROMPT, generationInput);

  return fullText;
}
