export type PlatformRole = "superadmin" | "operator";
export type TenantRole = "admin" | "expert" | "tester";
export type UserWithRoles = {
  platformRole: PlatformRole;
  memberships: { role: TenantRole }[];
};

export const PLATFORM_ROLES = {
  SUPERADMIN: "superadmin",
  OPERATOR: "operator",
} as const;

export const TENANT_ROLES = {
  ADMIN: "admin",
  EXPERT: "expert",
  TESTER: "tester",
} as const;

export const ROLE_HIERARCHY: Record<string, number> = {
  superadmin: 100,
  operator: 50,
  admin: 30,
  expert: 20,
  tester: 10,
};

export function hasMinPlatformRole(
  userRole: PlatformRole,
  minRole: PlatformRole,
): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

export function hasMinTenantRole(
  userRole: TenantRole,
  minRole: TenantRole,
): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

export function hasExactTenantRole(
  userRole: TenantRole,
  targetRole: TenantRole,
): boolean {
  return userRole === targetRole;
}

export function isValidPlatformRole(role: string): role is PlatformRole {
  return Object.values(PLATFORM_ROLES).includes(role as PlatformRole);
}

export function isValidTenantRole(role: string): role is TenantRole {
  return Object.values(TENANT_ROLES).includes(role as TenantRole);
}
