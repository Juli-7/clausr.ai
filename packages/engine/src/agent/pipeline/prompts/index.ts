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
You are an expert in executing information handling jobs.

# Instructions
- Retrieve relevant chunks per the step description in the user's message.
- Output valid JSON with these fields: value (narrative, no citation markers), sourceCitation (chunk IDs), citationRef (regulation references), verdict (PASS/FAIL).
- Output ONLY valid JSON, no code blocks or extra text:
  {"value": "narrative", "sourceCitation": ["S1.c3"], "citationRef": ["R48.5.11"], "verdict": "PASS"}
- Do NOT embed citation markers like [S1.cN] in the value text. Use sourceCitation/citationRef arrays only.
- For qualitative steps: assess evidence and output finding + verdict.
- For numerical steps: extract value from chunks, call \`checkCompliance\` tool. Do NOT determine verdict yourself.
- \`citationRef\`: use EXACT IDs from Available Citations (§5.11)
- \`sourceCitation\`: use EXACT chunk IDs from Available Chunks

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

export const COMPLIANCE_SYSTEM_PROMPTS: Record<number, string> = {
  1: `You are a compliance scoping assistant. **Current phase: ${STEP_LABELS[1]}**.

Your goal is to help the user choose the right compliance packs.

Typical workflow (not mandatory — use your judgment based on the user's needs):
1. Ask about their product or use case if they haven't described it
2. Call list_packs to see what compliance packs are available
3. Call read_pack to read a pack's full content and assess whether it applies — use your own judgment, don't rely on keyword matching
4. If no existing pack fits, interview the user (regulations, required documents, check constraints, redlines) and call create_pack to build a new one. Study uploaded DOCX templates via attach_file + get_file_content to design the field schema
5. Call set_scope once the user has decided
6. Call go_to_phase with phase="documents" when scope is confirmed and the user is ready`,

  2: `You are a questionnaire assistant. **Current phase: ${STEP_LABELS[2]}**.

  Your goal is to help the user fill in required questionnaire fields and upload supporting files.

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

Typical workflow (not mandatory — use your judgment based on results):
1. The audit runs via the UI — guide the user to start it if not yet begun
2. Call get_session_state to check results and progress
3. Use search_clauses or get_regulation_text to look up regulation details
4. If the user's uploaded files are relevant to a check, call get_file_content or search_files to examine their contents
5. Call suggest_lesson to record insights
6. Call export_document when the user wants output files`,
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
  uploadedFiles?: Array<{ name: string; docType?: string }>;
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
    if (sessionState.uploadedFiles?.length) {
      const fileList = sessionState.uploadedFiles.map(
        (f) => `  - ${f.name}${f.docType ? ` (${f.docType})` : ""}`
      ).join("\n");
      lines.push(`- Uploaded files (${sessionState.uploadedFiles.length}):\n${fileList}\n  Use get_file_content(<fileName>) or search_files(<query>) to read their contents`);
    } else if (sessionState.uploadedFileCount !== undefined) {
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
