import type { SkillPack, PackField } from "@clausr/engine";
import type { ValidationCheck } from "@clausr/engine";
export type { ValidationCheck, PackField } from "@clausr/engine";

export interface ExpertInfo {
  name: string;
  contact: string;
  intro: string;
}

export type Pack = SkillPack & { canEdit?: boolean; author?: string; expert?: ExpertInfo };

export interface DocumentTemplate {
  type: string;
  title: string;
  template?: string;
  fields: string[];
}

export type DocData = Record<string, string>;

export interface ComplianceSession {
  id: string;
  step: 1 | 2 | 3;
  selectedPackIds: string[];
  docData: DocData;
  uploadedFiles: { name: string; size: string; time: string; downloadUrl?: string }[];
  auditResults: AuditResult[];
  messages: { role: string; content: string }[];
  precheckDone: boolean;
  auditDone: boolean;
  auditRunning: boolean;
  agentResponses: Record<string, string>;
  comments: string;
  toolCalls?: { tool: string; result: unknown }[];
  validationChecks?: ValidationCheck[];
  validationScore?: number;
  questionnaire?: { fields: PackField[]; documents: DocumentTemplate[] };
}

export interface AuditSubResult {
  name: string;
  pass: boolean;
}

export interface AuditItem {
  name: string;
  desc: string;
  status: "wait" | "run" | "done" | "err";
  statusLabel: string;
  checks: AuditSubResult[];
}

export interface AuditResult {
  packId: string;
  items: AuditItem[];
}

export type Step = 1 | 2 | 3;

export interface AuditOverride {
  checkId: string;
  originalVerdict: string;
  newVerdict: string;
  originalReasoning: string;
  newReasoning: string;
  changedBy: string;
  changedAt: number;
  reason: string;
}
