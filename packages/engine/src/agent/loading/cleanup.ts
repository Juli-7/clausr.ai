import { getDb } from "../shared/memory/database";
import { getConfig } from "../llm/config";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

function isValidSessionId(id: string): boolean {
  if (id.length < 1 || id.length > 128) return false;
  for (let i = 0; i < id.length; i++) {
    const c = id[i]!;
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "-") continue;
    return false;
  }
  return true;
}

function deleteSessionCascade(db: ReturnType<typeof getDb>, sessionId: string): void {
  db.prepare("DELETE FROM context_snapshots WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM responses WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function removeUploadDir(sessionId: string): void {
  if (!isValidSessionId(sessionId)) return;
  const dir = path.join(UPLOADS_DIR, sessionId);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // best-effort
  }
}

/**
 * Prune sessions based on retention policy.
 * - Deletes unstarred sessions older than retention_days
 * - If retention_max_sessions > 0, also prunes oldest unstarred sessions exceeding the limit
 * - Removes upload directories for deleted sessions
 *
 * Safe to call frequently — runs a single transaction and is idempotent.
 */
export function pruneOldSessions(): void {
  const db = getDb();
  const retentionDays = parseInt(getConfig("retention_days", "90"), 10);
  const maxSessions = parseInt(getConfig("max_sessions", "0"), 10);

  const pruneByAge = db.transaction(() => {
    const idsToRemove: string[] = [];

    // 1. Time-based: delete sessions older than cutoff (exclude starred)
    if (retentionDays > 0) {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const oldSessions = db
        .prepare(
          "SELECT id FROM sessions WHERE created_at < ? AND starred = 0"
        )
        .all(cutoff) as { id: string }[];

      for (const s of oldSessions) {
        idsToRemove.push(s.id);
      }
    }

    // 2. Count-based: if too many unstarred sessions, prune oldest
    if (maxSessions > 0) {
      const excess = db
        .prepare(
          `SELECT id FROM sessions WHERE starred = 0
           ORDER BY created_at DESC
           LIMIT -1 OFFSET ?`
        )
        .all(maxSessions) as { id: string }[];

      for (const s of excess) {
        idsToRemove.push(s.id);
      }
    }

    for (const id of idsToRemove) {
      deleteSessionCascade(db, id);
      removeUploadDir(id);
    }
  });

  pruneByAge();
}
