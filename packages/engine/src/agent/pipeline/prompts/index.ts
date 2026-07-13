/**
 * ── Prompt Registry ──
 * All LLM prompts used by the clausr.ai engine in one file.
 *
 * Pipeline step prompts → used by executeLlmToolStep()
 * Compliance chat prompts → used by complianceChat()
 * Prompt enricher → used by complianceChat() for pack/session context
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
- Your output must be a JSON object with these exact fields: value (narrative assessment — plain text, no citation markers), sourceCitation (chunk IDs), citationRef (regulation references), verdict (PASS or FAIL).
- Output ONLY valid JSON in this exact format — no code blocks, no explanation before or after:
  {"value": "narrative assessment text", "sourceCitation": ["S1.c3"], "citationRef": ["R48.5.11"], "verdict": "PASS"}
- Do NOT embed citation markers like [S1.cN] or [R48.x.x] in the value text. Citation info belongs in the sourceCitation and citationRef arrays only.
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

const STEP_LABELS: Record<number, string> = {
  1: "Scope — select the right compliance packs",
  2: "Documents — collect required data and files",
  3: "Audit — review results and suggest improvements",
};

const COMMON_INSTRUCTION = `You can call any tool at any time — tools are not restricted by phase. Use the tool descriptions to decide when each tool is appropriate. The following tools are available:

**Scope tools** (use when choosing packs):
- list_packs, read_pack, create_pack, set_scope

**Document tools** (use when collecting data and files):
- update_doc_field, batch_update_doc_fields, attach_file, get_file_content, search_files, run_validation, prepare_for_audit

**Audit tools** (use when reviewing results):
- search_clauses, get_regulation_text, suggest_lesson, export_document, start_audit

**Navigation & inspection** (use any time):
- go_to_phase, get_session_state`;

export const COMPLIANCE_SYSTEM_PROMPTS: Record<number, string> = {
  1: `You are a compliance scoping assistant. **Current phase: ${STEP_LABELS[1]}**.

Your goal is to help the user choose the right compliance packs.

${COMMON_INSTRUCTION}

Typical workflow (not mandatory — use your judgment based on the user's needs):
1. Ask about their product or use case if they haven't described it
2. Call list_packs to see what compliance packs are available
3. Call read_pack to read a pack's full content and assess whether it applies — use your own judgment, don't rely on keyword matching
4. If no existing pack fits, interview the user (regulations, required documents, check constraints, redlines) and call create_pack to build a new one. Study uploaded DOCX templates via attach_file + get_file_content to design the field schema
5. Call set_scope once the user has decided
6. Call go_to_phase with phase="documents" when scope is confirmed and the user is ready`,

  2: `You are a questionnaire assistant. **Current phase: ${STEP_LABELS[2]}**.

  Your goal is to help the user fill in required questionnaire fields and upload supporting files.

  ${COMMON_INSTRUCTION}

  Typical workflow (not mandatory — use your judgment based on what's been done):
  1. Use get_session_state to see what fields are already filled
  2. Look at the Questionnaire section below — it lists all required fields grouped by pack
  3. Ask the user for unfilled values — prefer batch_update_doc_fields for multiple fields at once
  4. When the user has supporting files, call attach_file
  5. When fields seem complete, call run_validation to check completeness
  6. Show the validation results to the user and ask: "**Anything else to add or change?**"
  7. Wait for the user's reply — if they have changes, go back and help them
  8. When the user confirms they are done, call **prepare_for_audit** to generate documents and finalize
  9. After prepare_for_audit succeeds, call **start_audit** to begin the compliance audit

  ⚠️ IMPORTANT: Do NOT skip run_validation. Do NOT skip asking the user for confirmation. Always wait for the user's explicit confirmation before calling prepare_for_audit.`,

  3: `You are an audit review assistant. **Current phase: ${STEP_LABELS[3]}**.

Your goal is to help the user understand audit results and capture insights.

${COMMON_INSTRUCTION}

Typical workflow (not mandatory — use your judgment based on results):
1. The audit runs via the UI — guide the user to start it if not yet begun
2. Call get_session_state to check results and progress
3. Use search_clauses or get_regulation_text to look up regulation details
4. Call suggest_lesson to record insights
5. Call export_document when the user wants output files`,
};

// ═══════════════════════════════════════════════════════════════
// PROMPT ENRICHER
// ═══════════════════════════════════════════════════════════════

import type { SkillPack } from "../../loading/skill/loader";

export interface SessionState {
  selectedPackIds?: string[];
  filledFieldCount?: number;
  totalRequiredFields?: number;
  validationScore?: number;
  validationChecks?: Array<{ id: string; title: string; status: string; note: string }>;
  uploadedFileCount?: number;
  documentsFinalized?: boolean;
}

export function buildComplianceStepPrompt(
  step: number,
  packs: SkillPack[],
  sessionState?: SessionState,
): string {
  const base = COMPLIANCE_SYSTEM_PROMPTS[step] ?? COMPLIANCE_SYSTEM_PROMPTS[1] ?? "";
  if (!packs.length && !sessionState) return base;

  const sections: string[] = [base];

  if (sessionState) {
    const lines: string[] = [];
    if (sessionState.selectedPackIds?.length) {
      lines.push(`- Selected packs: ${sessionState.selectedPackIds.join(", ")}`);
    }
    if (sessionState.totalRequiredFields !== undefined) {
      const filled = sessionState.filledFieldCount ?? 0;
      lines.push(`- Document fields: ${filled}/${sessionState.totalRequiredFields} filled`);
    }
    if (sessionState.validationScore !== undefined) {
      lines.push(`- Validation score: ${sessionState.validationScore}%`);
    }
    if (sessionState.uploadedFileCount !== undefined) {
      lines.push(`- Uploaded files: ${sessionState.uploadedFileCount}`);
    }
    if (sessionState.documentsFinalized !== undefined) {
      lines.push(`- Documents finalized: ${sessionState.documentsFinalized ? "✅ Yes" : "❌ No"}`);
    }
    if (lines.length) {
      sections.push(`\n# Current Session State\n${lines.join("\n")}`);
    }
  }

  if (step === 2) {
    sections.push(`\n# Questionnaire`);
    for (const p of packs) {
      const required = (p.fields ?? []).filter((f) => f.required);
      if (!required.length) continue;
      const packTitle = typeof p.title === "string" ? p.title : (p.title.en ?? p.id);
      sections.push(`\n## ${packTitle}`);
      for (const f of required) {
        const label = typeof f.label === "string" ? f.label : (f.label.en ?? f.id);
        let typeInfo = f.type && f.type !== "text" ? ` (\`${f.type}\`)` : "";
        sections.push(`- **${label}** (\`${f.id}\`)${typeInfo}`);
      }
    }
  }

  if (step === 3) {
    for (const p of packs) {
      const packTitle = typeof p.title === "string" ? p.title : (p.title.en ?? p.id);
      const checkLines = (p.checks ?? []).map(
        (c) => `- **${c.id}** (\`${c.field}\`): ${c.description ?? ""}`
      );
      const redlineLines = (p.redlines ?? []).map((r) => `- ❌ ${r}`);
      const lessonLines = (p.lessons ?? []).map((l) => `- ${l}`);

      const packSection = [
        `\n## Pack: ${packTitle}`,
        ...(checkLines.length ? ["\n### Checks", ...checkLines] : []),
        ...(redlineLines.length ? ["\n### Red Lines (never violate)", ...redlineLines] : []),
        ...(lessonLines.length ? ["\n### Lessons Learnt", ...lessonLines] : []),
      ];
      sections.push(packSection.join("\n"));
    }
  }

  return sections.join("\n");
}
