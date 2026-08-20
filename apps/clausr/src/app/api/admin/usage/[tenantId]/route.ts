import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, getUsageByTenant, getUsagePerUser, AuthError } from "@clausr/platform-core";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const user = await requireOrgAdmin(req, tenantId);

    const perUser = getUsagePerUser(tenantId);
    const recentEvents = getUsageByTenant(tenantId, { limit: 20 });

    return NextResponse.json({ perUser, recentEvents }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
