import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, queryAuditLog, getAuthDb } from "@clausr/platform-core";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireOrgAdmin(req);

    let tenantId = req.nextUrl.searchParams.get("tenantId") || undefined;
    const userId = req.nextUrl.searchParams.get("userId") || undefined;
    const action = req.nextUrl.searchParams.get("action") || undefined;
    const limit = req.nextUrl.searchParams.get("limit")
      ? parseInt(req.nextUrl.searchParams.get("limit")!, 10)
      : 50;

    // Org admins: scoped to their org(s); force tenantId filter
    if (caller.platformRole !== "superadmin") {
      const adminOrgIds = caller.memberships.filter((m) => m.role === "admin").map((m) => m.organizationId);
      if (tenantId && !adminOrgIds.includes(tenantId)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      // If no tenantId filter given, org admin sees all their orgs' audit
    }

    const events = queryAuditLog({ tenantId, userId, action, limit });

    // Non-superadmins: exclude superadmin events and scope to their orgs
    if (caller.platformRole !== "superadmin") {
      const db = getAuthDb();
      const superadminIds = new Set(
        (db.prepare("SELECT id FROM users WHERE platform_role = 'superadmin'").all() as { id: string }[]).map((r) => r.id)
      );
      const adminOrgIds = new Set(caller.memberships.filter((m) => m.role === "admin").map((m) => m.organizationId));
      const filtered = events.filter((e) => !superadminIds.has(e.userId) && adminOrgIds.has(e.tenantId));
      return NextResponse.json(filtered, { status: 200 });
    }

    return NextResponse.json(events, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
