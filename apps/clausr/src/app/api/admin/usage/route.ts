import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, getAllUsage, getUsageSummary } from "@clausr/platform-core";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireOrgAdmin(req);

    const from = req.nextUrl.searchParams.get("from")
      ? parseInt(req.nextUrl.searchParams.get("from")!, 10)
      : undefined;
    const to = req.nextUrl.searchParams.get("to")
      ? parseInt(req.nextUrl.searchParams.get("to")!, 10)
      : undefined;

    if (caller.platformRole === "superadmin") {
      const usage = getAllUsage({ from, to });
      return NextResponse.json(usage, { status: 200 });
    }

    // Org admin: return only their orgs' usage
    const adminOrgIds = caller.memberships.filter((m) => m.role === "admin").map((m) => m.organizationId);
    const usage = adminOrgIds.map((id) => {
      const s = getUsageSummary(id);
      return { tenantId: id, totalCost: s.totalCost, totalSessions: s.totalSessions };
    });
    return NextResponse.json(usage, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
