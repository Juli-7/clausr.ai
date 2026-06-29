import {
  getComplianceSession,
  getConversationHistory,
  getComplianceFiles,
  getComplianceComments,
} from "./agent/shared/memory/repository";

export interface ValidationCheck {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  note: string;
}

export interface ComplianceSession {
  id: string;
  step: 1 | 2 | 3;
  selectedPackIds: string[];
  docData: Record<string, Record<string, string>>;
  uploadedFiles: { name: string; size: string; time: string; dataUrl?: string }[];
  auditResults: { packId: string; items: { name: string; desc: string; status: string; statusLabel: string; checks: { name: string; pass: boolean }[] }[] }[];
  messages: { role: string; content: string }[];
  precheckDone: boolean;
  auditDone: boolean;
  auditRunning: boolean;
  agentResponses: Record<string, string>;
  comments: string;
  validationChecks?: ValidationCheck[];
  validationScore?: number;
}

export function buildSession(id: string): ComplianceSession | undefined {
  const cs = getComplianceSession(id);
  if (!cs) return;
  const messages = getConversationHistory(id);
  const files = getComplianceFiles(id);
  return {
    id: cs.id,
    step: cs.step,
    selectedPackIds: cs.selectedPackIds,
    docData: cs.docData,
    uploadedFiles: files.map((f) => ({ name: f.name, size: f.size, time: f.time, dataUrl: f.dataUrl })),
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
    comments: getComplianceComments(id),
    validationChecks: cs.validationChecks as ValidationCheck[] | undefined,
    validationScore: cs.validationScore,
  };
}
