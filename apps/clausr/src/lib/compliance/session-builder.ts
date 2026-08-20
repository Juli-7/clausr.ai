import { buildSession, getPack, getComplianceSession, getSessionFiles } from "@clausr/engine";
import type { ComplianceSession, SkillPack } from "@clausr/engine";
export { buildSession };
export type { ComplianceSession };

import { updateSessionSummary, getSession } from "@clausr/platform-core";
import type { SessionSummaryData } from "@clausr/platform-core";
import { logger } from "@/lib/logger";

export function saveSessionSummary(sessionId: string): void {
  try {
    const cs = getComplianceSession(sessionId);
    if (!cs) return;

    const docCompleteness: { packId: string; filled: number; total: number }[] = [];
    for (const pid of cs.selectedPackIds) {
      const pack = getPack(pid) as SkillPack | null;
      if (!pack) continue;
      const required = pack.fields.filter((f) => f.required);
      const filled = required.filter((f) => {
        const val = cs.docData[f.id];
        return val && typeof val.value === "string" && val.value.trim().length > 0;
      }).length;
      docCompleteness.push({ packId: pid, filled, total: required.length });
    }

    const auditPerPack: { packId: string; passed: number; failed: number; total: number }[] = [];
    for (const ar of cs.auditResults) {
      const items = ar.items ?? [];
      auditPerPack.push({
        packId: ar.packId,
        passed: items.filter((i) => i.statusLabel === "PASS").length,
        failed: items.filter((i) => i.statusLabel === "FAIL").length,
        total: items.length,
      });
    }

    const files = JSON.parse(getSessionFiles(sessionId) || "[]");
    const fileCount = Array.isArray(files) ? files.length : 0;

    const existing = getSession(sessionId);
    const maxStep = Math.max(cs.step, existing?.summaryData?.step ?? 0);

    const data: SessionSummaryData = {
      step: maxStep,
      selectedPackIds: cs.selectedPackIds,
      uploadedFileCount: fileCount,
      docCompleteness,
      auditPerPack,
      auditDone: cs.auditDone,
    };
    updateSessionSummary(sessionId, data);
  } catch (err) {
    logger.warn("[session-builder] saveSessionSummary failed", { sessionId, error: (err as Error).message });
  }
}
