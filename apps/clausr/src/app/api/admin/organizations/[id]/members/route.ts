import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, addMemberToOrganization, removeMemberFromOrganization, logAuditEvent, getOrgConfig, getMemberRole, countOrgMembersByRole } from "@clausr/platform-core";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

const AddMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "expert", "tester"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrf = csrfGuard(req);
    if (csrf) return csrf;
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`admin:${ip}`, 30);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id: orgId } = await params;
    const user = await requireOrgAdmin(req, orgId);
    const body = await req.json();
    const parsed = AddMemberSchema.parse(body);

    if (parsed.role === "expert" && user.platformRole !== "superadmin") {
      const existing = getMemberRole(parsed.userId, orgId);
      if (!existing || existing !== "expert") {
        const config = getOrgConfig(orgId);
        const limit = config.expertLimit;
        if (limit != null) {
          const expertCount = countOrgMembersByRole(orgId, "expert");
          if (expertCount >= limit) {
            return NextResponse.json(
              { error: `Expert limit of ${limit} reached for this organization` },
              { status: 403 },
            );
          }
        }
      }
    }

    addMemberToOrganization(parsed.userId, orgId, parsed.role);

    logAuditEvent({
      tenantId: orgId,
      userId: user.id,
      userEmail: user.email,
      action: "organization.member.add",
      resourceType: "organization",
      resourceId: orgId,
      metadata: { targetUserId: parsed.userId, role: parsed.role },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrf = csrfGuard(req);
    if (csrf) return csrf;

    const { id: orgId } = await params;
    const user = await requireOrgAdmin(req, orgId);
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId query parameter is required" }, { status: 400 });
    }

    removeMemberFromOrganization(userId, orgId);

    logAuditEvent({
      tenantId: orgId,
      userId: user.id,
      userEmail: user.email,
      action: "organization.member.remove",
      resourceType: "organization",
      resourceId: orgId,
      metadata: { targetUserId: userId },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
