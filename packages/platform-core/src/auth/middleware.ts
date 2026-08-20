import { extractTokenFromRequest, verifySessionToken } from "./session";
import { getUserById } from "./service";
import type { AuthenticatedUser } from "./service";
import type { TenantRole } from "../rbac";

export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const token = extractTokenFromRequest(request);
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  return getUserById(payload.userId);
}

export async function requireAuth(request: Request): Promise<AuthenticatedUser> {
  const user = await authenticateRequest(request);
  if (!user) {
    throw new AuthError("Authentication required", 401);
  }
  return user;
}

export function requireRole(...roles: string[]) {
  return async (request: Request): Promise<AuthenticatedUser> => {
    const user = await requireAuth(request);
    const hasRole = roles.some(
      (r) =>
        user.platformRole === r ||
        user.memberships.some((m) => m.role === r),
    );
    if (!hasRole) {
      throw new AuthError("Insufficient permissions", 403);
    }
    return user;
  };
}

export function requireTenantRole(role: TenantRole) {
  return async (request: Request): Promise<AuthenticatedUser> => {
    const user = await requireAuth(request);
    // Platform-level roles (superadmin, operator) have full access
    if (user.platformRole === "superadmin" || user.platformRole === "operator") return user;
    const hasRole = user.memberships.some((m) => m.role === role);
    if (!hasRole) {
      throw new AuthError("Insufficient permissions — this action requires the " + role + " role", 403);
    }
    return user;
  };
}

export async function requireOrgAdmin(
  request: Request,
  orgId?: string,
): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);
  if (user.platformRole === "superadmin") return user;
  const isAdmin = orgId
    ? user.memberships.some((m) => m.organizationId === orgId && m.role === "admin")
    : user.memberships.some((m) => m.role === "admin");
  if (!isAdmin) throw new AuthError("Insufficient permissions", 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

export function handleAuthError(err: unknown, headers?: HeadersInit): Response {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status, headers });
  }
  return Response.json({ error: "Internal server error" }, { status: 500, headers });
}
