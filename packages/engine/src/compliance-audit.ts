import { orchestratePipeline } from "./agent/pipeline/orchestrator-v2";
import { setupSkill } from "./agent/loading/loading-orchestrator";
import {
  setComplianceAuditRunning,
  setComplianceAuditDone,
  setComplianceAgentResponse,
  addUserMessage,
  getComplianceSession,
} from "./agent/shared/memory/repository";
import { getDocStore } from "./agent/user-info/vector-store";
import type { ProcessedFile } from "./agent/user-info/vector-store/types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ComplianceAuditEvent =
  | { type: "pack-start"; packId: string; packTitle: string }
  | { type: "pipeline-token"; text: string }
  | { type: "pipeline-status"; phase: string }
  | { type: "pipeline-usage"; promptTokens: number; completionTokens: number }
  | { type: "check-result"; packId: string; checkId: string; title: string; verdict: string; reasoning: string; completed: number; total: number }
  | { type: "pack-done"; packId: string }
  | { type: "error"; error: string }
  | { type: "done"; total: number };

function buildEvidenceEntries(sessionId: string): ProcessedFile[] {
  const session = getComplianceSession(sessionId);
  if (!session) return [];
  const entries: ProcessedFile[] = [];
  let evidenceIndex = 0;
  for (const [docType, fields] of Object.entries(session.docData)) {
    for (const [field, entry] of Object.entries(fields)) {
      evidenceIndex++;
      const evidenceId = `evidence-${docType}-${field}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      entries.push({
        fileId: evidenceId,
        filename: `Evidence: ${docType} — ${field}`,
        extractedText: entry.value,
        chunks: [{
          id: `${sessionId}_${evidenceId}_0`,
          text: entry.value,
        }],
        extractorUsed: "evidence-interview",
      });
    }
  }
  return entries;
}

export async function* runComplianceAudit(
  sessionId: string,
  packs: { id: string; title: string }[]
): AsyncGenerator<ComplianceAuditEvent> {
  const store = getDocStore();
  const evidenceEntries = buildEvidenceEntries(sessionId);
  for (const entry of evidenceEntries) {
    await store.addEvidenceFile(sessionId, entry);
  }

  let totalCompleted = 0;

  for (const pack of packs) {
    setComplianceAuditRunning(sessionId, true);
    yield { type: "pack-start", packId: pack.id, packTitle: pack.title };

    try {
      await setupSkill(sessionId, pack.id);

      for await (const event of orchestratePipeline(sessionId, "analyze")) {
        if (event.type === "token") {
          yield { type: "pipeline-token", text: event.text };
        } else if (event.type === "status") {
          yield { type: "pipeline-status", phase: event.phase };
        } else if (event.type === "usage") {
          yield { type: "pipeline-usage", promptTokens: event.promptTokens, completionTokens: event.completionTokens };
        } else if (event.type === "done") {
          const ar = event.response;

          setComplianceAgentResponse(sessionId, pack.id, JSON.stringify(ar));

          const checkResults = ar.checkResults ?? [];
          for (const cr of checkResults) {
            totalCompleted++;
            yield {
              type: "check-result", packId: pack.id, checkId: cr.name, title: cr.name,
              verdict: cr.verdict || (cr.finding && cr.finding !== "missing" ? "PASS" : "FAIL"),
              reasoning: `Finding: ${cr.finding || "N/A"}`,
              completed: totalCompleted, total: totalCompleted,
            };
            await delay(150);
          }

          if (ar.content) {
            addUserMessage(sessionId, ar.content);
          }
        } else if (event.type === "error") {
          yield { type: "error", error: event.error };
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Audit error";
      yield { type: "error", error: errorMsg };
    }

    yield { type: "pack-done", packId: pack.id };
  }

  setComplianceAuditRunning(sessionId, false);
  setComplianceAuditDone(sessionId, true);
  addUserMessage(sessionId, "**Audit complete.** All checks have been processed. Review results on the right panel.");
  yield { type: "done", total: totalCompleted };
}
