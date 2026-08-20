import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, AuthError, handleAuthError, deleteOrganization, getOrgById, getOrgMembers } from "@clausr/platform-core";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireOrgAdmin(req, id);

    const org = getOrgById(id);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const members = getOrgMembers(id).filter(
      (m) => user.platformRole === "superadmin" || m.platformRole !== "superadmin"
    );
    return NextResponse.json({ ...org, members }, { status: 200 });
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
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`admin:${ip}`, 30);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const user = await requireOrgAdmin(req);
    if (user.platformRole !== "superadmin") {
      throw new AuthError("Only superadmin can delete organizations", 403);
    }
    const { id } = await params;
    deleteOrganization(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleAuthError(err);
  }
}
