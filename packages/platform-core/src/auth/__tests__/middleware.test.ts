import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { authenticateRequest } from "../middleware";
import { closeAuthDb, getAuthDb } from "../db";
import { AUTH_SCHEMA_SQL } from "../schema";
import { USAGE_SCHEMA_SQL } from "../../usage/schema";
import { AUDIT_SCHEMA_SQL } from "../../audit/schema";

const TEST_DB = join(tmpdir(), `test-middleware-${process.pid}.db`);

function cleanup() {
  closeAuthDb();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
}

describe("authenticateRequest", () => {
  beforeAll(() => {
    process.env.AUTH_DB_PATH = TEST_DB;
  });

  afterAll(() => {
    cleanup();
  });

  beforeEach(() => {
    process.env.AUTH_DB_PATH = TEST_DB;
    closeAuthDb();
    const db = getAuthDb();
    db.exec("DELETE FROM organization_members");
    db.exec("DELETE FROM organizations");
    db.exec("DELETE FROM users");
  });

  it("returns user for valid session cookie", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(
      process.env.AUTH_SECRET ?? "dev-secret-change-in-production-min-32-chars!!",
    );

    const db = getAuthDb();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, platform_role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).run("user-mid-1", "mid@test.com", "Middleware", "hash", "superadmin", Date.now(), Date.now());

    const token = await new SignJWT({
      userId: "user-mid-1",
      email: "mid@test.com",
      name: "Middleware",
      platformRole: "superadmin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    const request = new Request("http://localhost", {
      headers: { cookie: `session=${token}` },
    });
    const user = await authenticateRequest(request);
    expect(user).not.toBeNull();
    expect(user!.id).toBe("user-mid-1");
    expect(user!.email).toBe("mid@test.com");
    expect(user!.platformRole).toBe("superadmin");
  });

  it("returns null for missing cookie", async () => {
    const request = new Request("http://localhost");
    const user = await authenticateRequest(request);
    expect(user).toBeNull();
  });

  it("returns null for invalid token", async () => {
    const request = new Request("http://localhost", {
      headers: { cookie: "session=invalid.token.here" },
    });
    const user = await authenticateRequest(request);
    expect(user).toBeNull();
  });
});
