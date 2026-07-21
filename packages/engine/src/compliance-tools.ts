import { z } from "zod";
import {
  getComplianceSession, setComplianceScope, setComplianceStep,
  addComplianceDocField, addComplianceFile, removeComplianceFile,
  setComplianceValidation, hasSessionSetup,
  setComplianceAuditRunning, setComplianceAuditDone,
  getCompliancePackStates,
  setComplianceDocumentsFinalized, getOrCreateSession,
  setComplianceTestPlans, getComplianceTestPlans,
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
  | "batch_update_doc_fields"
  | "attach_file"
  | "extract_file_content"
  | "detach_file"
  | "export_document"
  | "go_to_phase"
  | "list_packs"
  | "read_pack"
  | "create_pack"
  | "design_pack"
  | "setup_pack_audit"
  | "run_pending_checks"
  | "retry_check"
  | "get_file_content"
  | "run_validation"
  | "prepare_for_audit"
  | "search_clauses"
  | "seed_regulation"
  | "get_regulation_text"
  | "search_files"
  | "suggest_lesson"
  | "manage_field"
  | "manage_document_template"
  | "manage_check"
  | "publish_pack"
  | "save_test_plan"
  | "update_test_plan";

const sourceCitationDesc = "Source chunk IDs, e.g. ['S1.c3']";
const citationRefDesc = "Regulation clause IDs, e.g. ['R48.6.2']";

export const ToolSchemas = {
  set_scope: z.object({
    packIds: z.array(z.string()),
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
  extract_file_content: z.object({
    fileName: z.string(),
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
  design_pack: z.object({
    packId: z.string().describe("Desired pack ID, lowercase-hyphens, e.g. 'ev-battery-r100'"),
    userGoal: z.string().describe("Description of what pack to design, e.g. 'Design a pack based on GB/T 44464-2024 for electric vehicle batteries'"),
    regulationSourceFileId: z.string().optional().describe("File ID of an uploaded regulation document to extract and seed"),
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
      testProcedure: z.string().optional().describe("JSON-encoded test procedure with purpose/method/equipment/steps/passCriteria"),
      regulationNodeId: z.string().optional().describe("ID of the regulation DB node this check maps to"),
    })),
    redlines: z.array(z.string()),
    lessons: z.array(z.string()).optional(),
    templates: z.array(z.object({
      docType: z.string(),
      dataUrl: z.string().describe("Base64-encoded DOCX data URL"),
    })).optional(),
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
  get_file_content: z.object({
    fileName: z.string(),
  }),
  run_validation: z.object({}),
  prepare_for_audit: z.object({}),
  search_clauses: z.object({
    keyword: z.string(),
    regulationCodes: z.array(z.string()).optional(),
  }),
  seed_regulation: z.object({
    code: z.string().describe("Short regulation code, e.g. 'PIPL', 'GB_T_44464'"),
    title: z.string(),
    description: z.string(),
    jurisdiction: z.string(),
    versions: z.array(z.object({
      version: z.string(),
      effectiveDate: z.string(),
      isCurrent: z.boolean(),
    })).optional(),
    crossReferences: z.array(z.string()).optional(),
    clauses: z.array(z.object({
      number: z.string().describe("Clause number as in the regulation, e.g. '4.1.1', 'Art. 6'"),
      title: z.string(),
      text: z.string().describe("Full clause text"),
      parentNumber: z.string().optional().describe("Parent clause number for tree hierarchy, e.g. '4.1' for clause '4.1.1'"),
    })).min(1, "At least one clause required"),
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
  save_test_plan: z.object({
    checkId: z.string(),
    adaptedProcedure: z.string().describe("The adapted test plan for this user/product"),
    standardProcedure: z.string().optional(),
  }),
  update_test_plan: z.object({
    checkId: z.string(),
    status: z.enum(["pending", "planned", "submitted", "pass", "fail"]),
    resultSummary: z.string().optional().describe("Summary of test results"),
  }),
  suggest_lesson: z.object({
    skillName: z.string(),
    text: z.string(),
    sourceCheck: z.string().optional(),
    applyToSkill: z.boolean().optional().default(false).describe("call with true after user confirms"),
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
    testProcedure: z.string().optional().describe("JSON-encoded test procedure with purpose/method/equipment/steps/passCriteria"),
    regulationNodeId: z.string().optional().describe("ID of the regulation DB node this check maps to"),
  }),
  publish_pack: z.object({
    id: z.string(),
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

  batch_update_doc_fields: {
    name: "batch_update_doc_fields",
    description: "Fill multiple form fields at once.",
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
    description: "Upload a file (PDF, DOCX, image). Use extract_file_content to extract text, then get_file_content/search_files to query it.",
    inputSchema: ToolSchemas.attach_file,
    logLabel: "Attach file",
    mutates: true,
    execute: async (sessionId, input) => {
      const { dataUrl: _, ...file } = input as unknown as ComplianceFile & { dataUrl?: string };
      addComplianceFile(sessionId, file);
      const session = buildSession(sessionId);
      const files = (session?.uploadedFiles ?? []).map(({ docType, ...rest }) => rest);
      return { files };
    },
  },

  extract_file_content: {
    name: "extract_file_content",
    description: "Extract text from an uploaded file. Saves to doc store for LLM search. After calling this, get_file_content and search_files will work.",
    inputSchema: ToolSchemas.extract_file_content,
    logLabel: "Extract file content",
    mutates: true,
    execute: async (sessionId, input) => {
      const { fileName } = input as { fileName: string };

      // Check doc store for existing extraction
      const store = getDocStore();
      const existing = await store.getFiles(sessionId);
      const already = existing.find((f) => f.filename === fileName);
      if (already?.extractedText) {
        return { fileName, cached: true, totalLength: already.extractedText.length };
      }

      // Read file from disk
      const { readFileSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
      const filePath = join(DATA_DIR, "uploads", sessionId, fileName);
      if (!existsSync(filePath)) {
        return { error: `File "${fileName}" not found on disk at ${filePath}` };
      }
      const buffer = readFileSync(filePath);
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      const mime = ext === "pdf" ? "application/pdf" : `application/${ext}`;
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

      const { extractFileContent } = await import("./agent/user-info/extractors");
      const result = await extractFileContent({ name: fileName, type: mime, dataUrl });
      const text = result.text || "[No text could be extracted from this file]";
      const chunks = (result.chunks ?? []).map((c) => ({
        id: c.id, text: c.text, html: c.html, pageNumber: c.pageNumber,
        bbox: c.bbox, wordBoxes: c.wordBoxes, pageWidth: c.pageWidth, pageHeight: c.pageHeight,
        heading: (c as { heading?: string }).heading,
      }));

      getOrCreateSession(sessionId, "compliance");
      await store.addEvidenceFile(sessionId, {
        fileId: fileName, filename: fileName, extractedText: text, chunks,
        pageCount: result.pageCount, ocrConfidence: result.ocrConfidence, extractorUsed: result.extractorUsed,
      });

      const index = chunks.map((c) => ({ id: c.id, pageNumber: c.pageNumber }));
      const firstChunks = chunks.slice(0, 3).map((c) => ({ id: c.id, pageNumber: c.pageNumber, text: c.text }));
      return { fileName, totalLength: text.length, chunkCount: index.length, chunks: index, firstChunks, preview: text.slice(0, 2000), source: result.extractorUsed ?? "extractor", ocrConfidence: result.ocrConfidence, pageCount: result.pageCount };
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
      // Clean up doc store chunks
      const { deleteChunksByFile } = await import("./agent/shared/memory/repository");
      deleteChunksByFile(sessionId, name);
      // Delete raw file from disk
      const { unlinkSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
      const filePath = join(DATA_DIR, "uploads", sessionId, name);
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* non-fatal */ }
      const session = buildSession(sessionId);
      const files = (session?.uploadedFiles ?? []).map(({ docType, ...rest }) => rest);
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
    description: "Create a compliance pack with its fields, checks, and documents in one shot. Designed for LLM-generated pack designs — analyze the regulation first via seed_regulation + get_regulation_text, then call this with your complete design. Review with manage_* tools, then call publish_pack.",
    inputSchema: ToolSchemas.create_pack,
    logLabel: "Create pack",
    mutates: true,
    execute: async (sessionId, input) => {
      const data = input as unknown as CreatePackInput;
      if (!data.fields?.length && !data.checks?.length && !data.documents?.length) {
        return { error: "Pack must have at least fields, checks, or documents." };
      }
      data.redlines ??= [];
      data.lessons ??= [];
      saveDraftPack(sessionId, data);
      return {
        created: true,
        packId: data.id,
        fieldCount: data.fields.length,
        checkCount: data.checks.length,
        documentCount: data.documents.length,
        message: "Draft pack created. Review with manage_check/manage_field/manage_document_template, then call publish_pack to save to disk.",
      };
    },
  },

  design_pack: {
    name: "design_pack",
    description: "Design a complete compliance pack from regulation documents. Launches an AI designer that extracts the regulation, seeds it into the DB, designs fields/checks/documents, and publishes the pack. Returns the published pack ID.",
    inputSchema: ToolSchemas.design_pack,
    logLabel: "Design pack",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId, userGoal } = input as { packId: string; userGoal: string };
      const { designPackSubOrchestrator: runDesigner } = await import("./orchestration/pack-designer");
      const result = await runDesigner(sessionId, userGoal);
      return {
        packId: result.packId,
        fieldCount: result.fieldCount,
        checkCount: result.checkCount,
        documentCount: result.docCount,
      };
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
      if (!draft) return { error: "No draft pack. Call create_pack first." };
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
      if (!draft) return { error: "No draft pack. Call create_pack first." };
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
      if (!draft) return { error: "No draft pack. Call create_pack first." };
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

  publish_pack: {
    name: "publish_pack",
    description: "Write draft pack to disk (validates title/desc/industry).",
    inputSchema: ToolSchemas.publish_pack,
    logLabel: "Publish pack",
    mutates: true,
    execute: async (sessionId, input) => {
      const draft = getDraftPack(sessionId);
      if (!draft) return { error: "No draft pack. Call create_pack first." };
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




  setup_pack_audit: {
    name: "setup_pack_audit",
    description: "Set up a pack for audit and persist the full check skeleton (all checks as pending). Must precede run_pending_checks.",
    inputSchema: ToolSchemas.setup_pack_audit,
    logLabel: "Setup pack audit",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId } = input as { packId: string };
      return await setupPackAuditAndRun(sessionId, packId) as unknown as Record<string, unknown>;
    },
  },

  run_pending_checks: {
    name: "run_pending_checks",
    description: "Execute checks for a pack. Runs in background — frontend polls /audit/status for progressive results. Call after setup_pack_audit.",
    inputSchema: ToolSchemas.run_pending_checks,
    logLabel: "Run pending checks",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId } = input as { packId: string };
      const existing = getPackAuditState(sessionId, packId);
      if (!existing) return { error: `Pack "${packId}" not set up. Call setup_pack_audit first.` };
      setComplianceAuditRunning(sessionId, true);
      runAuditChecksInBackground(sessionId, [packId]);
      return { ok: true, packId, message: "Checks running in background — results appear progressively." };
    },
  },

  retry_check: {
    name: "retry_check",
    description: "Retry a failed check (resets dependents). Resumes background execution automatically.",
    inputSchema: ToolSchemas.retry_check,
    logLabel: "Retry check",
    mutates: true,
    execute: async (sessionId, input) => {
      const { packId, checkId } = input as { packId: string; checkId: string };
      const result = await retryCheck(sessionId, packId, checkId) as unknown as Record<string, unknown>;
      runAuditChecksInBackground(sessionId, [packId]);
      return result;
    },
  },



  get_file_content: {
    name: "get_file_content",
    description: "Read extracted text from a file. Returns preview, chunk index, and first 3 chunk texts. Use search_files for specific chunks or keywords. If file not extracted yet, returns a hint to call extract_file_content first.",
    inputSchema: ToolSchemas.get_file_content,
    logLabel: "Get file content",
    mutates: false,
    execute: async (sessionId, input) => {
      const { fileName } = input as { fileName: string };
      const store = getDocStore();
      const files = await store.getFiles(sessionId);
      const file = files.find((f) => f.filename === fileName);
      if (!file?.extractedText) {
        return { error: `File "${fileName}" not extracted yet — call extract_file_content first` };
      }
      const index = file.chunks.map((c) => ({ id: c.id, pageNumber: c.pageNumber }));
      const firstChunks = file.chunks.slice(0, 3).map((c) => ({ id: c.id, pageNumber: c.pageNumber, text: c.text }));
      return { fileName, totalLength: file.extractedText.length, chunkCount: file.chunks.length, chunks: index, firstChunks, preview: file.extractedText.slice(0, 2000), source: "extracted" };
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

            // Write generated file to disk
            const { writeFileSync, mkdirSync } = await import("fs");
            const { join } = await import("path");
            const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
            const filePath = join(DATA_DIR, "uploads", sessionId, filename);
            mkdirSync(join(DATA_DIR, "uploads", sessionId), { recursive: true });
            writeFileSync(filePath, buf);

            addComplianceFile(sessionId, { name: filename, size: String(buf.length), time: new Date().toISOString().slice(0, 10), _generated: true });
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
        warning: missingCount > 0 ? `${missingCount} required field(s) still empty. Review with the user before asking them to proceed.` : undefined,
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
      if (!result.success || !result.data) return { note: `No clauses found for "${keyword}"`, results: [] };
      const results = result.data.map((r) => ({ regulationCode: r.regulationCode, clauseNumber: r.clause.number, title: r.clause.title, text: r.clause.text }));
      return { results, count: results.length };
    },
  },

  seed_regulation: {
    name: "seed_regulation",
    description: "Seed a new regulation into the regulation database with its clause tree. Use when the user uploads a regulation document — first read it via get_file_content, extract clauses, then call this tool before create_pack.",
    inputSchema: ToolSchemas.seed_regulation,
    logLabel: "Seed regulation",
    mutates: true,
    execute: async (_sessionId, input) => {
      const { code, title, description, jurisdiction, versions, crossReferences, clauses } = input as {
        code: string; title: string; description: string; jurisdiction: string;
        versions?: { version: string; effectiveDate: string; isCurrent: boolean }[];
        crossReferences?: string[]; clauses: { number: string; title: string; text: string; parentNumber?: string }[];
      };
      const api = await getRegulationApi();
      const result = await api.seedRegulation({ code, title, description, jurisdiction, versions, crossReferences, clauses });
      if (!result.success) return { error: result.error };
      return {
        seeded: true,
        code: result.code,
        clauseCount: result.clauseCount,
        message: `Regulation "${code}" seeded with ${result.clauseCount} clauses. Read it via get_regulation_text, then call create_pack with your pack design.`,
      };
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
    description: "Search uploaded file contents. Three modes: (1) query only — cross-file FTS5 keyword search; (2) fileName only — list all chunks; (3) fileName + chunkIds — retrieve full chunk texts.",
    inputSchema: ToolSchemas.search_files,
    logLabel: "Search files",
    mutates: false,
    execute: async (sessionId, input) => {
      const { query, fileName, chunkIds } = input as { query?: string; fileName?: string; chunkIds?: string[] };
      const store = getDocStore();

      // Mode 3: fileName + chunkIds — return full chunk texts
      if (fileName && chunkIds && chunkIds.length > 0) {
        const files = await store.getFiles(sessionId);
        const file = files.find((f) => f.filename === fileName);
        if (!file) return { error: `File "${fileName}" not found — call extract_file_content first` };
        const matched = file.chunks.filter((c) => chunkIds.includes(c.id));
        return { results: [{ fileName, chunks: matched.map((c) => ({ id: c.id, text: c.text, pageNumber: c.pageNumber })) }] };
      }

      // Mode 2: fileName only — return chunk index
      if (fileName) {
        const files = await store.getFiles(sessionId);
        const file = files.find((f) => f.filename === fileName);
        if (!file) return { error: `File "${fileName}" not extracted yet — call extract_file_content first` };
        const chunkIndex = file.chunks.map((c) => ({ id: c.id, pageNumber: c.pageNumber }));
        return { fileName, totalLength: file.extractedText.length, chunkCount: chunkIndex.length, chunks: chunkIndex, source: "extracted" };
      }

      // Mode 1: query only — vector search (falls back to FTS5)
      if (query) {
        const results = await store.searchChunks(sessionId, query);
        return {
          note: results.length === 0 ? `No matches found for "${query}"` : undefined,
          results: results.map((r) => ({ fileName: r.fileId, excerpt: r.text, rank: r.distance })),
        };
      }

      return { note: "No search parameters provided. Use query for cross-file search or fileName to browse a file.", results: [] };
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

  save_test_plan: {
    name: "save_test_plan",
    description: "Save an adapted test plan for a check that requires offline physical testing. Call this after adapting the standard testProcedure to the user's specific product/vehicle.",
    inputSchema: ToolSchemas.save_test_plan,
    logLabel: "Save test plan",
    mutates: true,
    execute: async (sessionId, input) => {
      const { checkId, adaptedProcedure, standardProcedure } = input as { checkId: string; adaptedProcedure: string; standardProcedure?: string };
      const existing = getComplianceTestPlans(sessionId);
      const idx = existing.findIndex((p) => p.checkId === checkId);
      const plan = {
        checkId,
        status: "planned" as const,
        standardProcedure: standardProcedure ?? existing[idx]?.standardProcedure,
        adaptedProcedure,
      };
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...plan };
      } else {
        existing.push(plan);
      }
      setComplianceTestPlans(sessionId, existing);
      return { saved: true, checkId, status: "planned" };
    },
  },

  update_test_plan: {
    name: "update_test_plan",
    description: "Update test plan status and/or result summary after the user uploads test results.",
    inputSchema: ToolSchemas.update_test_plan,
    logLabel: "Update test plan",
    mutates: true,
    execute: async (sessionId, input) => {
      const { checkId, status, resultSummary } = input as { checkId: string; status: string; resultSummary?: string };
      const plans = getComplianceTestPlans(sessionId);
      const idx = plans.findIndex((p) => p.checkId === checkId);
      if (idx < 0) return { error: `No test plan found for check "${checkId}" — call save_test_plan first` };
      plans[idx] = { ...plans[idx], checkId, status: status as "pending" | "planned" | "submitted" | "pass" | "fail", resultSummary };
      setComplianceTestPlans(sessionId, plans);
      return { updated: true, checkId, status };
    },
  },

};

const backgroundAuditLocks = new Set<string>();

function allSessionPacksDone(sessionId: string): boolean {
  const states = getCompliancePackStates(sessionId) as Record<string, { state: string }>;
  const entries = Object.values(states);
  return entries.length > 0 && entries.every((s) => s.state === "done" || s.state === "failed");
}

function runAuditChecksInBackground(sessionId: string, packIds: string[]): void {
  const keys = packIds.map((p) => `${sessionId}:${p}`);
  const unrun = keys.filter((k) => !backgroundAuditLocks.has(k));
  if (unrun.length === 0) return;
  for (const k of unrun) backgroundAuditLocks.add(k);

  (async () => {
    try {
      for (const packId of packIds) {
        const key = `${sessionId}:${packId}`;
        if (!unrun.includes(key)) continue;
        for (let iter = 0; iter < 50; iter++) {
          const result = await runPendingChecks(sessionId, packId);
          if (result.allDone || result.blocked) break;
        }
      }
      if (allSessionPacksDone(sessionId)) {
        setComplianceAuditDone(sessionId, true);
      }
    } catch (err) {
      console.error("[audit] background check execution failed:", err);
    } finally {
      for (const k of unrun) backgroundAuditLocks.delete(k);
    }
  })();
}

export const TOP_LEVEL_TOOLS: ToolName[] = [
  "set_scope",
  "batch_update_doc_fields",
  "attach_file",
  "detach_file",
  "export_document",
  "go_to_phase",
  "list_packs",
  "read_pack",
  "design_pack",
  "setup_pack_audit",
  "run_pending_checks",
  "retry_check",
  "get_file_content",
  "extract_file_content",
  "run_validation",
  "prepare_for_audit",
  "search_clauses",
  "get_regulation_text",
  "search_files",
  "suggest_lesson",
  "save_test_plan",
  "update_test_plan",
];

export const PACK_DESIGNER_TOOLS: ToolName[] = [
  "extract_file_content",
  "seed_regulation",
  "get_regulation_text",
  "search_clauses",
  "manage_field",
  "manage_document_template",
  "manage_check",
  "publish_pack",
];

export function getTool(name: string) {
  return TOOL_DEFS[name as ToolName];
}
