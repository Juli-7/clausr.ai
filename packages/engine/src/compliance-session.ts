import {
  getComplianceSession,
  getConversationHistory,
  getComplianceFiles,
  type DocFieldValue,
} from "./agent/shared/memory/repository";
import { getPack } from "./compliance-packs";
import type { PackField, DocumentTemplate, PackCheck } from "./agent/loading/skill/loader";

export interface ValidationCheck {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  note: string;
}

export interface Questionnaire {
  fields: PackField[];
  documents: DocumentTemplate[];
  checks: PackCheck[];
  docData: Record<string, DocFieldValue>;
}

export interface ComplianceSession {
  id: string;
  step: 1 | 2 | 3;
  selectedPackIds: string[];
  docData: Record<string, DocFieldValue>;
  questionnaire?: Questionnaire;
  uploadedFiles: { name: string; size: string; time: string; docType?: string }[];
  auditResults: { packId: string; items: { name: string; desc: string; status: "wait" | "run" | "done" | "err"; statusLabel: string; checks: { name: string; pass: boolean }[] }[] }[];
  messages: { role: string; content: string }[];
  precheckDone: boolean;
  auditDone: boolean;
  auditRunning: boolean;
  agentResponses: Record<string, string>;
  comments: string;
  toolCalls: { tool: string; result: unknown }[];
  validationChecks?: ValidationCheck[];
  validationScore?: number;
  packStates: Record<string, unknown>;
  documentsFinalized: boolean;
  testPlans: { checkId: string; status: string; standardProcedure?: string; adaptedProcedure?: string; resultSummary?: string }[];
}

function buildQuestionnaire(packIds: string[]): Questionnaire | undefined {
  const allFields: PackField[] = [];
  const allDocuments: DocumentTemplate[] = [];
  const allChecks: PackCheck[] = [];
  for (const packId of packIds) {
    const pack = getPack(packId);
    if (!pack) continue;
    allFields.push(...pack.fields);
    allDocuments.push(...pack.documents);
    allChecks.push(...pack.checks);
  }
  if (allFields.length === 0) return undefined;
  return { fields: allFields, documents: allDocuments, checks: allChecks, docData: {} };
}

export function buildSession(id: string): ComplianceSession | undefined {
  const cs = getComplianceSession(id);
  if (!cs) return;
  const messages = getConversationHistory(id);
  const files = getComplianceFiles(id);
  const questionnaire = buildQuestionnaire(cs.selectedPackIds);
  return {
    id: cs.id,
    step: cs.step,
    selectedPackIds: cs.selectedPackIds,
    docData: cs.docData,
    questionnaire: questionnaire ? { ...questionnaire, docData: cs.docData } : undefined,
    uploadedFiles: files.map((f) => ({ name: f.name, size: f.size, time: f.time, docType: f.docType })),
    auditResults: cs.auditResults.map((r) => ({
      packId: r.packId,
      items: r.items.map((i) => ({
        name: i.name,
        desc: i.desc,
        status: i.status as "wait" | "run" | "done" | "err",
        statusLabel: i.statusLabel,
        checks: i.checks.map((c) => ({ name: c.name, pass: c.pass })),
      })),
    })),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    precheckDone: cs.precheckDone,
    auditDone: cs.auditDone,
    auditRunning: cs.auditRunning,
    agentResponses: cs.agentResponses,
    comments: cs.comments,
    toolCalls: cs.toolCalls,
    validationChecks: cs.validationChecks as ValidationCheck[] | undefined,
    validationScore: cs.validationScore,
    packStates: cs.packStates,
    documentsFinalized: cs.documentsFinalized,
    testPlans: cs.testPlans ?? [],
  };
}
