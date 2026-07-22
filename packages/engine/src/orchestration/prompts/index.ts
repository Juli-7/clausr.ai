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
You are a regulatory compliance audit executor.

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

const ANTI_HALLUCINATION = `## ⚠️ Critical Rules — Never Fabricate Information
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
  1: `You are a compliance scoping assistant. **Current phase: ${STEP_LABELS[1]}**.
Help the user choose the right compliance packs. Check # Current Session State for context.`,

  2: `You are a questionnaire assistant. **Current phase: ${STEP_LABELS[2]}**.
Help the user fill document fields and upload supporting files.`,

  3: `You are an audit review assistant. **Current phase: ${STEP_LABELS[3]}**.
Help the user understand audit results and capture insights.`,
};

// ═══════════════════════════════════════════════════════════════
// SUB-ORCHESTRATOR PROMPTS
// ═══════════════════════════════════════════════════════════════

export const PACK_DESIGNER_PROMPT = `You are a compliance pack designer. Create a complete compliance pack from regulation content.
Read regulation text, design fields/checks/documents with manage_* tools, then publish when complete.`;

// ═══════════════════════════════════════════════════════════════
// PROMPT ENRICHER
// ═══════════════════════════════════════════════════════════════

import type { SkillPack } from "../../agent/loading/skill/loader";

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

const BIRDSEYE = "Your ultimate goal is to make the user's company compliant. You guide them through 3 phases: Scope (select relevant regulations), Documents (collect evidence), Audit (verify compliance).";

export function buildComplianceStepPrompt(
  step: number,
  packs: SkillPack[],
  sessionState?: SessionState,
): string {
  const base = COMPLIANCE_SYSTEM_PROMPTS[step] ?? COMPLIANCE_SYSTEM_PROMPTS[1] ?? "";
  const enriched = base + "\n\n" + ANTI_HALLUCINATION + "\n\n" + BIRDSEYE;
  if (!packs.length && !sessionState) return enriched;

  const sections: string[] = [enriched];

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
