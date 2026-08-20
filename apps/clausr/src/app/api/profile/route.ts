import { NextResponse } from "next/server";
import { requireAuth, getUserUsage, getUsagePerUser, getOrgConfig } from "@clausr/platform-core";

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);

    const personalUsage = getUserUsage(user.id);
    const orgUsage = await Promise.all(
      user.memberships.map(async (m) => {
        const perUser = getUsagePerUser(m.organizationId);
        const config = getOrgConfig(m.organizationId);
        return { orgId: m.organizationId, orgName: m.organizationName, perUser, config };
      }),
    );

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        isActive: user.isActive,
        memberships: user.memberships,
      },
      usage: personalUsage,
      orgUsage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
