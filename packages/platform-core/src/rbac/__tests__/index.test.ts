import { describe, it, expect } from "vitest";
import { PLATFORM_ROLES, TENANT_ROLES, ROLE_HIERARCHY, hasMinPlatformRole, hasMinTenantRole, isValidPlatformRole, isValidTenantRole } from "../index";

describe("RBAC role constants", () => {
  it("defines platform roles", () => {
    expect(PLATFORM_ROLES.SUPERADMIN).toBe("superadmin");
    expect(PLATFORM_ROLES.OPERATOR).toBe("operator");
  });

  it("defines tenant roles", () => {
    expect(TENANT_ROLES.ADMIN).toBe("admin");
    expect(TENANT_ROLES.EXPERT).toBe("expert");
    expect(TENANT_ROLES.TESTER).toBe("tester");
  });

  it("defines role hierarchy", () => {
    expect(ROLE_HIERARCHY.superadmin).toBe(100);
    expect(ROLE_HIERARCHY.operator).toBe(50);
    expect(ROLE_HIERARCHY.admin).toBe(30);
    expect(ROLE_HIERARCHY.expert).toBe(20);
    expect(ROLE_HIERARCHY.tester).toBe(10);
  });
});

describe("hasMinPlatformRole", () => {
  it("returns true when user has sufficient role", () => {
    expect(hasMinPlatformRole("superadmin", "operator")).toBe(true);
    expect(hasMinPlatformRole("operator", "operator")).toBe(true);
  });

  it("returns false when user has insufficient role", () => {
    expect(hasMinPlatformRole("operator", "superadmin")).toBe(false);
  });
});

describe("hasMinTenantRole", () => {
  it("returns true when user has sufficient role", () => {
    expect(hasMinTenantRole("admin", "expert")).toBe(true);
    expect(hasMinTenantRole("expert", "expert")).toBe(true);
  });

  it("returns false when user has insufficient role", () => {
    expect(hasMinTenantRole("tester", "admin")).toBe(false);
    expect(hasMinTenantRole("expert", "admin")).toBe(false);
  });
});

describe("isValidPlatformRole", () => {
  it("accepts valid roles", () => {
    expect(isValidPlatformRole("superadmin")).toBe(true);
    expect(isValidPlatformRole("operator")).toBe(true);
  });

  it("rejects invalid roles", () => {
    expect(isValidPlatformRole("admin")).toBe(false);
    expect(isValidPlatformRole("")).toBe(false);
  });
});

describe("isValidTenantRole", () => {
  it("accepts valid roles", () => {
    expect(isValidTenantRole("admin")).toBe(true);
    expect(isValidTenantRole("expert")).toBe(true);
    expect(isValidTenantRole("tester")).toBe(true);
  });

  it("rejects invalid roles", () => {
    expect(isValidTenantRole("superadmin")).toBe(false);
    expect(isValidTenantRole("")).toBe(false);
  });
});
