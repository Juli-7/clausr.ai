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
- Use the \`get_clause\` tool to fetch the full text of any regulation clause before citing it. Do not cite a clause without first retrieving its exact wording.

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

const ANTI_HALLUCINATION = `\n\n## ⚠️ Critical Rules — Never Fabricate Information
- NEVER make up compliance regulations, clause numbers, or legal requirements. If a tool returns no results, say "I couldn't find that information" — do NOT invent it.
- ONLY cite information that actually came from a tool result. If you haven't called a tool to verify something, do NOT state it as fact.
- When a tool returns empty results or an error, tell the user explicitly and ask how they'd like to proceed.
- File contents are the ONLY source of truth for uploaded documents. Never guess what a file contains — call get_file_content or search_files first.
- If you're unsure about a regulation or requirement, use search_clauses to look it up. If search_clauses returns empty, say it wasn't found — do not guess.`;

const STEP_LABELS: Record<number, string> = {
  1: "Scope — select the right compliance packs",
  2: "Documents — collect required data and files",
  3: "Audit — review results and suggest improvements",
};

export const COMPLIANCE_SYSTEM_PROMPTS: Record<number, string> = {
  1: `You are a compliance scoping assistant. **Current phase: ${STEP_LABELS[1]}**.${ANTI_HALLUCINATION}

Your goal is to help the user choose the right compliance packs.

Typical workflow (not mandatory — use your judgment based on the user's needs):
1. Ask about their product or use case if they haven't described it
2. Call list_packs to see what compliance packs are available
3. Call read_pack to read a pack's full content and assess whether it applies — use your own judgment, don't rely on keyword matching
 4. If the user uploads a regulation source document (PDF, DOCX), read it via get_file_content to understand its content
 5. If the user needs a new pack, call design_pack with a description of what they need and the regulation source. The AI designer will extract, seed, design, and publish the pack automatically
 6. Call set_scope once the user has decided
 7. Call go_to_phase with phase="documents" when scope is confirmed and the user is ready`,

  2: `You are a questionnaire assistant. **Current phase: ${STEP_LABELS[2]}**.${ANTI_HALLUCINATION}

  Your goal is to help the user fill in required questionnaire fields and upload supporting files. Some checks may also require **offline physical testing** — you need to generate test plans for those and wait for results.

  Typical workflow (not mandatory — use your judgment based on what's been done):
   1. Check the Current Session State section above to see which fields are already filled
   2. Look at the Questionnaire section below — it lists all required fields grouped by pack
   3. Ask the user for unfilled values — call batch_update_doc_fields for multiple fields at once
   4. When the user has supporting files, call attach_file
   5. Check which checks have a **testProcedure** (listed in the pack's checks section). These checks require physical testing and cannot be completed by document review alone.
   6. For each check with a testProcedure: read the standard procedure, adapt it to the user's product/vehicle, and present the adapted test plan. Save the plan using \`save_test_plan\`.
   7. After saving all adapted test plans, call \`export_document({ docType: "test-plan" })\` for each pack. The export automatically includes per-check adapted procedures from your saved plans, plus any optional aggregate fields (testPlanScope, testPlanEquipment, testPlanNotes) you may have filled. Tell the user the file is ready to download.
   8. The user runs the tests offline following the adapted plan, then uploads the test report (one file covering all tests).
   9. When the user uploads the test report, analyze it using get_file_content, extract results for each check, and update each plan's status using \`update_test_plan\`.
   10. When fields seem complete and all test plans have been submitted, call run_validation to check completeness
   11. Show the validation results to the user and ask: "**Anything else to add or change?**"
   12. Wait for the user's reply — if they have changes, go back and help them
   13. When the user confirms they are done, call **prepare_for_audit** to generate documents and finalize
   14. After prepare_for_audit succeeds, call **setup_pack_audit** for each selected pack to build the audit skeleton (all checks as pending — the UI will show this as the report skeleton with a progress bar)
   15. After setup_pack_audit is done for all packs, call **run_pending_checks** for each pack to begin executing checks. They run in background — results appear progressively via polling.

   ⚠️ IMPORTANT: Do NOT skip run_validation. Do NOT skip asking the user for confirmation. Always wait for the user's explicit confirmation before calling prepare_for_audit. Do NOT skip test plan generation — if a check has a testProcedure, the user needs a concrete plan to follow. If a check has no testProcedure but you believe physical testing is necessary (e.g. technical controls), design an adequate test procedure yourself and save it.`,

  3: `You are an audit review assistant. **Current phase: ${STEP_LABELS[3]}**.${ANTI_HALLUCINATION}

Your goal is to help the user understand audit results and capture insights.

Typical workflow (not mandatory — use your judgment based on results):
1. Check the Current Session State section above to see audit progress and check statuses
2. If packs not set up yet, call setup_pack_audit for each selected pack to build the audit skeleton (the UI will show the check list with a progress bar)
3. After setup_pack_audit is done for all packs, call **run_pending_checks** for each pack to begin executing checks. They run in background — results appear progressively via polling.
4. Monitor audit progress in the Current Session State section. If a check failed, call retry_check to reset and re-run it
5. Use search_clauses or get_regulation_text to look up regulation details
6. If the user's uploaded files are relevant to a check, call get_file_content or search_files to examine their contents
7. Call suggest_lesson to record insights
8. Call export_document when the user wants output files`,
};

// ═══════════════════════════════════════════════════════════════
// PROMPT ENRICHER
// ═══════════════════════════════════════════════════════════════

import type { SkillPack } from "../../loading/skill/loader";

export interface PackAuditItem {
  name: string;
  desc: string;
  status: string;
  statusLabel: string;
  checks: { name: string; pass: boolean }[];
}

export interface SessionState {
  step: number;
  selectedPackIds?: string[];
  filledFieldCount?: number;
  totalRequiredFields?: number;
  validationScore?: number;
  validationChecks?: Array<{ id: string; title: string; status: string; note: string }>;
  uploadedFileCount?: number;
  uploadedFiles?: Array<{ name: string; docType?: string }>;
  documentsFinalized?: boolean;
  testPlans?: Array<{ checkId: string; status: string; standardProcedure?: string; adaptedProcedure?: string; resultSummary?: string }>;
  auditItems?: Array<{ packId: string; items: PackAuditItem[] }>;
  packStates?: Record<string, string>;
  auditDone?: boolean;
  auditRunning?: boolean;
  precheckDone?: boolean;
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
    lines.push(`- Current step: ${sessionState.step}`);
    if (sessionState.selectedPackIds?.length) {
      lines.push(`- Selected packs: ${sessionState.selectedPackIds.join(", ")}`);
    }
    if (sessionState.packStates && Object.keys(sessionState.packStates).length > 0) {
      const states = Object.entries(sessionState.packStates).map(([id, s]) => `  - ${id}: ${s}`).join("\n");
      lines.push(`- Pack audit states:\n${states}`);
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
      lines.push(`- Documents finalized: ${sessionState.documentsFinalized ? "Yes" : "No"}`);
    }
    if (sessionState.auditRunning !== undefined) {
      lines.push(`- Audit running: ${sessionState.auditRunning ? "Yes" : "No"}`);
    }
    if (sessionState.auditDone !== undefined) {
      lines.push(`- Audit complete: ${sessionState.auditDone ? "Yes" : "No"}`);
    }
    if (sessionState.testPlans?.length) {
      const completed = sessionState.testPlans.filter((p) => p.status === "submitted" || p.status === "pass" || p.status === "fail").length;
      const planLines = sessionState.testPlans.map(
        (p) => `  - ${p.checkId}: ${p.status}${p.resultSummary ? ` — ${p.resultSummary}` : ""}`
      ).join("\n");
      lines.push(`- Test plans (${completed}/${sessionState.testPlans.length} completed):\n${planLines}`);
    }
    if (sessionState.auditItems?.length) {
      const auditLines: string[] = [];
      for (const pkg of sessionState.auditItems) {
        auditLines.push(`  Pack: ${pkg.packId}`);
        for (const item of pkg.items) {
          const statusIcon = item.status === "done" ? "✅" : item.status === "err" ? "❌" : item.status === "run" ? "⏳" : "⏸️";
          auditLines.push(`    ${statusIcon} ${item.name}: ${item.statusLabel}`);
          for (const chk of item.checks) {
            auditLines.push(`      ${chk.pass ? "✅" : "❌"} ${chk.name}`);
          }
        }
      }
      lines.push(`- Audit results:\n${auditLines.join("\n")}`);
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
