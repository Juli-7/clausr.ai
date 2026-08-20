import { requireAuth, getSession, AuthError } from "@clausr/platform-core";

export async function requireSessionAccess(req: Request, id: string, mode: "read" | "write") {
  const user = await requireAuth(req);
  const session = getSession(id);
  if (!session) throw new AuthError("Session not found", 404);
  const tenantId = user.memberships[0]?.organizationId ?? "";
  const isOwner = session.userId === user.id;
  if (mode === "write") {
    if (!isOwner) throw new AuthError("Session not found", 404);
  } else {
    const sharedInOrg = session.shared && session.tenantId === tenantId;
    if (!isOwner && !sharedInOrg) throw new AuthError("Session not found", 404);
  }
  return { user, session };
}
