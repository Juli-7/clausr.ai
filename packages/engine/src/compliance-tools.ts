import { z } from "zod";
import {
  getComplianceSession, setComplianceScope, setComplianceStep,
  addComplianceDocField, addComplianceFile, getComplianceFiles, removeComplianceFile,
  setComplianceValidation, hasSessionSetup, loadSessionSetup,
  setComplianceAuditRunning, clearComplianceAuditResults,
  setComplianceDocumentsFinalized,
} from "./agent/shared/memory/repository";
import type { ComplianceFile, DocFieldValue } from "./agent/shared/memory/repository";
import { setupSkill, processSessionFiles } from "./agent/loading/loading-orchestrator";
import { saveLessonOverride, getLessonOverrides } from "./agent/shared/memory/repository";
import {
  setupPackAudit, runPendingChecks, retryCheck,
  getPackAuditState, finalizeAudit,
} from "./compliance-audit-tools";
import { getPack, packs, readPackContent, writePack, appendPackLessons } from "./compliance-packs";
import type { CreatePackInput } from "./compliance-packs";
import { buildSession } from "./compliance-session";
import { getRegulationApi } from "./agent/knowledge/regulation-api";
import { getDocStore } from "./agent/user-info/vector-store";
import { generateDocx } from "./agent/present/export/export-docx";
import type { AgentResponse } from "./agent/shared/types";

export type ToolName =
  | "set_scope"
  | "update_doc_field"
  | "batch_update_doc_fields"
  | "attach_file"
  | "detach_file"
  | "export_document"
  | "go_to_phase"
  | "list_packs"
  | "read_pack"
  | "create_pack"
  | "start_audit"
  | "setup_pack_audit"
  | "run_pending_checks"
  | "retry_check"
  | "get_pack_audit_state"
  | "finalize_audit"
  | "get_session_state"
  | "get_file_content"
  | "run_validation"
  | "prepare_for_audit"
  | "search_clauses"
  | "get_regulation_text"
  | "search_files"
  | "suggest_lesson";

export const ToolSchemas = {
  set_scope: z.object({
    packIds: z.array(z.string()).describe("Pack IDs to select"),
  }),
  update_doc_field: z.object({
    field: z.string().describe("Field ID, e.g. 'manufacturer'"),
    value: z.object({
      value: z.string().describe("Field value"),
      sourceCitation: z.array(z.string()).optional().describe("Source chunk IDs this value was derived from, e.g. ['S1.c3']"),
      citationRef: z.array(z.string()).optional().describe("Regulation clause IDs this value relates to, e.g. ['R48.6.2']"),
    }).describe("Field value with optional evidence provenance"),
  }),
  batch_update_doc_fields: z.object({
    fields: z.record(z.string(), z.object({
      value: z.string().describe("Field value"),
      sourceCitation: z.array(z.string()).optional().describe("Source chunk IDs this value was derived from, e.g. ['S1.c3']"),
      citationRef: z.array(z.string()).optional().describe("Regulation clause IDs this value relates to, e.g. ['R48.6.2']"),
    })).describe("Record of field ID → structured value with provenance"),
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
  list_packs: z.object({}).describe("List all available compliance packs with titles and metadata"),
  read_pack: z.object({
    packId: z.string().describe("Pack ID to read — returns the pack's full content so you can assess relevance"),
  }),
  create_pack: z.object({
    id: z.string().describe("Pack ID / directory name — lowercase, hyphens, e.g. 'ev-battery-r100'"),
    title: z.union([z.string(), z.record(z.string(), z.string())]).describe("Pack title string or i18n record like { en, cn }"),
    description: z.union([z.string(), z.record(z.string(), z.string())]).describe("Pack description string or i18n record"),
    industries: z.array(z.string()).describe("Industries this pack applies to, e.g. ['automotive']"),
    icon: z.string().optional().describe("Emoji icon for the pack"),
    version: z.string().optional().describe("Semver version, defaults to 1.0.0"),
    regulation_ids: z.array(z.string()).optional().describe("Regulation codes e.g. ['R100']"),
    fields: z.array(z.object({
      id: z.string(),
      label: z.union([z.string(), z.record(z.string(), z.string())]),
      type: z.enum(["text", "textarea", "number", "boolean", "select", "date"]).optional(),
      required: z.boolean().optional(),
      options: z.array(z.object({
        value: z.string(),
        label: z.union([z.string(), z.record(z.string(), z.string())]),
      })).optional(),
      validation: z.object({ min: z.number().optional(), max: z.number().optional(), maxLength: z.number().optional() }).optional(),
    })).describe("Questionnaire fields required from the user"),
    documents: z.array(z.object({
      type: z.string(),
      title: z.union([z.string(), z.record(z.string(), z.string())]),
      template: z.string().optional().describe("Path to template in assets/, e.g. 'assets/declaration.docx'"),
      fields: z.array(z.string()),
    })).describe("Document templates referencing field IDs"),
    checks: z.array(z.object({
      id: z.string(),
      field: z.string(),
      type: z.enum(["number", "boolean", "narrative", "string", "enum"]),
      description: z.string(),
      clause: z.string().optional(),
      constraint: z.string().optional(),
      rounding: z.number().optional(),
      depends_on: z.array(z.string()).optional(),
      sample: z.string().optional(),
    })).describe("Compliance checks the LLM will evaluate"),
    redlines: z.array(z.string()).describe("Rules the LLM must never violate during audit"),
    lessons: z.array(z.string()).optional().describe("Accumulated knowledge — starts empty"),
    templates: z.array(z.object({
      docType: z.string().describe("Document type key matching a documents[].type"),
      dataUrl: z.string().describe("Base64-encoded DOCX file data URL"),
    })).optional().describe("Uploaded DOCX template files to store in assets/"),
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
  get_session_state: z.object({}),
  get_file_content: z.object({
    fileName: z.string().describe("Name of the uploaded file to read"),
  }),
  run_validation: z.object({}),
  prepare_for_audit: z.object({}).describe("Generate documents from questionnaire, store them as chunked files, and mark documents as finalized. Must call run_validation first. Must get user confirmation before calling this."),
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
    description: "Select compliance packs to include in the assessment. Call after reading packs via read_pack and the user has chosen which ones apply. Precondition: user has decided on pack(s).",
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
    description: "Save a value for a single questionnaire field (e.g. manufacturer name). Prefer batch_update_doc_fields when filling multiple fields at once. Call during 'documents' phase after identifying unfilled required fields from session state.",
    inputSchema: ToolSchemas.update_doc_field,
    logLabel: "Update document field",
    mutates: true,
    execute: async (sessionId, input) => {
      const { field, value } = input as { field: string; value: DocFieldValue };
      addComplianceDocField(sessionId, field, value);
      const s = getComplianceSession(sessionId);
      return { docData: s?.docData ?? {} };
    },
  },

  batch_update_doc_fields: {
    name: "batch_update_doc_fields",
    description: "Fill multiple questionnaire fields at once (e.g. manufacturer name, model number). PREFER this over calling update_doc_field repeatedly. Call during 'documents' phase after identifying unfilled required fields. Precondition: user has provided values for the fields.",
    inputSchema: ToolSchemas.batch_update_doc_fields,
    logLabel: "Batch update document fields",
    mutates: true,
    execute: async (sessionId, input) => {
      const { fields } = input as { fields: Record<string, DocFieldValue> };
      for (const [field, value] of Object.entries(fields)) {
        addComplianceDocField(sessionId, field, value);
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
      const files = (session?.uploadedFiles ?? []).map(({ dataUrl: _, ...rest }) => rest);
      return { files };
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
      const files = (session?.uploadedFiles ?? []).map(({ dataUrl: _, ...rest }) => rest);
      return { files };
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

  list_packs: {
    name: "list_packs",
    description: "List available compliance packs with their titles and regulation IDs. Call during 'scope' phase to see what packs exist, then call read_pack to inspect any pack's full content.",
    inputSchema: ToolSchemas.list_packs,
    logLabel: "List packs",
    mutates: false,
    execute: async () => {
      return {
        packs: packs.map((p) => ({
          id: p.id,
          title: p.title,
          regs: p.regs,
          inds: p.inds,
        })),
      };
    },
  },

  read_pack: {
    name: "read_pack",
    description: "Read a compliance pack's full content (from pack.json or SKILL.md) so you can assess whether it applies to the user's product. Use during 'scope' phase after list_packs or when the user mentions a pack. Read it, reason about relevance yourself, then recommend to the user.",
    inputSchema: ToolSchemas.read_pack,
    logLabel: "Read pack",
    mutates: false,
    execute: async (_sessionId, input) => {
      const { packId } = input as { packId: string };
      const result = readPackContent(packId);
      if (!result) return { error: `Pack "${packId}" not found` };
      return { packId, content: result.content, source: result.source };
    },
  },

  create_pack: {
    name: "create_pack",
    description: "Create a new compliance pack with full metadata, questionnaire fields, document definitions, checks, and redlines. Call during 'scope' phase when no existing pack fits the user's product. Interview the user first to gather requirements — study existing packs via read_pack as reference. After creation, the new pack is immediately available via list_packs and read_pack. Precondition: you have gathered enough information from the user to define the complete pack.",
    inputSchema: ToolSchemas.create_pack,
    logLabel: "Create pack",
    mutates: true,
    execute: async (_sessionId, input) => {
      try {
        writePack(input as unknown as CreatePackInput);
        return { created: true, packId: (input as { id: string }).id, message: "Pack created successfully." };
      } catch (err) {
        return { created: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  },

  start_audit: {
    name: "start_audit",
    description: "Start the compliance audit for selected packs. Sets up each selected pack, then runs ready checks. Call prepare_for_audit first to generate documents and finalize. Call this once — the audit runs incrementally. Use setup_pack_audit, run_pending_checks, retry_check individually for fine-grained control.",
    inputSchema: ToolSchemas.start_audit,
    logLabel: "Start audit",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packIds, force } = input as { packIds?: string[]; force?: boolean };
      const s = getComplianceSession(sessionId);
      if (!s) return { error: "Session not found" };
      if (!s.documentsFinalized) {
        return { error: "Documents not finalized. Call prepare_for_audit first to generate documents and mark documents as complete." };
      }
      const auditPackIds = packIds ?? s.selectedPackIds;
      if (auditPackIds.length === 0) return { error: "No packs selected for audit" };

      const docData = s.docData;
      const missingFields: { pack: string; field: string }[] = [];
      for (const packId of auditPackIds) {
        const pack = getPack(packId);
        if (!pack) continue;
        for (const field of pack.fields) {
          if (!field.required) continue;
          const label = typeof field.label === "string" ? field.label : (field.label.en ?? field.id);
          const value = docData[field.id]?.value?.trim();
          if (!value) {
            missingFields.push({ pack: typeof pack.title === "string" ? pack.title : (pack.title.en ?? pack.id), field: label });
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



  get_session_state: {
    name: "get_session_state",
    description: "Request the full current session — selected packs, filled fields, uploaded files, audit results, validation score and checks. Call at any time to check what's been done and what's outstanding. Useful after run_validation or before deciding the phase is complete.",
    inputSchema: ToolSchemas.get_session_state,
    logLabel: "Get session state",
    mutates: false,
    execute: async (sessionId) => {
      const session = buildSession(sessionId);
      if (!session) return { error: "Session not found" };
      const result = session as unknown as Record<string, unknown>;
      if (Array.isArray(result.uploadedFiles)) {
        result.uploadedFiles = result.uploadedFiles.map((f: Record<string, unknown>) => {
          const { dataUrl: _, ...rest } = f;
          return rest;
        });
      }
      return result;
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
    description: "Check questionnaire completeness — verify all required fields across selected packs are filled. Call during 'documents' phase to confirm everything is ready before moving to audit. Use get_session_state after this to see results.",
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

        for (const field of pack.fields) {
          if (!field.required) continue;
          const label = typeof field.label === "string" ? field.label : (field.label.en ?? field.id);
          const value = docData[field.id]?.value?.trim();
          const filled = !!value;
          checks.push({
            id: `${packId}:${field.id}`,
            title: `[${typeof pack.title === "string" ? pack.title : pack.title.en}] ${label}`,
            status: filled ? "pass" : "fail",
            note: filled ? "" : "Required field is empty",
          });
        }
      }

      const passed = checks.filter((c) => c.status === "pass").length;
      const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 100;
      const missing = checks.filter((c) => c.status === "fail").length;
      setComplianceValidation(sessionId, checks, score);
      return { checks, score, missing, total: checks.length };
    },
  },

  prepare_for_audit: {
    name: "prepare_for_audit",
    description: "Generate documents from questionnaire data, store them as chunked files, and mark documents as finalized. Must call run_validation first. Must get the user's explicit confirmation before calling this. After this succeeds, call start_audit.",
    inputSchema: ToolSchemas.prepare_for_audit,
    logLabel: "Prepare for audit",
    mutates: true,
    execute: async (sessionId) => {
      const s = getComplianceSession(sessionId);
      if (!s) return { error: "Session not found" };

      if (!s.validationChecks || s.validationChecks.length === 0) {
        return { error: "run_validation has not been called. Call run_validation first to check document completeness, then ask the user to confirm before calling prepare_for_audit." };
      }

      const missingCount = s.validationChecks.filter((c) => c.status === "fail").length;

      await ensureSetup(sessionId);

      const generated: string[] = [];
      const errors: string[] = [];

      for (const packId of s.selectedPackIds) {
        const pack = getPack(packId);
        if (!pack || !pack.documents?.length) continue;

        for (const doc of pack.documents) {
          const docType = doc.type;
          const label = typeof doc.title === "string" ? doc.title : (doc.title.en ?? docType);

          let content = `# ${label}\n\n`;
          for (const fieldId of doc.fields) {
            const val = s.docData[fieldId]?.value || "";
            const packField = pack.fields.find((f) => f.id === fieldId);
            const fieldLabel = packField
              ? (typeof packField.label === "string" ? packField.label : (packField.label.en ?? fieldId))
              : fieldId;
            content += `## ${fieldLabel}\n`;
            content += val ? `${val}\n\n` : "(not provided)\n\n";
          }

          const sections: Record<string, string> = {};
          for (const fieldId of doc.fields) {
            sections[fieldId] = s.docData[fieldId]?.value || "";
          }

          const response = {
            content,
            reasoning: `Generated document: ${label}`,
            citations: [],
            round: 0,
            sessionId,
            sections,
          } as AgentResponse;

          try {
            const blob = await generateDocx(response);
            const buf = Buffer.from(await blob.arrayBuffer());
            const base64 = buf.toString("base64");
            const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;
            const filename = `_generated/${packId}/${docType}.docx`;

            addComplianceFile(sessionId, { name: filename, size: String(buf.length), time: new Date().toISOString().slice(0, 10), dataUrl, _generated: true });
            await processSessionFiles({
              sessionId,
              files: [{
                name: filename,
                type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                size: buf.length,
                dataUrl,
              }],
            });
            generated.push(filename);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            errors.push(`${packId}/${docType}: ${msg}`);
          }
        }
      }

      setComplianceDocumentsFinalized(sessionId, true);

      return {
        ok: true,
        documentsFinalized: true,
        generatedFiles: generated,
        generatedFileCount: generated.length,
        missingFieldCount: missingCount,
        warning: missingCount > 0 ? `${missingCount} required field(s) still empty. Review with the user before starting audit, or call start_audit with force: true to proceed anyway.` : undefined,
        errors: errors.length > 0 ? errors : undefined,
      };
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
        appendPackLessons(skillName, [entry]);
        saveLessonOverride(skillName, entry);
        return { saved: true, lesson: entry, message: "Lesson permanently added to pack." };
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
