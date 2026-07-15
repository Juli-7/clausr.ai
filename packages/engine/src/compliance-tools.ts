import { z } from "zod";
import {
  getComplianceSession, setComplianceScope, setComplianceStep,
  addComplianceDocField, addComplianceFile, getComplianceFiles, removeComplianceFile,
  setComplianceValidation, hasSessionSetup,
  setComplianceAuditRunning, clearComplianceAuditResults,
  setComplianceDocumentsFinalized,
} from "./agent/shared/memory/repository";
import type { ComplianceFile } from "./agent/shared/memory/repository";
import { setupSkill, processSessionFiles } from "./agent/loading/loading-orchestrator";
import { saveLessonOverride, getLessonOverrides } from "./agent/shared/memory/repository";
import {
  setupPackAudit, setupPackAuditAndRun, runPendingChecks, retryCheck,
  getPackAuditState, finalizeAudit,
} from "./compliance-audit-tools";
import { getPack, packs, readPackContent, writePack, appendPackLessons, getDraftPack, saveDraftPack, clearDraftPack } from "./compliance-packs";
import type { CreatePackInput } from "./compliance-packs";
import type { PackField, DocumentTemplate, PackCheck } from "./agent/loading/skill/loader";
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
  | "suggest_lesson"
  | "create_pack_shell"
  | "manage_field"
  | "manage_document_template"
  | "manage_check"
  | "publish_pack"
  | "preview_pack";

const sourceCitationDesc = "Source chunk IDs, e.g. ['S1.c3']";
const citationRefDesc = "Regulation clause IDs, e.g. ['R48.6.2']";

export const ToolSchemas = {
  set_scope: z.object({
    packIds: z.array(z.string()),
  }),
  update_doc_field: z.object({
    field: z.string(),
    value: z.string().describe("Field value as plain text"),
  }),
  batch_update_doc_fields: z.object({
    fields: z.record(z.string(), z.string().describe("Field value as plain text")),
  }),
  attach_file: z.object({
    name: z.string(),
    size: z.string(),
    time: z.string(),
    dataUrl: z.string().describe("Base64-encoded data URL"),
    docType: z.string().optional().describe("Document type to associate with"),
  }),
  detach_file: z.object({
    name: z.string(),
  }),
  export_document: z.object({
    docType: z.string(),
  }),
  go_to_phase: z.object({
    phase: z.enum(["scope", "documents", "audit"]).describe("scope=pick packs, documents=collect data, audit=review"),
  }),
  list_packs: z.object({}),
  read_pack: z.object({
    packId: z.string(),
  }),
  create_pack: z.object({
    id: z.string().describe("lowercase-hyphens, e.g. 'ev-battery-r100'"),
    title: z.union([z.string(), z.record(z.string(), z.string())]),
    description: z.union([z.string(), z.record(z.string(), z.string())]),
    industries: z.array(z.string()),
    icon: z.string().optional(),
    version: z.string().optional(),
    regulation_ids: z.array(z.string()).optional(),
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
    })),
    documents: z.array(z.object({
      type: z.string(),
      title: z.union([z.string(), z.record(z.string(), z.string())]),
      template: z.string().optional(),
      fields: z.array(z.string()),
    })),
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
    })),
    redlines: z.array(z.string()),
    lessons: z.array(z.string()).optional(),
    templates: z.array(z.object({
      docType: z.string(),
      dataUrl: z.string().describe("Base64-encoded DOCX data URL"),
    })).optional(),
  }),
  start_audit: z.object({
    packIds: z.array(z.string()).optional(),
    force: z.boolean().optional(),
  }),
  setup_pack_audit: z.object({
    packId: z.string(),
  }),
  run_pending_checks: z.object({
    packId: z.string(),
    maxConcurrency: z.number().optional().describe("default 20"),
    context: z.string().optional().describe("Conversation context to inject into check prompts (user answers, specs)"),
  }),
  retry_check: z.object({
    packId: z.string(),
    checkId: z.string(),
  }),
  get_pack_audit_state: z.object({
    packId: z.string(),
  }),
  finalize_audit: z.object({}),
  get_session_state: z.object({}),
  get_file_content: z.object({
    fileName: z.string(),
  }),
  run_validation: z.object({}),
  prepare_for_audit: z.object({}),
  search_clauses: z.object({
    keyword: z.string(),
    regulationCodes: z.array(z.string()).optional(),
  }),
  get_regulation_text: z.object({
    code: z.string(),
    clauseNumber: z.string().optional(),
  }),
  search_files: z.object({
    query: z.string().optional().describe("Keyword to search across all files"),
    fileName: z.string().optional().describe("Scope search to one file"),
    chunkIds: z.array(z.string()).optional().describe("Retrieve specific chunk texts by ID (requires fileName)"),
  }).refine((d) => d.query || d.fileName, { message: "Provide query (cross-file) or fileName (file-scoped)" }),
  suggest_lesson: z.object({
    skillName: z.string(),
    text: z.string(),
    sourceCheck: z.string().optional(),
    applyToSkill: z.boolean().optional().default(false).describe("call with true after user confirms"),
  }),
  create_pack_shell: z.object({
    id: z.string().describe("lowercase-hyphens, e.g. 'ev-battery-r100'"),
    title: z.union([z.string(), z.record(z.string(), z.string())]),
    description: z.union([z.string(), z.record(z.string(), z.string())]),
    industries: z.array(z.string()),
    icon: z.string().optional(),
    version: z.string().optional(),
    regulation_ids: z.array(z.string()).optional(),
  }),
  manage_field: z.object({
    action: z.enum(["add", "update", "remove"]),
    id: z.string(),
    label: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    type: z.enum(["text", "textarea", "number", "boolean", "select", "date"]).optional(),
    required: z.boolean().optional(),
    options: z.array(z.object({ value: z.string(), label: z.union([z.string(), z.record(z.string(), z.string())]) })).optional(),
    validation: z.object({ min: z.number().optional(), max: z.number().optional(), maxLength: z.number().optional() }).optional(),
  }),
  manage_document_template: z.object({
    action: z.enum(["add", "update"]),
    type: z.string(),
    title: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    template: z.string().optional(),
    fields: z.array(z.string()).optional(),
  }),
  manage_check: z.object({
    action: z.enum(["add", "update", "remove"]),
    id: z.string(),
    field: z.string().optional(),
    type: z.enum(["number", "boolean", "narrative", "string", "enum"]).optional(),
    description: z.string().optional(),
    clause: z.string().optional(),
    constraint: z.string().optional(),
    rounding: z.number().optional(),
    depends_on: z.array(z.string()).optional(),
    sample: z.string().optional(),
  }),
  publish_pack: z.object({
    id: z.string(),
  }),
  preview_pack: z.object({}),
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
    description: "Select packs to include in the assessment.",
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
    description: "Save a single field value. Prefer batch_update_doc_fields for multiple.",
    inputSchema: ToolSchemas.update_doc_field,
    logLabel: "Update document field",
    mutates: true,
    execute: async (sessionId, input) => {
      const { field, value } = input as { field: string; value: string };
      addComplianceDocField(sessionId, field, { value });
      const s = getComplianceSession(sessionId);
      return { docData: s?.docData ?? {} };
    },
  },

  batch_update_doc_fields: {
    name: "batch_update_doc_fields",
    description: "Fill multiple fields at once. PREFER over update_doc_field.",
    inputSchema: ToolSchemas.batch_update_doc_fields,
    logLabel: "Batch update document fields",
    mutates: true,
    execute: async (sessionId, input) => {
      const { fields } = input as { fields: Record<string, string> };
      for (const [field, value] of Object.entries(fields)) {
        addComplianceDocField(sessionId, field, { value });
      }
      const s = getComplianceSession(sessionId);
      return { docData: s?.docData ?? {} };
    },
  },

  attach_file: {
    name: "attach_file",
    description: "Upload a file (PDF, DOCX, image). Use get_file_content to read text.",
    inputSchema: ToolSchemas.attach_file,
    logLabel: "Attach file",
    mutates: true,
    execute: async (sessionId, input) => {
      const { docType, ...rest } = input as unknown as ComplianceFile;
      const file: ComplianceFile = { ...rest, docType };
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
    description: "Remove a previously attached file by name.",
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
    description: "Generate downloadable document file.",
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
    description: "Move between phases: scope/documents/audit.",
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
    description: "List available compliance packs with titles and regulation IDs.",
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
    description: "Read full pack content.",
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
    description: "Create a full compliance pack. Interview user, use read_pack for reference.",
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

  create_pack_shell: {
    name: "create_pack_shell",
    description: "Create draft pack shell. Use manage_field/check/document_template, then publish.",
    inputSchema: ToolSchemas.create_pack_shell,
    logLabel: "Create pack shell",
    mutates: true,
    execute: async (sessionId, input) => {
      const i = input as { id: string; title: string | Record<string, string>; description: string | Record<string, string>; industries: string[]; icon?: string; version?: string; regulation_ids?: string[] };
      const draft: CreatePackInput = {
        id: i.id,
        title: i.title,
        description: i.description,
        industries: i.industries,
        icon: i.icon,
        version: i.version,
        regulation_ids: i.regulation_ids,
        fields: [],
        documents: [],
        checks: [],
        redlines: [],
      };
      saveDraftPack(sessionId, draft);
      return { created: true, packId: i.id, message: "Draft pack created. Use add_field, add_check, add_document_template to build it out." };
    },
  },

  manage_field: {
    name: "manage_field",
    description: "Add/update/remove a questionnaire field.",
    inputSchema: ToolSchemas.manage_field,
    logLabel: "Manage field",
    mutates: true,
    execute: async (sessionId, input) => {
      const draft = getDraftPack(sessionId);
      if (!draft) return { error: "No draft pack. Call create_pack_shell first." };
      const { action, id, ...rest } = input as { action: string; id: string };
      if (action === "remove") {
        const idx = draft.fields.findIndex((f) => f.id === id);
        if (idx === -1) return { error: `Field "${id}" not found.` };
        draft.fields.splice(idx, 1);
        saveDraftPack(sessionId, draft);
        return { action, fieldId: id };
      }
      if (action === "add") {
        if (draft.fields.find((f) => f.id === id)) return { error: `Field "${id}" already exists.` };
        draft.fields.push({ id, ...rest } as PackField);
        saveDraftPack(sessionId, draft);
        return { action, fieldId: id, totalFields: draft.fields.length };
      }
      const idx = draft.fields.findIndex((f) => f.id === id);
      if (idx === -1) return { error: `Field "${id}" not found.` };
      draft.fields[idx] = { ...draft.fields[idx], ...rest } as PackField;
      saveDraftPack(sessionId, draft);
      return { action, fieldId: id };
    },
  },

  manage_document_template: {
    name: "manage_document_template",
    description: "Add or update a document template.",
    inputSchema: ToolSchemas.manage_document_template,
    logLabel: "Manage document template",
    mutates: true,
    execute: async (sessionId, input) => {
      const draft = getDraftPack(sessionId);
      if (!draft) return { error: "No draft pack. Call create_pack_shell first." };
      const { action, type, ...rest } = input as { action: string; type: string };
      const idx = draft.documents.findIndex((d) => d.type === type);
      if (action === "add") {
        if (idx !== -1) return { error: `Document "${type}" already exists.` };
        draft.documents.push({ type, ...rest } as DocumentTemplate);
        saveDraftPack(sessionId, draft);
        return { action, docType: type, totalDocuments: draft.documents.length };
      }
      if (idx === -1) return { error: `Document "${type}" not found.` };
      draft.documents[idx] = { ...draft.documents[idx], ...rest } as DocumentTemplate;
      saveDraftPack(sessionId, draft);
      return { action, docType: type };
    },
  },

  manage_check: {
    name: "manage_check",
    description: "Add/update/remove a compliance check.",
    inputSchema: ToolSchemas.manage_check,
    logLabel: "Manage check",
    mutates: true,
    execute: async (sessionId, input) => {
      const draft = getDraftPack(sessionId);
      if (!draft) return { error: "No draft pack. Call create_pack_shell first." };
      const { action, id, ...rest } = input as { action: string; id: string };
      if (action === "remove") {
        const idx = draft.checks.findIndex((c) => c.id === id);
        if (idx === -1) return { error: `Check "${id}" not found.` };
        draft.checks.splice(idx, 1);
        saveDraftPack(sessionId, draft);
        return { action, checkId: id };
      }
      if (action === "add") {
        if (draft.checks.find((c) => c.id === id)) return { error: `Check "${id}" already exists.` };
        draft.checks.push({ id, ...rest } as PackCheck);
        saveDraftPack(sessionId, draft);
        return { action, checkId: id, totalChecks: draft.checks.length };
      }
      const idx = draft.checks.findIndex((c) => c.id === id);
      if (idx === -1) return { error: `Check "${id}" not found.` };
      draft.checks[idx] = { ...draft.checks[idx], ...rest } as PackCheck;
      saveDraftPack(sessionId, draft);
      return { action, checkId: id };
    },
  },

  preview_pack: {
    name: "preview_pack",
    description: "Preview draft pack as JSON.",
    inputSchema: ToolSchemas.preview_pack,
    logLabel: "Preview pack",
    mutates: false,
    execute: async (sessionId) => {
      const draft = getDraftPack(sessionId);
      if (!draft) return { error: "No draft pack. Call create_pack_shell first." };
      return {
        packId: draft.id,
        title: draft.title,
        description: draft.description,
        industries: draft.industries,
        icon: draft.icon,
        version: draft.version,
        regulation_ids: draft.regulation_ids,
        fields: draft.fields,
        documents: draft.documents,
        checks: draft.checks,
        fieldCount: draft.fields.length,
        documentCount: draft.documents.length,
        checkCount: draft.checks.length,
      };
    },
  },

  publish_pack: {
    name: "publish_pack",
    description: "Write draft pack to disk (validates title/desc/industry).",
    inputSchema: ToolSchemas.publish_pack,
    logLabel: "Publish pack",
    mutates: true,
    execute: async (sessionId, input) => {
      const draft = getDraftPack(sessionId);
      if (!draft) return { error: "No draft pack. Call create_pack_shell first." };
      const { id } = input as { id: string };
      if (id !== draft.id) return { error: `Pack ID mismatch: draft is "${draft.id}", got "${id}".` };
      if (!draft.title || !draft.description || draft.industries.length === 0) {
        return { error: "Pack must have at least a title, description, and one industry." };
      }
      try {
        writePack(draft);
        clearDraftPack(sessionId);
        return { published: true, packId: draft.id, message: "Pack published successfully." };
      } catch (err) {
        return { published: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    },
  },

  start_audit: {
    name: "start_audit",
    description: "Start audit for selected packs. Call prepare_for_audit first.",
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

      // Phase 1: Set up each pack and immediately persist ALL checks as "wait" in auditResults
      // This lets the frontend render the full check list + progress bar immediately
      for (const packId of auditPackIds) {
        await setupPackAuditAndRun(sessionId, packId);
      }

      // Phase 2: Run the first batch of ready checks synchronously
      // runPendingChecks persists results incrementally per-check, so polling picks up progress
      const results: Record<string, unknown>[] = [];
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      for (const packId of auditPackIds) {
        const runResult = await runPendingChecks(sessionId, packId);
        totalPromptTokens += runResult.usage.promptTokens;
        totalCompletionTokens += runResult.usage.completionTokens;
        results.push({ packId, checksCompleted: runResult.completed, checksFailed: runResult.failed });
      }

      return {
        auditStarted: true,
        packIds: auditPackIds,
        validationPassed: missingFields.length === 0,
        validationHints: missingFields.length > 0 ? missingFields.map((m) => `[${m.pack}] ${m.field}`) : [],
        packResults: results,
        usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
      };
    },
  },

  setup_pack_audit: {
    name: "setup_pack_audit",
    description: "Set up a pack for audit. Must precede run_pending_checks.",
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
    description: "Execute ready checks (one depth level per call). Optionally pass conversation context.",
    inputSchema: ToolSchemas.run_pending_checks,
    logLabel: "Run pending checks",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId, maxConcurrency, context } = input as { packId: string; maxConcurrency?: number; context?: string };
      return await runPendingChecks(sessionId, packId, maxConcurrency, context) as unknown as Record<string, unknown>;
    },
  },

  retry_check: {
    name: "retry_check",
    description: "Retry a failed check (resets dependents). Call run_pending_checks after.",
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
    description: "Get audit state: per-check status/verdicts/reasoning.",
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
    description: "Finalize audit. Call after all packs done.",
    inputSchema: ToolSchemas.finalize_audit,
    logLabel: "Finalize audit",
    mutates: true,
    execute: async (sessionId, _input) => {
      return await finalizeAudit(sessionId) as unknown as Record<string, unknown>;
    },
  },



  get_session_state: {
    name: "get_session_state",
    description: "Get full session state: packs, fields, files, results.",
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
    description: "Extract text from an uploaded file, caches the result. Returns chunk index (headings + IDs) and a text preview. Use search_files to retrieve specific chunks by ID or keyword.",
    inputSchema: ToolSchemas.get_file_content,
    logLabel: "Get file content",
    mutates: false,
    execute: async (sessionId, input) => {
      const { fileName } = input as { fileName: string };

      const files = getComplianceFiles(sessionId);
      const file = files.find((f) => f.name === fileName);
      if (!file?.dataUrl) {
        return { error: `File "${fileName}" not found` };
      }

      // Return metadata from cache if already extracted
      if (file.extractedText) {
        const chunkIndex = (file.chunks ?? []).map((c) => ({ id: c.id, heading: c.heading, pageNumber: c.pageNumber }));
        return { fileName, totalLength: file.extractedText.length, chunkCount: chunkIndex.length, preview: file.extractedText.slice(0, 500), chunks: chunkIndex, source: "cached" };
      }

      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      const textExts = ["txt", "csv", "json", "md", "xml", "yml", "yaml", "log", "ini", "cfg", "env"];
      if (textExts.includes(ext)) {
        const b64 = file.dataUrl.split(",")[1] ?? "";
        const raw = typeof Buffer !== "undefined" ? Buffer.from(b64, "base64").toString("utf-8") : "";
        return { fileName, extractedText: raw.slice(0, 5000), totalLength: raw.length, source: "raw-base64" };
      }

      // Binary files — run extractors, then cache the result
      const { extractFileContent } = await import("./agent/user-info/extractors");
      const result = await extractFileContent({ name: fileName, type: ext === "pdf" ? "application/pdf" : `application/${ext}`, dataUrl: file.dataUrl });
      const text = result.text || "[No text could be extracted from this file]";
      const chunks = (result.chunks ?? []).map((c) => ({ id: c.id, text: c.text, pageNumber: c.pageNumber, heading: c.heading }));
      addComplianceFile(sessionId, { ...file, extractedText: text, chunks });
      const chunkIndex = chunks.map((c) => ({ id: c.id, heading: c.heading, pageNumber: c.pageNumber }));
      return { fileName, totalLength: text.length, chunkCount: chunkIndex.length, preview: text.slice(0, 500), chunks: chunkIndex, source: result.extractorUsed ?? "extractor", ocrConfidence: result.ocrConfidence, pageCount: result.pageCount };
    },
  },

  run_validation: {
    name: "run_validation",
    description: "Check all required fields are filled.",
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
    description: "Generate docs from data, store as files, mark finalized. Need run_validation + user confirm first.",
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
    description: "Search regulation clauses by keyword.",
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
    description: "Get full regulation or clause text.",
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
    description: "Search uploaded file contents. Three modes: (1) query only — cross-file keyword search; (2) fileName only — list all chunks with headings; (3) fileName + chunkIds — retrieve full text of specific chunks.",
    inputSchema: ToolSchemas.search_files,
    logLabel: "Search files",
    mutates: false,
    execute: async (sessionId, input) => {
      const { query, fileName, chunkIds } = input as { query?: string; fileName?: string; chunkIds?: string[] };
      const files = getComplianceFiles(sessionId);

      // Mode 3: fileName + chunkIds — return full chunk texts
      if (fileName && chunkIds && chunkIds.length > 0) {
        const file = files.find((f) => f.name === fileName);
        if (!file?.chunks) return { error: `File "${fileName}" not extracted yet — call get_file_content first` };
        const matched = file.chunks.filter((c) => chunkIds.includes(c.id));
        return { results: [{ fileName, chunks: matched.map((c) => ({ id: c.id, text: c.text, pageNumber: c.pageNumber, heading: c.heading })) }] };
      }

      // Mode 2: fileName only — return chunk index
      if (fileName) {
        const file = files.find((f) => f.name === fileName);
        if (!file?.chunks) return { error: `File "${fileName}" not extracted yet — call get_file_content first` };
        const chunkIndex = file.chunks.map((c) => ({ id: c.id, heading: c.heading, pageNumber: c.pageNumber }));
        return { fileName, totalLength: file.extractedText?.length ?? 0, chunkCount: chunkIndex.length, chunks: chunkIndex, source: "cached" };
      }

      // Mode 1: query only — cross-file keyword search
      if (query) {
        const results: { fileName: string; excerpt: string }[] = [];
        for (const file of files) {
          if (!file.extractedText) continue;
          const idx = file.extractedText.toLowerCase().indexOf(query.toLowerCase());
          if (idx !== -1) {
            const start = Math.max(0, idx - 100);
            const end = Math.min(file.extractedText.length, idx + query.length + 300);
            results.push({ fileName: file.name, excerpt: file.extractedText.slice(start, end) });
          }
        }
        // Fallback: search v1 doc store files
        if (results.length === 0) {
          const store = getDocStore();
          const storeFiles = await store.getFiles(sessionId);
          for (const sf of storeFiles) {
            const idx = sf.extractedText.toLowerCase().indexOf(query.toLowerCase());
            if (idx !== -1) {
              const start = Math.max(0, idx - 100);
              const end = Math.min(sf.extractedText.length, idx + query.length + 300);
              results.push({ fileName: sf.filename, excerpt: sf.extractedText.slice(start, end) });
            }
          }
        }
        return { results };
      }

      return { results: [] };
    },
  },

  suggest_lesson: {
    name: "suggest_lesson",
    description: "Record a lesson. First call=pending; second with applyToSkill=true=permanent.",
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
