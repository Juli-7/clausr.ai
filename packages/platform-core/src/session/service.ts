import { getAuthDb } from "../auth/db";

export interface SessionSummaryData {
  step: number;
  selectedPackIds: string[];
  uploadedFileCount: number;
  docCompleteness: { packId: string; filled: number; total: number }[];
  auditPerPack: { packId: string; passed: number; failed: number; total: number }[];
  auditDone: boolean;
}

export interface SessionRow {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  name: string;
  skillName: string;
  createdAt: number;
  starred: boolean;
  shared: boolean;
  summaryData: SessionSummaryData | null;
}

interface RawSessionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  user_email: string;
  name: string;
  skill_name: string;
  created_at: number;
  starred: number;
  shared: number;
  summary_data: string | null;
}

function parseSummary(raw: string | null): SessionSummaryData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.step === "number") return parsed as SessionSummaryData;
    return null;
  } catch {
    return null;
  }
}

function mapSession(row: RawSessionRow): SessionRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    userEmail: row.user_email,
    name: row.name,
    skillName: row.skill_name,
    createdAt: row.created_at,
    starred: row.starred === 1,
    shared: row.shared === 1,
    summaryData: parseSummary(row.summary_data),
  };
}

export function createSession(
  id: string,
  tenantId: string,
  userId: string,
  userEmail: string,
  name?: string,
  skillName?: string,
): SessionRow {
  const db = getAuthDb();
  const now = Date.now();
  const initial: SessionSummaryData = { step: 1, selectedPackIds: [], uploadedFileCount: 0, docCompleteness: [], auditPerPack: [], auditDone: false };
  const summary = JSON.stringify(initial);
  db.prepare(
    "INSERT OR IGNORE INTO sessions (id, tenant_id, user_id, user_email, name, skill_name, created_at, summary_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, tenantId, userId, userEmail, name ?? "", skillName ?? "", now, summary);
  return { id, tenantId, userId, userEmail, name: name ?? "", skillName: skillName ?? "", createdAt: now, starred: false, shared: false, summaryData: initial };
}

export function updateSessionSummary(id: string, data: SessionSummaryData): void {
  getAuthDb().prepare("UPDATE sessions SET summary_data = ? WHERE id = ?").run(JSON.stringify(data), id);
}

export function updateSessionName(id: string, name: string): void {
  getAuthDb().prepare("UPDATE sessions SET name = ? WHERE id = ?").run(name, id);
}

export function getSession(id: string): SessionRow | null {
  const db = getAuthDb();
  const row = db.prepare(
    "SELECT id, tenant_id, user_id, user_email, name, skill_name, created_at, starred, shared, summary_data FROM sessions WHERE id = ?"
  ).get(id) as RawSessionRow | undefined;
  return row ? mapSession(row) : null;
}

export function listSessions(tenantId?: string, userId?: string, limit = 50): SessionRow[] {
  const db = getAuthDb();

  const cols = "id, tenant_id, user_id, user_email, name, skill_name, created_at, starred, shared, summary_data";
  let sql: string;
  const params: (string | number)[] = [];

  // Split OR into UNION ALL so each branch uses its own index
  if (tenantId && userId) {
    sql = `SELECT ${cols} FROM sessions WHERE tenant_id = ? AND user_id = ?
UNION ALL
SELECT ${cols} FROM sessions WHERE tenant_id = ? AND shared = 1 AND user_id != ?
ORDER BY created_at DESC
LIMIT ?`;
    params.push(tenantId, userId, tenantId, userId, limit);
  } else if (tenantId) {
    sql = `SELECT ${cols} FROM sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`;
    params.push(tenantId, limit);
  } else if (userId) {
    sql = `SELECT ${cols} FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`;
    params.push(userId, limit);
  } else {
    sql = `SELECT ${cols} FROM sessions ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);
  }

  const rows = db.prepare(sql).all(...params) as RawSessionRow[];
  return rows.map(mapSession);
}

export function deleteSession(id: string): void {
  getAuthDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function pruneUnnamedSessions(minAge = 0): string[] {
  const db = getAuthDb();
  const rows = db.prepare(
    "SELECT id FROM sessions WHERE (name IS NULL OR name = '') AND created_at < ?"
  ).all(Date.now() - minAge) as { id: string }[];
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...ids);
  }
  return ids;
}

export function toggleStar(sessionId: string, starred: boolean): void {
  getAuthDb().prepare("UPDATE sessions SET starred = ? WHERE id = ?").run(starred ? 1 : 0, sessionId);
}

export function toggleShare(sessionId: string, shared: boolean): void {
  getAuthDb().prepare("UPDATE sessions SET shared = ? WHERE id = ?").run(shared ? 1 : 0, sessionId);
}
