import { z } from "zod";
import {
  getComplianceSession, setComplianceScope, setComplianceStep,
  addComplianceDocField, addComplianceFile, getComplianceFiles,
  clearComplianceAuditResults, setComplianceAuditRunning,
  setComplianceValidation, hasSessionSetup, loadSessionSetup,
} from "./agent/shared/memory/repository";
import type { ComplianceFile } from "./agent/shared/memory/repository";
import { setupSkill, processSessionFiles } from "./agent/loading/loading-orchestrator";
import { saveCompiledPack } from "./agent/loading/skill/loader";
import { saveLessonOverride, getLessonOverrides } from "./agent/shared/memory/repository";
import { searchPacks, getPack, packs } from "./compliance-packs";
import { buildSession } from "./compliance-session";
import { getRegulationApi } from "./agent/knowledge/regulation-api";
import { getDocStore } from "./agent/user-info/vector-store";

export type ToolName =
  | "set_scope"
  | "update_doc_field"
  | "attach_file"
  | "start_audit"
  | "export_document"
  | "change_step"
  | "search_packs"
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
    value: z.string().describe("Field value"),
  }),
  attach_file: z.object({
    name: z.string().describe("Original file name"),
    size: z.string().describe("File size in KB"),
    time: z.string().describe("Upload date"),
    dataUrl: z.string().describe("Base64-encoded data URL"),
  }),
  start_audit: z.object({}),
  export_document: z.object({
    docType: z.string().describe("Document type to export"),
  }),
  change_step: z.object({
    step: z.number().min(1).max(3).describe("Target step: 1, 2, or 3"),
  }),
  search_packs: z.object({
    query: z.string().optional().describe("Search term"),
    regulation: z.string().optional().describe("Regulation filter"),
    industry: z.string().optional().describe("Industry filter"),
  }),
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
    description: "Select which compliance packs to include in the assessment scope.",
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
    description: "Save a value for a document field (e.g. manufacturer name on Declaration of Conformity).",
    inputSchema: ToolSchemas.update_doc_field,
    logLabel: "Update document field",
    mutates: true,
    execute: async (sessionId, input) => {
      const { docType, field, value } = input as { docType: string; field: string; value: string };
      addComplianceDocField(sessionId, docType, field, value);
      const s = getComplianceSession(sessionId);
      return { docData: s?.docData ?? {} };
    },
  },

  attach_file: {
    name: "attach_file",
    description: "Attach a file to the session for processing (manual, PDF, DOCX, images, etc.).",
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

  start_audit: {
    name: "start_audit",
    description: "Start the compliance audit across all selected packs.",
    inputSchema: ToolSchemas.start_audit,
    logLabel: "Start audit",
    mutates: true,
    execute: async (sessionId) => {
      const session = getComplianceSession(sessionId);
      if (!session) return { error: "Session not found" };
      await ensureSetup(sessionId);
      clearComplianceAuditResults(sessionId);
      setComplianceAuditRunning(sessionId, true);
      return { jobId: `audit-${sessionId}`, packIds: session.selectedPackIds };
    },
  },

  export_document: {
    name: "export_document",
    description: "Export a completed document as a downloadable file.",
    inputSchema: ToolSchemas.export_document,
    logLabel: "Export document",
    mutates: false,
    execute: async (sessionId, input) => {
      const { docType } = input as { docType: string };
      return { downloadUrl: `/api/compliance/session/${sessionId}/export/${docType}` };
    },
  },

  change_step: {
    name: "change_step",
    description: "Move to a different step in the compliance workflow (1=scope, 2=documents, 3=audit).",
    inputSchema: ToolSchemas.change_step,
    logLabel: "Change step",
    mutates: true,
    execute: async (sessionId, input) => {
      const { step } = input as { step: 1 | 2 | 3 };
      setComplianceStep(sessionId, step);
      if (step >= 2) await ensureSetup(sessionId);
      const s = getComplianceSession(sessionId);
      return { step: s?.step ?? step, selectedPackIds: s?.selectedPackIds ?? [] };
    },
  },

  search_packs: {
    name: "search_packs",
    description: "Search compliance packs by query, regulation, or industry.",
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

  get_pack_details: {
    name: "get_pack_details",
    description: "Get full details for a compliance pack including its checks and required documents.",
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
    description: "Recommend compliance packs based on a product description.",
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
    description: "Get the full current session state — selected packs, filled fields, uploaded files, audit results, validation.",
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
    description: "Read extracted text content from an uploaded file.",
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
    description: "Check document completeness — verify all required fields are filled and files uploaded. Not a compliance audit.",
    inputSchema: ToolSchemas.run_validation,
    logLabel: "Run validation",
    mutates: true,
    execute: async (sessionId) => {
      const s = getComplianceSession(sessionId);
      if (!s) return { error: "Session not found" };

      // Process any uploaded files
      const uploadedFiles = getComplianceFiles(sessionId);
      if (uploadedFiles.length > 0) {
        await ensureSetup(sessionId);
        const files = uploadedFiles.filter((f) => f.dataUrl).map((f) => ({
          name: f.name, size: parseInt(f.size) || 0,
          type: f.dataUrl?.split(";")[0]?.split(":")[1] || "application/octet-stream",
          dataUrl: f.dataUrl ?? "",
        }));
        try { await processSessionFiles({ sessionId, files }); } catch { /* non-critical */ }
      }

      const docData = s.docData;
      const checks: { id: string; title: string; status: "pass" | "warn" | "fail"; note: string }[] = [];

      // For each selected pack, check its required document fields
      for (const packId of s.selectedPackIds) {
        const pack = getPack(packId);
        if (!pack) continue;

        for (const doc of pack.documents) {
          for (const field of doc.fields) {
            if (!field.required) continue;
            const value = docData[doc.type]?.[field.field]?.trim();
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

      // File upload check — warn if no files
      if (checks.length > 0) {
        checks.push({
          id: "file-upload",
          title: "Supporting documents uploaded",
          status: uploadedFiles.length > 0 ? "pass" : "warn",
          note: uploadedFiles.length > 0 ? `${uploadedFiles.length} file(s) uploaded` : "No files uploaded — interview data works too",
        });
      }

      const passed = checks.filter((c) => c.status === "pass").length;
      const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 100;
      setComplianceValidation(sessionId, checks, score);
      return { checks, score };
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
    description: "Get the full text of a regulation or a specific clause within it.",
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
    description: "Suggest a lesson learned from an audit result. On first call, saves as pending. If the user confirms, call again with applyToSkill=true to write it permanently into the skill.",
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

export function getStepTools(step: 1 | 2 | 3): ToolName[] {
  if (step === 1) return ["search_packs", "get_pack_details", "recommend_packs", "search_clauses", "set_scope", "change_step"];
  if (step === 2) return ["update_doc_field", "get_session_state", "get_file_content", "search_files", "run_validation", "attach_file", "change_step"];
  return ["get_session_state", "search_clauses", "get_regulation_text", "start_audit", "export_document", "suggest_lesson", "change_step"];
}
