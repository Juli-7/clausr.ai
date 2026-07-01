/**
 * ── Prompt Registry ──
 * All LLM prompts used by the clausr.ai engine in one file.
 *
 * Pipeline step prompts → used by executeLlmToolStep()
 * Skill generator prompts → used by generateSkill()
 */

// ═══════════════════════════════════════════════════════════════
// PIPELINE STEP PROMPTS
// ═══════════════════════════════════════════════════════════════

export function buildSystemPrompt(
  regulationSection: string,
  previousError?: string,
): string {
  const retryContext = previousError
    ? `\n\nPREVIOUS ATTEMPT FAILED: ${previousError}\nPlease fix the issue and retry.`
    : "";

  return `# Role
You are an expert in executing information handling jobs in general.

# Instructions
- Retrieve relevant chunks according to the step description provided in the user's message.
- Your output must be a JSON object with these exact fields: value (narrative assessment with citation markers), sourceCitation (chunk IDs), citationRef (regulation references), verdict (PASS or FAIL).
- Output ONLY valid JSON in this exact format — no code blocks, no explanation before or after:
  {"value": "narrative assessment with [S1.cN] markers", "sourceCitation": ["S1.c3"], "citationRef": ["R48.5.11"], "verdict": "PASS"}
- For qualitative steps: assess the evidence and output your finding and final verdict.
- For numerical steps: extract the value from the available chunks, then call the \`checkCompliance\` tool to perform the comparison. Do NOT determine the verdict yourself — let the tool compute it.
- \`citationRef\`: use EXACT regulation IDs from Available Citations (e.g., "R48.5.11")
- \`sourceCitation\`: use EXACT chunk IDs from Available Chunks (e.g., ["S1.c3"])

${regulationSection}
${retryContext}`;
}

export function buildUserMessage(
  stepNumber: number,
  stepTitle: string,
  stepInstructions: string,
  fileChunks: string,
  dependencyContext?: string,
  revisionContext?: { userFeedback: string; previousOutput: string },
): string {
  if (revisionContext) {
    return `### Step ${stepNumber}: ${stepTitle} (REVISION)

${stepInstructions}

# Revision Context

The user provided the following feedback about the previous assessment:
"${revisionContext.userFeedback}"

The previous step output was:
${revisionContext.previousOutput}` +
      (dependencyContext ? `\n\n# Dependency Context\n${dependencyContext}` : "") +
      (fileChunks ? `\n\n# Available Chunks\n${fileChunks}` : "");
  }

  return `### Step ${stepNumber}: ${stepTitle}

${stepInstructions}` +
    (dependencyContext ? `\n\n# Dependency Context\n${dependencyContext}` : "") +
    (fileChunks ? `\n\n# Available Chunks\n${fileChunks}` : "");
}

// ═══════════════════════════════════════════════════════════════
// COMPLIANCE CHAT PROMPTS
// ═══════════════════════════════════════════════════════════════

export const COMPLIANCE_SYSTEM_PROMPTS: Record<number, string> = {
  1: `You are a compliance scoping system. **Step 1: Compliance Scope**.

Output: reasoned step-by-step. Respond concisely with facts after each tool result.

Procedure:
1. Call search_packs or recommend_packs based on product description — output what was found
2. Call get_pack_details when the user wants details — output a summary
3. Call set_scope with their chosen pack IDs — output confirmation
4. Call change_step(2) when scope is set — output what Step 2 entails`,

  2: `You are a document collection system. **Step 2: Documents & Validation**.

Collect required document fields efficiently — batch multiple fields into a single tool call when the user provides several values at once. Respond after every tool call.

Procedure:
1. Identify unfilled required fields from session state
2. Ask the user for values — when they provide multiple fields, call batch_update_doc_fields with all of them at once. Use update_doc_field only for single-field edits.
3. Accept file uploads via attach_file — output confirmation
4. Call run_validation to check completeness — output results
5. When complete, call change_step(3) — output what Step 3 entails`,

  3: `You are an audit execution system. **Step 3: Compliance Audit**.

Execute the audit workflow step by step.

Procedure:
1. Call start_audit to begin
2. Call get_session_state to monitor progress
3. Present results to the user and suggest_lesson for findings
4. Call export_document when the user requests output`,
};

/**
 * Build an enriched step prompt with pack-specific context.
 * Injects document fields (step 2) and checks/redlines/lessons (step 3) into the prompt.
 */
export function buildComplianceStepPrompt(
  step: number,
  packs: Array<{
    id: string;
    title: string;
    checks?: Array<{ field: string; description?: string | null; clause?: string | null }>;
    redlines?: string[];
    lessons?: string[];
    documents?: Array<{
      type: string;
      title: string;
      fields: Array<{
        field: string;
        label: string;
        required: boolean;
        interview?: { question?: string; hint?: string };
      }>;
    }>;
  }>
): string {
  const base = COMPLIANCE_SYSTEM_PROMPTS[step] ?? COMPLIANCE_SYSTEM_PROMPTS[1] ?? "";
  if (!packs.length) return base;

  const sections: string[] = [base];

  if (step === 2) {
    const docLines = packs.flatMap((p) =>
      (p.documents ?? []).flatMap((d) =>
        d.fields
          .filter((f) => f.required)
          .map((f) => {
            const q = f.interview?.question ? ` — ${f.interview.question}` : "";
            return `- [${p.title}] ${f.field}: ${f.label}${q}`;
          })
      )
    );
    if (docLines.length) {
      sections.push(
        `\n# Required Documents & Fields\nUse these fields to guide your interview. Ask about each one.\n\n${docLines.join("\n")}`
      );
    }
  }

  if (step === 3) {
    for (const p of packs) {
      const checkLines = (p.checks ?? []).map(
        (c) => `- **${c.field}**: ${c.description ?? ""}${c.clause ? ` (${c.clause})` : ""}`
      );
      const redlineLines = (p.redlines ?? []).map((r) => `- ❌ ${r}`);
      const lessonLines = (p.lessons ?? []).map((l) => `- ${l}`);

      const packSection = [
        `\n## Pack: ${p.title}`,
        ...(checkLines.length ? ["\n### Checks", ...checkLines] : []),
        ...(redlineLines.length ? ["\n### Red Lines (never violate)", ...redlineLines] : []),
        ...(lessonLines.length ? ["\n### Lessons Learnt", ...lessonLines] : []),
      ];
      sections.push(packSection.join("\n"));
    }
  }

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// SKILL GENERATOR PROMPTS
// ═══════════════════════════════════════════════════════════════

const CHECK_FIELD_DEFINITIONS = `
1. **field name** (snake_case): Captures what is being evaluated. Used as the programmatic identifier. Example: controller_identified.

2. **type**: Determines the data type and validation logic at runtime.
   - boolean → pass/fail, yes/no check
   - string → free-text narrative output
   - number(min-max) → numerical score with an expected range, used with constraint for pass/fail
   - enum(a, b, c) → finite set of possible verdicts
   Use the most precise type. Prefer boolean over string when the check is a clear pass/fail.

3. **attention**: RAG keywords. During execution, the pipeline uses these terms for semantic search/retrieval to find relevant document chunks. Include essential terms, synonyms, and variations. Never leave empty.

4. **description**: The core instruction given to the LLM at runtime telling it how to analyze and evaluate this check. Be specific about what to look for and how to determine the verdict.

5. **clause**: The specific regulation clause this check verifies (e.g. Art 32(1)(d), R48.5.11). Used for citation linking in the output. Infer from context if not explicit.

6. **constraint**: For number types, the pass/fail threshold or condition (e.g. >= 50, range(500-1200)). Use (none) for non-numerical checks.

7. **rounding**: For number types, the number of decimal places to round to before comparing against the constraint. Format: "2" (standard), "2:ceil" (round up), "2:floor" (round down). Use (none) if not applicable.

8. **depends_on**: If this check logically depends on another field's result, declare it here. Controls execution order. Use (none) if independent.

9. **sample**: A realistic example of what the LLM should output as the narrative verdict for this field, matching the citation style (use [S1.cN] format).`;

export const ANALYSIS_PROMPT = `You are a compliance skill reverse-engineer. You are given a reference compliance report — a free-form narrative describing how a human expert assessed a set of documents. The report may use any structure: headings like "Controller Identification Status", bullet lists of findings, tables of pass/fail, etc. There are no predefined field names.

Your job is to study the report and infer what SKILL.md check fields would need to exist for an AI pipeline to produce this same kind of report. For each distinct compliance requirement the report evaluates, define a check.

For each inferred check, you must determine all of the following fields. Here is what each field means and how the pipeline uses it — use this to infer correctly from the report:${CHECK_FIELD_DEFINITIONS}

Critically: the report may not explicitly state fields. You must look at what the report evaluates (e.g. "The controller was identified as required" → this is a boolean check on controller_identified). Be thorough — capture every compliance requirement the report touches.

Output a structured list of inferred checks with all 9 points above for each.`;

export const GENERATION_PROMPT = `You are a compliance assessment skill designer. Given sample documents, regulation reference documents, a reference compliance report, and an analysis of the checks inferred from that report, build a complete SKILL.md file.

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

Here is what each field means and how the pipeline uses it:${CHECK_FIELD_DEFINITIONS}

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
