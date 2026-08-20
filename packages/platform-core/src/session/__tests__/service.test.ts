import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

const TEST_DB = join(tmpdir(), `test-session-service-${process.pid}.db`);

import { closeAuthDb, getAuthDb } from "../../auth/db";
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  toggleStar,
  toggleShare,
  updateSessionName,
  updateSessionSummary,
  pruneUnnamedSessions,
} from "../service";

function cleanup() {
  closeAuthDb();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
}

describe("session service", () => {
  beforeAll(() => {
    process.env.AUTH_DB_PATH = TEST_DB;
  });

  afterAll(() => {
    cleanup();
  });

  beforeEach(() => {
    const db = getAuthDb();
    db.exec("DELETE FROM sessions");
  });

  it("creates a session", () => {
    const s = createSession("sess-1", "tenant-1", "user-1", "alice@test.com", "My Session");
    expect(s.id).toBe("sess-1");
    expect(s.tenantId).toBe("tenant-1");
    expect(s.userId).toBe("user-1");
    expect(s.userEmail).toBe("alice@test.com");
    expect(s.name).toBe("My Session");
    expect(s.starred).toBe(false);
    expect(s.shared).toBe(false);
    expect(s.createdAt).toBeGreaterThan(0);
  });

  it("creates session with default name", () => {
    const s = createSession("sess-2", "tenant-1", "user-1", "alice@test.com");
    expect(s.name).toBe("");
  });

  it("getSession returns session by id", () => {
    createSession("sess-3", "tenant-1", "user-1", "alice@test.com", "Test");
    const s = getSession("sess-3");
    expect(s).not.toBeNull();
    expect(s!.name).toBe("Test");
  });

  it("getSession returns null for missing id", () => {
    expect(getSession("nonexistent")).toBeNull();
  });

  it("listSessions returns all sessions without filters", () => {
    createSession("s1", "t1", "u1", "a@t.com", "A");
    createSession("s2", "t2", "u2", "b@t.com", "B");
    const all = listSessions();
    expect(all).toHaveLength(2);
  });

  it("listSessions filters by tenant", () => {
    createSession("s1", "t1", "u1", "a@t.com", "A");
    createSession("s2", "t2", "u1", "b@t.com", "B");
    const filtered = listSessions("t1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe("s1");
  });

  it("listSessions filters by tenant and user, includes shared", () => {
    createSession("s1", "t1", "u1", "a@t.com", "Private");
    createSession("s2", "t1", "u2", "b@t.com", "Shared",);
    createSession("s3", "t1", "u2", "b@t.com", "Shared-Starred");
    toggleShare("s2", true);
    toggleShare("s3", true);
    toggleStar("s3", true);

    const result = listSessions("t1", "u1");
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.id).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("listSessions includes owner's own session after sharing it", () => {
    createSession("s-own", "t1", "u1", "a@t.com", "My Session");
    toggleShare("s-own", true);

    const result = listSessions("t1", "u1");
    expect(result.find((s) => s.id === "s-own")).toBeTruthy();
  });

  it("listSessions orders by created_at DESC", () => {
    const old = createSession("old", "t1", "u1", "a@t.com", "Old");
    const mid = createSession("mid", "t1", "u1", "a@t.com", "Mid");
    const recent = createSession("recent", "t1", "u1", "a@t.com", "Recent");

    const all = listSessions("t1", "u1");
    expect(all[0]!.id).toBe("recent");
    expect(all[1]!.id).toBe("mid");
    expect(all[2]!.id).toBe("old");
  });

  it("updateSessionName updates name", () => {
    createSession("s1", "t1", "u1", "a@t.com", "Old Name");
    updateSessionName("s1", "New Name");
    expect(getSession("s1")!.name).toBe("New Name");
  });

  it("deleteSession removes session", () => {
    createSession("s1", "t1", "u1", "a@t.com");
    deleteSession("s1");
    expect(getSession("s1")).toBeNull();
  });

  it("toggleStar sets starred flag", () => {
    createSession("s1", "t1", "u1", "a@t.com");
    toggleStar("s1", true);
    expect(getSession("s1")!.starred).toBe(true);
    toggleStar("s1", false);
    expect(getSession("s1")!.starred).toBe(false);
  });

  it("toggleShare sets shared flag", () => {
    createSession("s1", "t1", "u1", "a@t.com");
    toggleShare("s1", true);
    expect(getSession("s1")!.shared).toBe(true);
    toggleShare("s1", false);
    expect(getSession("s1")!.shared).toBe(false);
  });

  describe("summary_data", () => {
    it("createSession sets initial summary_data", () => {
      const s = createSession("ss1", "t1", "u1", "a@t.com", "Test");
      expect(s.summaryData).toEqual({ step: 1, selectedPackIds: [], uploadedFileCount: 0, docCompleteness: [], auditPerPack: [], auditDone: false });
    });

    it("getSession returns summary_data", () => {
      createSession("ss2", "t1", "u1", "a@t.com", "Test");
      const s = getSession("ss2");
      expect(s!.summaryData).toEqual({ step: 1, selectedPackIds: [], uploadedFileCount: 0, docCompleteness: [], auditPerPack: [], auditDone: false });
    });

    it("listSessions returns summary_data", () => {
      createSession("ss3", "t1", "u1", "a@t.com", "Test");
      const rows = listSessions("t1", "u1");
      expect(rows[0]!.summaryData).toEqual({ step: 1, selectedPackIds: [], uploadedFileCount: 0, docCompleteness: [], auditPerPack: [], auditDone: false });
    });

    it("updateSessionSummary updates summary_data", () => {
      createSession("ss4", "t1", "u1", "a@t.com", "Test");
      updateSessionSummary("ss4", { step: 3, selectedPackIds: ["eu-md-doc"], uploadedFileCount: 2, docCompleteness: [], auditPerPack: [], auditDone: false });
      const s = getSession("ss4");
      expect(s!.summaryData).toEqual({ step: 3, selectedPackIds: ["eu-md-doc"], uploadedFileCount: 2, docCompleteness: [], auditPerPack: [], auditDone: false });
    });

    it("updateSessionSummary partial update overwrites entire field", () => {
      createSession("ss5", "t1", "u1", "a@t.com", "Test");
      updateSessionSummary("ss5", { step: 2, selectedPackIds: [], uploadedFileCount: 0, docCompleteness: [], auditPerPack: [], auditDone: false });
      const s = getSession("ss5");
      expect(s!.summaryData!.step).toBe(2);
    });
  });

  describe("pruneUnnamedSessions", () => {
    it("prunes sessions with empty name", () => {
      const db = getAuthDb();
      db.prepare(
        "INSERT INTO sessions (id, tenant_id, user_id, user_email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("s-unnamed", "t1", "u1", "a@t.com", "", 1);
      const ids = pruneUnnamedSessions();
      expect(ids).toContain("s-unnamed");
      expect(getSession("s-unnamed")).toBeNull();
    });

    it("prunes sessions with empty name (bypassing createSession)", () => {
      const db = getAuthDb();
      db.prepare(
        "INSERT INTO sessions (id, tenant_id, user_id, user_email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("s-empty", "t1", "u1", "a@t.com", "", 1);
      const ids = pruneUnnamedSessions();
      expect(ids).toContain("s-empty");
    });

    it("does not prune named sessions", () => {
      createSession("s-named", "t1", "u1", "a@t.com", "My Session");
      const ids = pruneUnnamedSessions();
      expect(ids).not.toContain("s-named");
      expect(getSession("s-named")).not.toBeNull();
    });

    it("returns empty array when no unnamed sessions exist", () => {
      createSession("s1", "t1", "u1", "a@t.com", "A");
      createSession("s2", "t1", "u2", "b@t.com", "B");
      const ids = pruneUnnamedSessions();
      expect(ids).toEqual([]);
    });

    it("returns all pruned session ids", () => {
      const db = getAuthDb();
      db.prepare(
        "INSERT INTO sessions (id, tenant_id, user_id, user_email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("u1", "t1", "u1", "a@t.com", "", 1);
      db.prepare(
        "INSERT INTO sessions (id, tenant_id, user_id, user_email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("u2", "t2", "u2", "b@t.com", "", 2);
      db.prepare(
        "INSERT INTO sessions (id, tenant_id, user_id, user_email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("u3", "t1", "u1", "a@t.com", "", 3);
      const ids = pruneUnnamedSessions();
      expect(ids.sort()).toEqual(["u1", "u2", "u3"]);
    });

    it("respects minAge — keeps recent unnamed sessions", () => {
      createSession("recent-un", "t1", "u1", "a@t.com");
      const ids = pruneUnnamedSessions(86400000);
      expect(ids).not.toContain("recent-un");
      expect(getSession("recent-un")).not.toBeNull();
    });
  });
});
