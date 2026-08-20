import { getAuthDb } from "../auth/db";

export function logAuditEvent(params: {
  tenantId?: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): void {
  const db = getAuthDb();
  db.prepare(
    `INSERT INTO audit_log (tenant_id, user_id, user_email, action, resource_type, resource_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.tenantId ?? "",
    params.userId ?? "",
    params.userEmail ?? "",
    params.action,
    params.resourceType ?? "",
    params.resourceId ?? "",
    JSON.stringify(params.metadata ?? {}),
    Date.now(),
  );
}

export function queryAuditLog(params: {
  tenantId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: number;
  to?: number;
  limit?: number;
}): {
  id: number;
  tenantId: string;
  userId: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}[] {
  const db = getAuthDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.tenantId) { conditions.push("tenant_id = ?"); values.push(params.tenantId); }
  if (params.userId) { conditions.push("user_id = ?"); values.push(params.userId); }
  if (params.action) { conditions.push("action = ?"); values.push(params.action); }
  if (params.resourceType) { conditions.push("resource_type = ?"); values.push(params.resourceType); }
  if (params.resourceId) { conditions.push("resource_id = ?"); values.push(params.resourceId); }
  if (params.from) { conditions.push("created_at >= ?"); values.push(params.from); }
  if (params.to) { conditions.push("created_at <= ?"); values.push(params.to); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...values, params.limit ?? 100) as {
    id: number;
    tenant_id: string;
    user_id: string;
    user_email: string;
    action: string;
    resource_type: string;
    resource_id: string;
    metadata_json: string;
    created_at: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    userEmail: r.user_email,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    metadata: JSON.parse(r.metadata_json),
    createdAt: r.created_at,
  }));
}
