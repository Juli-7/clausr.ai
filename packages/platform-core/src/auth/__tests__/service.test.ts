import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

const TEST_DB = join(tmpdir(), `test-auth-service-${process.pid}.db`);

import { closeAuthDb, getAuthDb } from "../db";
import {
  createUser,
  verifyCredentials,
  getUserById,
  listUsers,
  setUserActive,
  createOrganization,
  addMemberToOrganization,
  listOrganizations,
  updatePassword,
  deleteUser,
  deleteOrganization,
  removeMemberFromOrganization,
} from "../service";

function cleanup() {
  closeAuthDb();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
}

describe("auth service", () => {
  beforeAll(() => {
    process.env.AUTH_DB_PATH = TEST_DB;
  });

  afterAll(() => {
    cleanup();
  });

  afterEach(() => {
    const db = getAuthDb();
    db.exec("DELETE FROM organization_members");
    db.exec("DELETE FROM organizations");
    db.exec("DELETE FROM users");
  });

  describe("createUser", () => {
    it("creates a user with operator role by default", async () => {
      const user = await createUser("alice@test.com", "password123", "Alice");
      expect(user.email).toBe("alice@test.com");
      expect(user.name).toBe("Alice");
      expect(user.platformRole).toBe("operator");
      expect(user.isActive).toBe(true);
      expect(user.id).toBeTruthy();
    });

    it("creates a user with superadmin role", async () => {
      const user = await createUser("admin@test.com", "admin123", "Admin", "superadmin");
      expect(user.platformRole).toBe("superadmin");
    });

    it("rejects duplicate email", async () => {
      await createUser("dup@test.com", "pass1", "Dup");
      await expect(createUser("dup@test.com", "pass2", "Dup2")).rejects.toThrow();
    });
  });

  describe("verifyCredentials", () => {
    it("returns user for valid credentials", async () => {
      await createUser("bob@test.com", "secret", "Bob");
      const result = await verifyCredentials("bob@test.com", "secret");
      expect(result).not.toBeNull();
      expect(result!.email).toBe("bob@test.com");
      expect(result!.name).toBe("Bob");
    });

    it("returns null for wrong password", async () => {
      await createUser("bob2@test.com", "secret", "Bob");
      const result = await verifyCredentials("bob2@test.com", "wrong");
      expect(result).toBeNull();
    });

    it("returns null for unknown email", async () => {
      const result = await verifyCredentials("nobody@test.com", "any");
      expect(result).toBeNull();
    });

    it("returns null for inactive user", async () => {
      await createUser("inactive@test.com", "pass", "Inactive");
      setUserActive((await verifyCredentials("inactive@test.com", "pass"))!.id, false);
      const result = await verifyCredentials("inactive@test.com", "pass");
      expect(result).toBeNull();
    });
  });

  describe("getUserById", () => {
    it("returns user by id", async () => {
      const created = await createUser("find@test.com", "pass", "FindMe");
      const found = getUserById(created.id);
      expect(found).not.toBeNull();
      expect(found!.email).toBe("find@test.com");
    });

    it("returns null for unknown id", () => {
      const found = getUserById("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("listUsers", () => {
    it("returns all users", async () => {
      await createUser("first@test.com", "pass", "First");
      await createUser("second@test.com", "pass", "Second");
      const users = listUsers();
      expect(users.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("setUserActive", () => {
    it("deactivates and reactivates a user", async () => {
      const user = await createUser("toggle@test.com", "pass", "Toggle");
      setUserActive(user.id, false);
      expect(getUserById(user.id)!.isActive).toBe(false);
      setUserActive(user.id, true);
      expect(getUserById(user.id)!.isActive).toBe(true);
    });
  });

  describe("organizations", () => {
    it("creates and lists organizations", async () => {
      const org = await createOrganization("Test Org", "test-org");
      expect(org.name).toBe("Test Org");
      const orgs = listOrganizations();
      expect(orgs.some((o) => o.id === org.id)).toBe(true);
    });

    it("adds members to organization", async () => {
      const org = await createOrganization("Member Org", "member-org");
      const user = await createUser("member@test.com", "pass", "Member");
      addMemberToOrganization(user.id, org.id, "expert");

      const found = getUserById(user.id);
      expect(found!.memberships.length).toBeGreaterThanOrEqual(1);
      expect(found!.memberships.some((m) => m.organizationId === org.id)).toBe(true);
    });

    it("removes members from organization", async () => {
      const org = await createOrganization("Remove Org", "remove-org");
      const user = await createUser("remove@test.com", "pass", "Remove");
      addMemberToOrganization(user.id, org.id, "tester");
      removeMemberFromOrganization(user.id, org.id);
      const found = getUserById(user.id);
      expect(found!.memberships.some((m) => m.organizationId === org.id)).toBe(false);
    });

    it("deletes organization", async () => {
      const org = await createOrganization("Delete Org", "delete-org");
      deleteOrganization(org.id);
      const orgs = listOrganizations();
      expect(orgs.some((o) => o.id === org.id)).toBe(false);
    });
  });

  describe("updatePassword", () => {
    it("updates password with valid current password", async () => {
      const user = await createUser("chpass@test.com", "oldpass", "Chpass");
      await updatePassword(user.id, "oldpass", "newpass");
      const result = await verifyCredentials("chpass@test.com", "newpass");
      expect(result).not.toBeNull();
    });

    it("rejects invalid current password", async () => {
      const user = await createUser("chpass2@test.com", "oldpass", "Chpass2");
      await expect(updatePassword(user.id, "wrong", "newpass")).rejects.toThrow("Current password is incorrect");
    });
  });

  describe("deleteUser", () => {
    it("deletes a user and their memberships", async () => {
      const org = await createOrganization("Del User Org", "del-user-org");
      const user = await createUser("delete@test.com", "pass", "Delete");
      addMemberToOrganization(user.id, org.id, "expert");
      deleteUser(user.id);
      expect(getUserById(user.id)).toBeNull();
    });
  });
});
