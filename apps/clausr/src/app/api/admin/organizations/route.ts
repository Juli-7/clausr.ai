import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, logAuditEvent, createOrganization, listOrganizationsForAdmin, addMemberToOrganization } from "@clausr/platform-core";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireOrgAdmin(req);

    let orgs;
    if (caller.platformRole === "superadmin") {
      const { listOrganizations } = await import("@clausr/platform-core");
      orgs = listOrganizations();
    } else {
      const adminOrgIds = caller.memberships.filter((m) => m.role === "admin").map((m) => m.organizationId);
      if (adminOrgIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }
      orgs = listOrganizationsForAdmin(adminOrgIds);
    }

    return NextResponse.json(orgs, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const CreateOrgSchema = z.object({
  name: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireOrgAdmin(req);
    if (user.platformRole !== "superadmin") {
      return NextResponse.json({ error: "Only superadmins can create organizations" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = CreateOrgSchema.parse(body);

    const slug = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) + "-" + crypto.randomUUID().slice(0, 8);

    const org = await createOrganization(parsed.name, slug);
    addMemberToOrganization(user.id, org.id, "admin");

    logAuditEvent({
      tenantId: org.id,
      userId: user.id,
      userEmail: user.email,
      action: "organization.create",
      resourceType: "organization",
      resourceId: org.id,
      metadata: { name: parsed.name },
    });

    return NextResponse.json(org, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
