import { z } from "zod";
import {
  getComplianceSession, setComplianceScope, setComplianceStep,
  addComplianceDocField, addComplianceFile, clearComplianceAuditResults,
  setComplianceAuditRunning, setComplianceValidation,
  hasSessionSetup,
} from "./agent/shared/memory/repository";
import type { ComplianceFile } from "./agent/shared/memory/repository";
import { setupSkill, processSessionFiles } from "./agent/loading/loading-orchestrator";
import { searchPacks, getPack, packs } from "./compliance-packs";
import { buildSession } from "./compliance-session";

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
  | "get_document_status"
  | "run_validation"
  | "get_audit_status";

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
  get_document_status: z.object({}),
  run_validation: z.object({}),
  get_audit_status: z.object({}),
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

  get_document_status: {
    name: "get_document_status",
    description: "Check completeness status for all required documents.",
    inputSchema: ToolSchemas.get_document_status,
    logLabel: "Get document status",
    mutates: false,
    execute: async (sessionId) => {
      const s = getComplianceSession(sessionId);
      if (!s) return { error: "Session not found" };
      const docData = s.docData;
      const documents = Object.entries(docData).map(([docType, fields]) => {
        const filled = Object.entries(fields).filter(([, v]) => v?.trim?.()).length;
        return { docType, totalFields: Object.keys(fields).length, filledFields: filled };
      });
      return { documents };
    },
  },

  run_validation: {
    name: "run_validation",
    description: "Run document readiness validation checks.",
    inputSchema: ToolSchemas.run_validation,
    logLabel: "Run validation",
    mutates: true,
    execute: async (sessionId) => {
      await ensureSetup(sessionId);
      const session = buildSession(sessionId);
      if (!session) return { error: "Session not found" };

      if (session.uploadedFiles.length > 0) {
        const files = session.uploadedFiles
          .filter((f) => f.dataUrl)
          .map((f) => ({
            name: f.name, size: parseInt(f.size) || 0,
            type: f.dataUrl?.split(";")[0]?.split(":")[1] || "application/octet-stream",
            dataUrl: f.dataUrl,
          }));
        try { await processSessionFiles({ sessionId, files }); }
        catch { /* processing may fail */ }
      }

      const checks = [
        { id: "V1", title: "Manufacturer name and address provided", status: session.docData["declaration-of-conformity"]?.["manufacturerName"] ? "pass" as const : "fail" as const, note: "" },
        { id: "V2", title: "Product identification provided", status: session.docData["declaration-of-conformity"]?.["productId"] ? "pass" as const : "fail" as const, note: "" },
        { id: "V3", title: "Applicable directives listed", status: session.docData["declaration-of-conformity"]?.["directives"] ? "pass" as const : "fail" as const, note: "" },
        { id: "V4", title: "Harmonized standards referenced", status: session.docData["declaration-of-conformity"]?.["standards"] ? "pass" as const : "fail" as const, note: "" },
        { id: "V5", title: "Signed declaration uploaded", status: session.uploadedFiles.length > 0 ? "pass" as const : "warn" as const, note: "" },
      ];
      const passed = checks.filter((c) => c.status === "pass").length;
      const score = Math.round((passed / checks.length) * 100);
      setComplianceValidation(sessionId, checks, score);
      return { checks, score };
    },
  },

  get_audit_status: {
    name: "get_audit_status",
    description: "Check current audit progress and results.",
    inputSchema: ToolSchemas.get_audit_status,
    logLabel: "Get audit status",
    mutates: false,
    execute: async (sessionId) => {
      const s = getComplianceSession(sessionId);
      if (!s) return { error: "Session not found" };
      return {
        running: s.auditRunning, done: s.auditDone,
        resultsCount: s.auditResults.length,
        totalChecks: s.auditResults.reduce((acc, r) => acc + r.items.length, 0),
      };
    },
  },
};

export function getTool(name: string) {
  return TOOL_DEFS[name as ToolName];
}

export function getStepTools(step: 1 | 2 | 3): ToolName[] {
  if (step === 1) return ["search_packs", "get_pack_details", "recommend_packs", "set_scope", "change_step"];
  if (step === 2) return ["update_doc_field", "get_document_status", "run_validation", "attach_file", "change_step"];
  return ["get_audit_status", "start_audit", "export_document", "change_step"];
}
