import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, setUserActive, updateUserRole, deleteUser, AuthError, handleAuthError, isUserInSameOrg } from "@clausr/platform-core";

const UpdateUserSchema = z.object({
  isActive: z.boolean().optional(),
  platformRole: z.enum(["superadmin", "operator"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireOrgAdmin(req);
    const { id } = await params;

    if (caller.platformRole !== "superadmin") {
      if (!isUserInSameOrg(id, caller.id)) {
        return NextResponse.json({ error: "User not in your organization" }, { status: 403 });
      }
    }

    const body = await req.json();
    const parsed = UpdateUserSchema.parse(body);

    // Org admins can only toggle isActive, not change platformRole
    if (parsed.platformRole !== undefined && caller.platformRole !== "superadmin") {
      return NextResponse.json({ error: "Only superadmins can change platform role" }, { status: 403 });
    }

    if (parsed.isActive !== undefined) {
      setUserActive(id, parsed.isActive);
    }
    if (parsed.platformRole !== undefined) {
      updateUserRole(id, parsed.platformRole);
    }

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
    const caller = await requireOrgAdmin(req);
    if (caller.platformRole !== "superadmin") {
      throw new AuthError("Only superadmin can delete users", 403);
    }
    const { id } = await params;
    deleteUser(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleAuthError(err);
  }
}
