import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { AUTH_SCHEMA_SQL } from "../schema";
import { USAGE_SCHEMA_SQL } from "../../usage/schema";
import { AUDIT_SCHEMA_SQL } from "../../audit/schema";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";

describe("auth schema", () => {
  let dbPath: string;
  let db: Database.Database;

  beforeAll(() => {
    dbPath = join(tmpdir(), `test-auth-schema-${Date.now()}.db`);
    db = new Database(dbPath);
  });

  afterAll(() => {
    db.close();
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(`${dbPath}-wal`); } catch {}
    try { unlinkSync(`${dbPath}-shm`); } catch {}
  });

  it("creates all tables without error", () => {
    db.exec(AUTH_SCHEMA_SQL);
    db.exec(USAGE_SCHEMA_SQL);
    db.exec(AUDIT_SCHEMA_SQL);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name).sort();
    expect(names).toContain("users");
    expect(names).toContain("organizations");
    expect(names).toContain("organization_members");
    expect(names).toContain("usage_events");
    expect(names).toContain("audit_log");
  });

  it("enforces unique email on users", () => {
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, platform_role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
    ).run("u1", "test@test.com", "Test", "hash", "operator", Date.now(), Date.now());
    expect(() => {
      db.prepare(
        "INSERT INTO users (id, email, name, password_hash, platform_role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
      ).run("u2", "test@test.com", "Test2", "hash2", "operator", Date.now(), Date.now());
    }).toThrow();
  });

  it("enforces platform_role check constraint", () => {
    expect(() => {
      db.prepare(
        "INSERT INTO users (id, email, name, password_hash, platform_role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
      ).run("u3", "bad@test.com", "Bad", "hash", "invalid_role", Date.now(), Date.now());
    }).toThrow();
  });
});
