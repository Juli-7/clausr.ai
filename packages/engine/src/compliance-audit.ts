import { orchestratePipeline } from "./agent/pipeline/orchestrator-v2";
import { setupSkill } from "./agent/loading/loading-orchestrator";
import {
  setComplianceAuditRunning,
  setComplianceAuditDone,
  setComplianceAgentResponse,
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

interface BackgroundAudit {
  promise: Promise<void>;
  events: ComplianceAuditEvent[];
  done: boolean;
  error?: string;
}

const runningAudits = new Map<string, BackgroundAudit>();

const AUDIT_CLEANUP_MS = 5 * 60 * 1000;

export function startBackgroundAudit(
  sessionId: string,
  packs: { id: string; title: string }[]
): BackgroundAudit {
  const existing = runningAudits.get(sessionId);
  if (existing && !existing.done) return existing;

  const entry: BackgroundAudit = { promise: null as unknown as Promise<void>, events: [], done: false };
  runningAudits.set(sessionId, entry);

  entry.promise = (async () => {
    try {
      for await (const event of runComplianceAudit(sessionId, packs)) {
        entry.events.push(event);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Audit error";
      entry.error = msg;
      entry.events.push({ type: "error", error: msg });
    } finally {
      entry.done = true;
      setTimeout(() => { if (runningAudits.get(sessionId) === entry) runningAudits.delete(sessionId); }, AUDIT_CLEANUP_MS);
    }
  })();

  return entry;
}

export function getBackgroundAudit(sessionId: string): BackgroundAudit | undefined {
  return runningAudits.get(sessionId);
}

export async function* streamBackgroundAuditEvents(
  sessionId: string
): AsyncGenerator<ComplianceAuditEvent> {
  const entry = runningAudits.get(sessionId);
  if (!entry) return;

  let cursor = 0;
  while (true) {
    while (cursor < entry.events.length) {
      yield entry.events[cursor]!;
      cursor++;
    }
    if (entry.done) break;
    await delay(200);
  }
}

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
  yield { type: "done", total: totalCompleted };
}
