import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, createUser, addMemberToOrganization, getOrgConfig, countOrgMembersByRole, logAuditEvent, listUsersWithMemberships } from "@clausr/platform-core";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  platformRole: z.enum(["superadmin", "operator"]).default("operator"),
  orgId: z.string().optional(),
  orgRole: z.enum(["admin", "expert", "tester"]).default("tester"),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireOrgAdmin(req);

    const orgFilter =
      user.platformRole !== "superadmin" && user.memberships.length > 0
        ? user.memberships.filter((m) => m.role === "admin").map((m) => m.organizationId)
        : undefined;

    const users = listUsersWithMemberships(orgFilter).filter(
      (u) => user.platformRole === "superadmin" || u.platformRole !== "superadmin"
    );
    return NextResponse.json(users, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrf = csrfGuard(req);
    if (csrf) return csrf;
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`admin:${ip}`, 30);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const caller = await requireOrgAdmin(req);
    const body = await req.json();
    const parsed = CreateUserSchema.parse(body);

    const newUser = await createUser(parsed.email, parsed.password, parsed.name, parsed.platformRole);

    if (parsed.orgId) {
      if (caller.platformRole !== "superadmin" && parsed.orgRole === "expert") {
        const config = getOrgConfig(parsed.orgId);
        const limit = config.expertLimit;
        if (limit != null) {
          const expertCount = countOrgMembersByRole(parsed.orgId, "expert");
          if (expertCount >= limit) {
            return NextResponse.json(
              { error: `Expert limit of ${limit} reached for this organization` },
              { status: 403 },
            );
          }
        }
      }
      addMemberToOrganization(newUser.id, parsed.orgId, parsed.orgRole ?? "tester");
      logAuditEvent({
        tenantId: parsed.orgId,
        userId: caller.id,
        userEmail: caller.email,
        action: "user.create",
        resourceType: "user",
        resourceId: newUser.id,
        metadata: { email: parsed.email, addedToOrg: parsed.orgId },
      });
    }

    return NextResponse.json(newUser, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
