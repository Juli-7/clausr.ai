import { z } from "zod";
import {
  getComplianceSession, setComplianceScope, setComplianceStep,
  addComplianceDocField, addComplianceFile, getComplianceFiles, removeComplianceFile,
  setComplianceValidation, hasSessionSetup, loadSessionSetup,
  setComplianceAuditRunning, clearComplianceAuditResults,
} from "./agent/shared/memory/repository";
import type { ComplianceFile, DocFieldValue } from "./agent/shared/memory/repository";
import { setupSkill, processSessionFiles } from "./agent/loading/loading-orchestrator";
import { saveCompiledPack } from "./agent/loading/skill/loader";
import { saveLessonOverride, getLessonOverrides } from "./agent/shared/memory/repository";
import {
  setupPackAudit, runPendingChecks, retryCheck,
  getPackAuditState, finalizeAudit,
} from "./compliance-audit-tools";
import { searchPacks, getPack, packs } from "./compliance-packs";
import { buildSession } from "./compliance-session";
import { getRegulationApi } from "./agent/knowledge/regulation-api";
import { getDocStore } from "./agent/user-info/vector-store";

export type ToolName =
  | "set_scope"
  | "update_doc_field"
  | "batch_update_doc_fields"
  | "attach_file"
  | "detach_file"
  | "export_document"
  | "go_to_phase"
  | "search_packs"
  | "start_audit"
  | "setup_pack_audit"
  | "run_pending_checks"
  | "retry_check"
  | "get_pack_audit_state"
  | "finalize_audit"
  | "get_pack_details"
  | "recommend_packs"
  | "get_session_state"
  | "get_file_content"
  | "run_validation"
  | "search_clauses"
  | "get_regulation_text"
  | "search_files"
  | "suggest_lesson";

export const ToolSchemas = {
  set_scope: z.object({
    packIds: z.array(z.string()).describe("Pack IDs to select"),
  }),
  update_doc_field: z.object({
    docType: z.string().describe("Document type, e.g. declaration-of-conformity"),
    field: z.string().describe("Field name"),
    value: z.object({
      value: z.string().describe("Field value"),
      sourceCitation: z.array(z.string()).optional().describe("Source chunk IDs this value was derived from, e.g. ['S1.c3']"),
      citationRef: z.array(z.string()).optional().describe("Regulation clause IDs this value relates to, e.g. ['R48.6.2']"),
    }).describe("Field value with optional evidence provenance"),
  }),
  batch_update_doc_fields: z.object({
    docType: z.string().describe("Document type, e.g. declaration-of-conformity"),
    fields: z.record(z.string(), z.object({
      value: z.string().describe("Field value"),
      sourceCitation: z.array(z.string()).optional().describe("Source chunk IDs this value was derived from, e.g. ['S1.c3']"),
      citationRef: z.array(z.string()).optional().describe("Regulation clause IDs this value relates to, e.g. ['R48.6.2']"),
    })).describe("Record of field name → structured value with provenance"),
  }),
  attach_file: z.object({
    name: z.string().describe("Original file name"),
    size: z.string().describe("File size in KB"),
    time: z.string().describe("Upload date"),
    dataUrl: z.string().describe("Base64-encoded data URL"),
  }),
  detach_file: z.object({
    name: z.string().describe("Name of the file to detach/remove"),
  }),
  export_document: z.object({
    docType: z.string().describe("Document type to export"),
  }),
  go_to_phase: z.object({
    phase: z.enum(["scope", "documents", "audit"]).describe("Target phase. 'scope' to choose packs, 'documents' to collect data/files, 'audit' to review results."),
  }),
  search_packs: z.object({
    query: z.string().optional().describe("Search term"),
    regulation: z.string().optional().describe("Regulation filter"),
    industry: z.string().optional().describe("Industry filter"),
  }),
  start_audit: z.object({
    packIds: z.array(z.string()).optional().describe("Optional: specific pack IDs to audit. Defaults to all selected packs."),
    force: z.boolean().optional().describe("Set true to start audit even if documents are incomplete. Default false."),
  }),
  setup_pack_audit: z.object({
    packId: z.string().describe("Pack ID to set up for auditing"),
  }),
  run_pending_checks: z.object({
    packId: z.string().describe("Pack ID whose ready checks to execute"),
    maxConcurrency: z.number().optional().describe("Max concurrent check executions (default 20)"),
  }),
  retry_check: z.object({
    packId: z.string().describe("Pack ID containing the check to retry"),
    checkId: z.string().describe("Check ID to retry — cascades to all dependents"),
  }),
  get_pack_audit_state: z.object({
    packId: z.string().describe("Pack ID to get audit state for"),
  }),
  finalize_audit: z.object({}).describe("Finalize the audit — sets auditDone=true, stores final results."),
  get_pack_details: z.object({
    packId: z.string().describe("Pack ID"),
  }),
  recommend_packs: z.object({
    productDescription: z.string().describe("Product description"),
  }),
  get_session_state: z.object({}),
  get_file_content: z.object({
    fileName: z.string().describe("Name of the uploaded file to read"),
  }),
  run_validation: z.object({}),
  search_clauses: z.object({
    keyword: z.string().describe("Keyword to search for across regulation clauses"),
    regulationCodes: z.array(z.string()).optional().describe("Filter: only search within these regulation codes"),
  }),
  get_regulation_text: z.object({
    code: z.string().describe("Regulation code, e.g. R48"),
    clauseNumber: z.string().optional().describe("Optional clause number within the regulation"),
  }),
  search_files: z.object({
    query: z.string().describe("Search query to find relevant file chunks"),
  }),
  suggest_lesson: z.object({
    skillName: z.string().describe("Name of the skill to add the lesson to"),
    text: z.string().describe("Lesson text describing what was learned"),
    sourceCheck: z.string().optional().describe("The check field name this lesson relates to"),
    applyToSkill: z.boolean().optional().default(false).describe("Set true after user confirms — permanently writes the lesson into SKILL.md"),
  }),
} as const;

export type ToolInput<T extends ToolName> = z.infer<typeof ToolSchemas[T]>;

async function ensureSetup(sessionId: string) {
  if (hasSessionSetup(sessionId)) return;
  const session = getComplianceSession(sessionId);
  if (!session) return;
  const firstPack = session.selectedPackIds[0];
  if (firstPack) {
    try { await setupSkill(sessionId, firstPack); }
    catch { /* skill may not exist */ }
  }
}

export interface ToolDef {
  name: ToolName;
  description: string;
  inputSchema: z.ZodTypeAny | undefined;
  logLabel: string;
  mutates: boolean;
  execute: (sessionId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export const TOOL_DEFS: Record<ToolName, ToolDef> = {
  set_scope: {
    name: "set_scope",
    description: "Select compliance packs to include in the assessment. Call after searching or getting recommendations — once the user has chosen which packs apply. Precondition: user has decided on pack(s).",
    inputSchema: ToolSchemas.set_scope,
    logLabel: "Set compliance scope",
    mutates: true,
    execute: async (sessionId, input) => {
      const packIds = input.packIds as string[];
      setComplianceScope(sessionId, packIds);
      return { selectedPackIds: packIds };
    },
  },

  update_doc_field: {
    name: "update_doc_field",
    description: "Save a value for a single document field (e.g. manufacturer name on Declaration of Conformity). Prefer batch_update_doc_fields when filling multiple fields at once. Call during 'documents' phase after identifying unfilled required fields from session state.",
    inputSchema: ToolSchemas.update_doc_field,
    logLabel: "Update document field",
    mutates: true,
    execute: async (sessionId, input) => {
      const { docType, field, value } = input as { docType: string; field: string; value: DocFieldValue };
      addComplianceDocField(sessionId, docType, field, value);
      const s = getComplianceSession(sessionId);
      return { docData: s?.docData ?? {} };
    },
  },

  batch_update_doc_fields: {
    name: "batch_update_doc_fields",
    description: "Fill multiple document fields at once for a document type (e.g. company name, address, phone on Declaration of Conformity). PREFER this over calling update_doc_field repeatedly. Call during 'documents' phase after identifying unfilled required fields. Precondition: user has provided values for the fields.",
    inputSchema: ToolSchemas.batch_update_doc_fields,
    logLabel: "Batch update document fields",
    mutates: true,
    execute: async (sessionId, input) => {
      const { docType, fields } = input as { docType: string; fields: Record<string, DocFieldValue> };
      for (const [field, value] of Object.entries(fields)) {
        addComplianceDocField(sessionId, docType, field, value);
      }
      const s = getComplianceSession(sessionId);
      return { docData: s?.docData ?? {} };
    },
  },

  attach_file: {
    name: "attach_file",
    description: "Upload a file (manual PDF, DOCX, image, etc.) and attach it to the session. Call during 'documents' phase when the user provides a supporting document. After attaching, use get_session_state to see processed files or get_file_content to read extracted text.",
    inputSchema: ToolSchemas.attach_file,
    logLabel: "Attach file",
    mutates: true,
    execute: async (sessionId, input) => {
      const file = input as unknown as ComplianceFile;
      addComplianceFile(sessionId, file);
      await ensureSetup(sessionId);
      try {
        await processSessionFiles({
          sessionId,
          files: [{
            name: file.name,
            type: file.dataUrl?.split(";")[0]?.split(":")[1] || "application/octet-stream",
            size: parseInt(file.size) || 0,
            dataUrl: file.dataUrl ?? "",
          }],
        });
      } catch { /* file processing may fail silently */ }
      const session = buildSession(sessionId);
      return { files: session?.uploadedFiles ?? [] };
    },
  },

  detach_file: {
    name: "detach_file",
    description: "Remove a previously attached file by name. Call when the user explicitly asks to remove or delete a file they uploaded.",
    inputSchema: ToolSchemas.detach_file,
    logLabel: "Detach file",
    mutates: true,
    execute: async (sessionId, input) => {
      const { name } = input as { name: string };
      removeComplianceFile(sessionId, name);
      const session = buildSession(sessionId);
      return { files: session?.uploadedFiles ?? [] };
    },
  },

  export_document: {
    name: "export_document",
    description: "Generate a downloadable file for a completed document. Call during 'audit' phase when the user asks for output. Precondition: document fields have been filled and validation has passed.",
    inputSchema: ToolSchemas.export_document,
    logLabel: "Export document",
    mutates: false,
    execute: async (sessionId, input) => {
      const { docType } = input as { docType: string };
      return { downloadUrl: `/api/compliance/session/${sessionId}/export/${docType}` };
    },
  },

  go_to_phase: {
    name: "go_to_phase",
    description: "Move to a different phase of the compliance workflow. Phases: 'scope' (choose packs), 'documents' (collect data and upload files), 'audit' (review results). Call this when you and the user agree the current phase's work is done and it's time to move forward. Precondition: 'scope' requires packs selected; 'documents' requires scope set; 'audit' requires validation passed.",
    inputSchema: ToolSchemas.go_to_phase,
    logLabel: "Go to phase",
    mutates: true,
    execute: async (sessionId, input) => {
      const { phase } = input as { phase: "scope" | "documents" | "audit" };
      const stepMap: Record<"scope" | "documents" | "audit", 1 | 2 | 3> = { scope: 1, documents: 2, audit: 3 };
      const step = stepMap[phase];
      setComplianceStep(sessionId, step);
      if (step >= 2) await ensureSetup(sessionId);
      const s = getComplianceSession(sessionId);
      return { step, selectedPackIds: s?.selectedPackIds ?? [] };
    },
  },

  search_packs: {
    name: "search_packs",
    description: "Find compliance packs by keyword, regulation, or industry. Call during 'scope' phase when you need to identify relevant packs. Use before set_scope. Precondition: user has described their product or you have keywords to search.",
    inputSchema: ToolSchemas.search_packs,
    logLabel: "Search packs",
    mutates: false,
    execute: async (_sessionId, input) => {
      const result = searchPacks(input as { query?: string; regulation?: string; industry?: string });
      return {
        packs: result.map((p) => ({ id: p.id, title: p.title, desc: p.desc, regs: p.regs, inds: p.inds })),
        regs: packs.flatMap((p) => p.regs), inds: packs.flatMap((p) => p.inds),
      };
    },
  },

  start_audit: {
    name: "start_audit",
    description: "Start the compliance audit for selected packs. Sets up each selected pack, then runs ready checks. Call this once — the audit runs incrementally. Use setup_pack_audit, run_pending_checks, retry_check individually for fine-grained control. If documents are incomplete, call with force: true to start anyway.",
    inputSchema: ToolSchemas.start_audit,
    logLabel: "Start audit",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packIds, force } = input as { packIds?: string[]; force?: boolean };
      const s = getComplianceSession(sessionId);
      if (!s) return { error: "Session not found" };
      const auditPackIds = packIds ?? s.selectedPackIds;
      if (auditPackIds.length === 0) return { error: "No packs selected for audit" };

      const docData = s.docData;
      const missingFields: { pack: string; field: string }[] = [];
      for (const packId of auditPackIds) {
        const pack = getPack(packId);
        if (!pack) continue;
        for (const doc of pack.documents) {
          for (const field of doc.fields) {
            if (!field.required) continue;
            const value = docData[doc.type]?.[field.field]?.value?.trim();
            if (!value) {
              missingFields.push({ pack: pack.title, field: field.label });
            }
          }
        }
      }

      if (missingFields.length > 0) {
        const checks = missingFields.map((m) => ({
          id: `${m.pack}:${m.field}`,
          title: m.field,
          status: "fail" as const,
          note: "Required field is empty",
        }));
        setComplianceValidation(sessionId, checks, 0);

        if (!force) {
          return {
            auditStarted: false,
            missingFields: missingFields.length,
            hints: missingFields.map((m) => `[${m.pack}] ${m.field}`),
            message: `${missingFields.length} required field(s) are empty. Ask the user if they want to fill them first or start the audit anyway.`,
          };
        }
      }

      setComplianceAuditRunning(sessionId, true);
      clearComplianceAuditResults(sessionId);

      // Set up each pack and run initial checks
      const results: Record<string, unknown>[] = [];
      for (const packId of auditPackIds) {
        const setupResult = await setupPackAudit(sessionId, packId);
        const runResult = await runPendingChecks(sessionId, packId);
        results.push({ ...setupResult, checksCompleted: runResult.completed, checksFailed: runResult.failed });
      }

      return {
        auditStarted: true,
        packIds: auditPackIds,
        validationPassed: missingFields.length === 0,
        validationHints: missingFields.length > 0 ? missingFields.map((m) => `[${m.pack}] ${m.field}`) : [],
        packResults: results,
      };
    },
  },

  setup_pack_audit: {
    name: "setup_pack_audit",
    description: "Set up a pack for audit — loads its skill, generates check steps, and initializes per-check state. Must be called before run_pending_checks for a pack. Returns the list of checks with their dependency depths.",
    inputSchema: ToolSchemas.setup_pack_audit,
    logLabel: "Setup pack audit",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId } = input as { packId: string };
      return await setupPackAudit(sessionId, packId) as unknown as Record<string, unknown>;
    },
  },

  run_pending_checks: {
    name: "run_pending_checks",
    description: "Execute all ready checks for a pack (dependencies satisfied, state=pending). Processes one dependency depth level per call. Call repeatedly until allDone=true or blocked=true. Results accumulate in audit state and are pollable via get_pack_audit_state.",
    inputSchema: ToolSchemas.run_pending_checks,
    logLabel: "Run pending checks",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId, maxConcurrency } = input as { packId: string; maxConcurrency?: number };
      return await runPendingChecks(sessionId, packId, maxConcurrency) as unknown as Record<string, unknown>;
    },
  },

  retry_check: {
    name: "retry_check",
    description: "Retry a specific check that failed. Resets the check and all its transitive dependents to pending state. Call run_pending_checks afterward to re-execute. Does NOT re-execute the check itself.",
    inputSchema: ToolSchemas.retry_check,
    logLabel: "Retry check",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId, checkId } = input as { packId: string; checkId: string };
      return await retryCheck(sessionId, packId, checkId) as unknown as Record<string, unknown>;
    },
  },

  get_pack_audit_state: {
    name: "get_pack_audit_state",
    description: "Get the current audit state for a pack — per-check status (pending/ready/running/done/failed), verdicts, reasoning, and errors. Call after run_pending_checks to see results, or during retry_check to see which checks were reset.",
    inputSchema: ToolSchemas.get_pack_audit_state,
    logLabel: "Get pack audit state",
    mutates: false,
    execute: async (sessionId, input) => {
      const { packId } = input as { packId: string };
      const state = getPackAuditState(sessionId, packId);
      if (!state) return { error: "Pack not set up" };
      return state as unknown as Record<string, unknown>;
    },
  },

  finalize_audit: {
    name: "finalize_audit",
    description: "Finalize the compliance audit — stores final results for all packs, sets auditDone=true, and sets auditRunning=false. Call after all packs are done (check via get_pack_audit_state or the auditDone session field). No more checks will be executed after this.",
    inputSchema: ToolSchemas.finalize_audit,
    logLabel: "Finalize audit",
    mutates: true,
    execute: async (sessionId, _input) => {
      return await finalizeAudit(sessionId) as unknown as Record<string, unknown>;
    },
  },

  get_pack_details: {
    name: "get_pack_details",
    description: "Get full details for a compliance pack — checks, required documents, and field definitions. Call during 'scope' phase when the user wants to understand what a pack requires before selecting it. Precondition: you have a pack ID from search_packs or recommend_packs.",
    inputSchema: ToolSchemas.get_pack_details,
    logLabel: "Get pack details",
    mutates: false,
    execute: async (_sessionId, input) => {
      const { packId } = input as { packId: string };
      const pack = getPack(packId);
      return (pack ?? { error: "Pack not found" }) as Record<string, unknown>;
    },
  },

  recommend_packs: {
    name: "recommend_packs",
    description: "Get AI-driven recommendations for which compliance packs apply based on a product description. Call during 'scope' phase when you need a starting point. Precondition: user has described their product or use case.",
    inputSchema: ToolSchemas.recommend_packs,
    logLabel: "Recommend packs",
    mutates: false,
    execute: async (_sessionId, input) => {
      const { productDescription } = input as { productDescription: string };
      const results = searchPacks({ query: productDescription });
      const recommendations = results.slice(0, 3).map((p) => ({
        id: p.id, title: p.title,
        reason: `${p.title} covers ${p.regs.join(", ")} which applies to ${p.inds.join(", ")} products.`,
      }));
      return { recommendations, reasoning: `Based on your product description, I recommend these packs.` };
    },
  },

  get_session_state: {
    name: "get_session_state",
    description: "Request the full current session — selected packs, filled fields, uploaded files, audit results, validation score and checks. Call at any time to check what's been done and what's outstanding. Useful after run_validation or before deciding the phase is complete.",
    inputSchema: ToolSchemas.get_session_state,
    logLabel: "Get session state",
    mutates: false,
    execute: async (sessionId) => {
      const session = buildSession(sessionId);
      if (!session) return { error: "Session not found" };
      return session as unknown as Record<string, unknown>;
    },
  },

  get_file_content: {
    name: "get_file_content",
    description: "Read the extracted text from an uploaded file. Call after attach_file when you need to inspect file contents to fill document fields or answer user questions. Precondition: file has been uploaded via attach_file.",
    inputSchema: ToolSchemas.get_file_content,
    logLabel: "Get file content",
    mutates: false,
    execute: async (sessionId, input) => {
      const { fileName } = input as { fileName: string };

      // Try processed file registry first
      const setup = loadSessionSetup(sessionId);
      if (setup) {
        const entry = setup.fileRegistry.find((f) => f.filename === fileName);
        if (entry?.extractedText) {
          return { fileName, extractedText: entry.extractedText, source: "processed" };
        }
      }

      // Fall back to raw base64 from file list
      const files = getComplianceFiles(sessionId);
      const file = files.find((f) => f.name === fileName);
      if (file?.dataUrl) {
        const b64 = file.dataUrl.split(",")[1] ?? "";
        const raw = typeof Buffer !== "undefined" ? Buffer.from(b64, "base64").toString("utf-8") : "";
        const truncated = raw.length > 5000 ? raw.slice(0, 5000) + "\n...(truncated)" : raw;
        return { fileName, extractedText: truncated, source: "raw-base64" };
      }

      return { error: `File "${fileName}" not found` };
    },
  },

  run_validation: {
    name: "run_validation",
    description: "Check document completeness — verify all required fields across selected packs are filled. Call during 'documents' phase to confirm everything is ready before moving to audit. Use get_session_state after this to see results.",
    inputSchema: ToolSchemas.run_validation,
    logLabel: "Run validation",
    mutates: true,
    execute: async (sessionId) => {
      const s = getComplianceSession(sessionId);
      if (!s) return { error: "Session not found" };

      const docData = s.docData;
      const checks: { id: string; title: string; status: "pass" | "warn" | "fail"; note: string }[] = [];

      for (const packId of s.selectedPackIds) {
        const pack = getPack(packId);
        if (!pack) continue;

        for (const doc of pack.documents) {
          for (const field of doc.fields) {
            if (!field.required) continue;
            const value = docData[doc.type]?.[field.field]?.value?.trim();
            const filled = !!value;
            checks.push({
              id: `${packId}:${doc.type}:${field.field}`,
              title: `[${pack.title}] ${field.label}`,
              status: filled ? "pass" : "fail",
              note: filled ? "" : "Required field is empty",
            });
          }
        }
      }

      const passed = checks.filter((c) => c.status === "pass").length;
      const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 100;
      const missing = checks.filter((c) => c.status === "fail").length;
      setComplianceValidation(sessionId, checks, score);
      return { checks, score, missing, total: checks.length };
    },
  },

  search_clauses: {
    name: "search_clauses",
    description: "Search regulation clauses by keyword across available regulations. Call during 'audit' phase when you need to look up specific regulatory requirements. Precondition: you have a keyword or topic to search for.",
    inputSchema: ToolSchemas.search_clauses,
    logLabel: "Search clauses",
    mutates: false,
    execute: async (_sessionId, input) => {
      const { keyword, regulationCodes } = input as { keyword: string; regulationCodes?: string[] };
      const api = await getRegulationApi();
      const result = await api.searchClauses({ keyword, regulationCodes });
      if (!result.success || !result.data) return { results: [] };
      return { results: result.data.map((r) => ({ regulationCode: r.regulationCode, clauseNumber: r.clause.number, title: r.clause.title, text: r.clause.text })) };
    },
  },

  get_regulation_text: {
    name: "get_regulation_text",
    description: "Get the full text of a regulation or a specific clause. Call during 'audit' phase when you need details on a specific regulation. Precondition: you know the regulation code (e.g. 'R48') from search_clauses or pack details.",
    inputSchema: ToolSchemas.get_regulation_text,
    logLabel: "Get regulation text",
    mutates: false,
    execute: async (_sessionId, input) => {
      const { code, clauseNumber } = input as { code: string; clauseNumber?: string };
      const api = await getRegulationApi();
      if (clauseNumber) {
        const result = await api.getClause({ regulationCode: code, clauseNumber });
        if (!result.success || !result.data) return { error: "Clause not found" };
        return { regulationCode: result.regulationCode ?? code, clauseNumber: result.data.number, title: result.data.title, text: result.data.text };
      }
      const result = await api.getRegulation({ code });
      if (!result.success || !result.data) return { error: "Regulation not found" };
      return { code: result.data.code, title: result.data.title, description: result.data.description, clauses: result.data.clauses.map((c) => ({ number: c.number, title: c.title, text: c.text })) };
    },
  },

  search_files: {
    name: "search_files",
    description: "Search uploaded file content by keyword to find relevant information. Call during 'documents' or 'audit' phase when you need to locate specific data in uploaded documents. Precondition: files have been uploaded via attach_file.",
    inputSchema: ToolSchemas.search_files,
    logLabel: "Search files",
    mutates: false,
    execute: async (sessionId, input) => {
      const { query } = input as { query: string };
      const store = getDocStore();
      const files = await store.getFiles(sessionId);
      const results: { filename: string; excerpt: string }[] = [];
      for (const file of files) {
        const idx = file.extractedText.toLowerCase().indexOf(query.toLowerCase());
        if (idx !== -1) {
          const start = Math.max(0, idx - 100);
          const end = Math.min(file.extractedText.length, idx + query.length + 300);
          results.push({ filename: file.filename, excerpt: file.extractedText.slice(start, end) });
        }
      }
      return { results };
    },
  },

  suggest_lesson: {
    name: "suggest_lesson",
    description: "Record a lesson learned from an audit finding. Call during 'audit' phase when you spot a pattern or insight worth saving. On first call, saves as pending; if user confirms, call again with applyToSkill=true to write permanently. Precondition: audit has produced findings worth capturing.",
    inputSchema: ToolSchemas.suggest_lesson,
    logLabel: "Suggest lesson",
    mutates: true,
    execute: async (sessionId, input) => {
      const { skillName, text, sourceCheck, applyToSkill } = input as { skillName: string; text: string; sourceCheck?: string; applyToSkill?: boolean };

      const entry = sourceCheck ? `**${sourceCheck}**: ${text}` : text;

      if (applyToSkill) {
        saveCompiledPack(skillName, { lessons: [entry] });
        saveLessonOverride(skillName, entry);
        return { saved: true, lesson: entry, message: "Lesson permanently added to skill." };
      }

      saveLessonOverride(skillName, entry);
      const all = getLessonOverrides(skillName);
      return { saved: true, lesson: entry, pendingCount: all.length, message: "Lesson saved as pending. Ask the user to confirm, then call suggest_lesson again with applyToSkill=true to make it permanent." };
    },
  },

};

export function getTool(name: string) {
  return TOOL_DEFS[name as ToolName];
}
