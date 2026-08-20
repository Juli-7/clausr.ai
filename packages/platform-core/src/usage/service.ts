import { getAuthDb } from "../auth/db";

export interface UsageEvent {
  id: number;
  tenantId: string;
  userId: string;
  sessionId: string;
  eventType: string;
  quantity: number;
  unit: string;
  cost: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface UsageRecord {
  eventType: string;
  quantity: number;
  cost: number;
  unit: string;
  createdAt: number;
  sessionId: string;
}

export function recordUsage(params: {
  tenantId?: string;
  userId?: string;
  sessionId?: string;
  eventType: string;
  quantity?: number;
  unit?: string;
  cost?: number;
  metadata?: Record<string, unknown>;
}): void {
  const db = getAuthDb();
  db.prepare(
    `INSERT INTO usage_events (tenant_id, user_id, session_id, event_type, quantity, unit, cost, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.tenantId ?? "",
    params.userId ?? "",
    params.sessionId ?? "",
    params.eventType,
    params.quantity ?? 0,
    params.unit ?? "",
    params.cost ?? 0,
    JSON.stringify(params.metadata ?? {}),
    Date.now(),
  );
}

export function getUsageByTenant(
  tenantId: string,
  options?: { from?: number; to?: number; limit?: number },
): UsageRecord[] {
  const db = getAuthDb();
  const conditions = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];

  if (options?.from) {
    conditions.push("created_at >= ?");
    params.push(options.from);
  }
  if (options?.to) {
    conditions.push("created_at <= ?");
    params.push(options.to);
  }

  const rows = db
    .prepare(
      `SELECT event_type, quantity, cost, unit, created_at, session_id
       FROM usage_events
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(...params, options?.limit ?? 100) as {
    event_type: string;
    quantity: number;
    cost: number;
    unit: string;
    created_at: number;
    session_id: string;
  }[];

  return rows.map((r) => ({
    eventType: r.event_type,
    quantity: r.quantity,
    cost: r.cost,
    unit: r.unit,
    createdAt: r.created_at,
    sessionId: r.session_id,
  }));
}

export function getUsageSummary(tenantId: string): {
  totalCost: number;
  totalSessions: number;
  byType: { eventType: string; quantity: number; cost: number }[];
} {
  const db = getAuthDb();

  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) as total_cost,
              COUNT(DISTINCT session_id) as total_sessions
       FROM usage_events WHERE tenant_id = ?`
    )
    .get(tenantId) as { total_cost: number; total_sessions: number };

  const byType = db
    .prepare(
      `SELECT event_type, SUM(quantity) as quantity, SUM(cost) as cost
       FROM usage_events WHERE tenant_id = ?
       GROUP BY event_type ORDER BY cost DESC`
    )
    .all(tenantId) as { event_type: string; quantity: number; cost: number }[];

  return {
    totalCost: totals.total_cost,
    totalSessions: totals.total_sessions,
    byType: byType.map((r) => ({
      eventType: r.event_type,
      quantity: r.quantity,
      cost: r.cost,
    })),
  };
}

export function getUsagePerUser(tenantId: string): {
  userId: string;
  totalCost: number;
  totalSessions: number;
  totalQuantity: number;
}[] {
  const db = getAuthDb();
  const rows = db
    .prepare(
      `SELECT user_id,
              COALESCE(SUM(cost), 0) as total_cost,
              COUNT(DISTINCT session_id) as total_sessions,
              COALESCE(SUM(quantity), 0) as total_quantity
       FROM usage_events WHERE tenant_id = ?
       GROUP BY user_id ORDER BY total_cost DESC`
    )
    .all(tenantId) as { user_id: string; total_cost: number; total_sessions: number; total_quantity: number }[];
  return rows.map((r) => ({
    userId: r.user_id,
    totalCost: r.total_cost,
    totalSessions: r.total_sessions,
    totalQuantity: r.total_quantity,
  }));
}

export function getUserUsage(userId: string): {
  totalCost: number;
  totalSessions: number;
  totalQuantity: number;
} {
  const db = getAuthDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) as total_cost,
              COUNT(DISTINCT session_id) as total_sessions,
              COALESCE(SUM(quantity), 0) as total_quantity
       FROM usage_events WHERE user_id = ?`
    )
    .get(userId) as { total_cost: number; total_sessions: number; total_quantity: number };
  return { totalCost: row.total_cost, totalSessions: row.total_sessions, totalQuantity: row.total_quantity };
}

export function getOrgUsageCost(
  tenantId: string,
  period: "monthly" | "total" = "monthly",
): number {
  const db = getAuthDb();
  const conditions = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];

  if (period === "monthly") {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    conditions.push("created_at >= ?");
    params.push(startOfMonth);
  }

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) as total_cost
       FROM usage_events
       WHERE ${conditions.join(" AND ")}`
    )
    .get(...params) as { total_cost: number };

  return row.total_cost;
}

export function getAllUsage(options?: { from?: number; to?: number }): {
  tenantId: string;
  totalCost: number;
  totalSessions: number;
}[] {
  const db = getAuthDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.from) {
    conditions.push("created_at >= ?");
    params.push(options.from);
  }
  if (options?.to) {
    conditions.push("created_at <= ?");
    params.push(options.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT tenant_id,
              COALESCE(SUM(cost), 0) as total_cost,
              COUNT(DISTINCT session_id) as total_sessions
       FROM usage_events ${where}
       GROUP BY tenant_id ORDER BY total_cost DESC`
    )
    .all(...params) as { tenant_id: string; total_cost: number; total_sessions: number }[];

  return rows.map((r) => ({
    tenantId: r.tenant_id,
    totalCost: r.total_cost,
    totalSessions: r.total_sessions,
  }));
}
