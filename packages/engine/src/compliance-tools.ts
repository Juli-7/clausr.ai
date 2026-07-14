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
      sourceCitation: z.array(z.string()).optional().describe("Source chunk IDs, e.g. ['S1.c3']"),
      citationRef: z.array(z.string()).optional().describe("Regulation clause IDs, e.g. ['R48.6.2']"),
    }).describe("Field value with optional evidence provenance"),
  }),
  batch_update_doc_fields: z.object({
    fields: z.record(z.string(), z.object({
      value: z.string().describe("Field value"),
      sourceCitation: z.array(z.string()).optional().describe("Source chunk IDs, e.g. ['S1.c3']"),
      citationRef: z.array(z.string()).optional().describe("Regulation clause IDs, e.g. ['R48.6.2']"),
    })).describe("Field ID → structured value map"),
  }),
  attach_file: z.object({
    name: z.string().describe("Original file name"),
    size: z.string().describe("File size in KB"),
    time: z.string().describe("Upload date"),
    dataUrl: z.string().describe("Base64-encoded data URL"),
  }),
  detach_file: z.object({
    name: z.string().describe("Name of the file to remove"),
  }),
  export_document: z.object({
    docType: z.string().describe("Document type to export"),
  }),
  go_to_phase: z.object({
    phase: z.enum(["scope", "documents", "audit"]).describe("Target phase: scope (pick packs), documents (collect data), audit (review)"),
  }),
  list_packs: z.object({}).describe("List all available compliance packs"),
  read_pack: z.object({
    packId: z.string().describe("Pack ID to read"),
  }),
  create_pack: z.object({
    id: z.string().describe("Pack ID — lowercase, hyphens, e.g. 'ev-battery-r100'"),
    title: z.union([z.string(), z.record(z.string(), z.string())]).describe("Pack title or i18n record"),
    description: z.union([z.string(), z.record(z.string(), z.string())]).describe("Pack description or i18n record"),
    industries: z.array(z.string()).describe("Industries this pack applies to"),
    icon: z.string().optional().describe("Emoji icon"),
    version: z.string().optional().describe("Semver, defaults to 1.0.0"),
    regulation_ids: z.array(z.string()).optional().describe("Regulation codes, e.g. ['R100']"),
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
      template: z.string().optional().describe("Template path in assets/"),
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
    })).describe("Compliance checks for audit"),
    redlines: z.array(z.string()).describe("Rules the LLM must never violate"),
    lessons: z.array(z.string()).optional().describe("Accumulated knowledge (starts empty)"),
    templates: z.array(z.object({
      docType: z.string().describe("Document type key matching documents[].type"),
      dataUrl: z.string().describe("Base64-encoded DOCX data URL"),
    })).optional().describe("Uploaded DOCX template files"),
  }),
  start_audit: z.object({
    packIds: z.array(z.string()).optional().describe("Pack IDs to audit (defaults to all selected)"),
    force: z.boolean().optional().describe("Start even if documents are incomplete"),
  }),
  setup_pack_audit: z.object({
    packId: z.string().describe("Pack ID to set up"),
  }),
  run_pending_checks: z.object({
    packId: z.string().describe("Pack ID whose ready checks to execute"),
    maxConcurrency: z.number().optional().describe("Max concurrent executions (default 20)"),
  }),
  retry_check: z.object({
    packId: z.string().describe("Pack containing the check"),
    checkId: z.string().describe("Check ID to retry — cascades to all dependents"),
  }),
  get_pack_audit_state: z.object({
    packId: z.string().describe("Pack ID to get audit state for"),
  }),
  finalize_audit: z.object({}).describe("Finalize the audit — sets auditDone=true"),
  get_session_state: z.object({}),
  get_file_content: z.object({
    fileName: z.string().describe("Name of the uploaded file to read"),
  }),
  run_validation: z.object({}),
  prepare_for_audit: z.object({}).describe("Generate documents from questionnaire, store as chunked files, mark finalized."),
  search_clauses: z.object({
    keyword: z.string().describe("Keyword to search for across regulations"),
    regulationCodes: z.array(z.string()).optional().describe("Filter: only search within these codes"),
  }),
  get_regulation_text: z.object({
    code: z.string().describe("Regulation code, e.g. R48"),
    clauseNumber: z.string().optional().describe("Optional clause number within the regulation"),
  }),
  search_files: z.object({
    query: z.string().describe("Search query for file chunks"),
  }),
  suggest_lesson: z.object({
    skillName: z.string().describe("Name of the skill to add the lesson to"),
    text: z.string().describe("Lesson text"),
    sourceCheck: z.string().optional().describe("Check field name this lesson relates to"),
    applyToSkill: z.boolean().optional().default(false).describe("Set true after user confirms to write to SKILL.md"),
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

  update_doc_field: {
    name: "update_doc_field",
    description: "Save a value for a single questionnaire field. Prefer batch_update_doc_fields when filling multiple fields at once.",
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
    description: "Fill multiple questionnaire fields at once. PREFER this over calling update_doc_field repeatedly.",
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
    description: "Upload a file (PDF, DOCX, image, etc.) to the session. Use get_file_content to read extracted text after attaching.",
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
    description: "Generate a downloadable file for a completed document.",
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
    description: "Move to a different phase. Phases: 'scope' (choose packs), 'documents' (collect data/files), 'audit' (review results).",
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
    description: "Read a compliance pack's full content to assess whether it applies to the user's product.",
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
    description: "Create a new compliance pack with metadata, fields, documents, checks, and redlines. Interview the user first — study existing packs via read_pack as reference.",
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
    description: "Start the compliance audit for selected packs. Sets up each pack and runs ready checks. Call prepare_for_audit first.",
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
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      for (const packId of auditPackIds) {
        const setupResult = await setupPackAudit(sessionId, packId);
        const runResult = await runPendingChecks(sessionId, packId);
        totalPromptTokens += runResult.usage.promptTokens;
        totalCompletionTokens += runResult.usage.completionTokens;
        results.push({ ...setupResult, checksCompleted: runResult.completed, checksFailed: runResult.failed });
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
    description: "Set up a pack for audit — loads skill, generates steps, initializes per-check state. Must be called before run_pending_checks.",
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
    description: "Execute ready checks for a pack. Processes one dependency depth level per call. Call repeatedly until allDone or blocked.",
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
    description: "Retry a failed check. Resets the check and its transitive dependents to pending state. Call run_pending_checks afterward.",
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
    description: "Get current audit state for a pack — per-check status, verdicts, reasoning, and errors.",
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
    description: "Finalize the compliance audit — stores final results, sets auditDone=true. Call after all packs are done.",
    inputSchema: ToolSchemas.finalize_audit,
    logLabel: "Finalize audit",
    mutates: true,
    execute: async (sessionId, _input) => {
      return await finalizeAudit(sessionId) as unknown as Record<string, unknown>;
    },
  },



  get_session_state: {
    name: "get_session_state",
    description: "Get full session state — selected packs, fields, files, audit results, validation.",
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
    description: "Read the extracted text from an uploaded file.",
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
    description: "Check questionnaire completeness — verify all required fields are filled.",
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
    description: "Generate documents from questionnaire data, store as chunked files, mark finalized. Must call run_validation first. Must get user confirmation before calling.",
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
    description: "Search regulation clauses by keyword across available regulations.",
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
    description: "Get the full text of a regulation or specific clause.",
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
    description: "Search uploaded file content by keyword to find relevant information.",
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
    description: "Record a lesson from an audit finding. On first call saves as pending; call again with applyToSkill=true after user confirms.",
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
