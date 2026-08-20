import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

const TEST_DB = join(tmpdir(), `test-audit-${process.pid}.db`);

import { closeAuthDb, getAuthDb } from "../../auth/db";
import { logAuditEvent, queryAuditLog } from "../service";

function cleanup() {
  closeAuthDb();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
}

describe("audit service", () => {
  beforeAll(() => {
    process.env.AUTH_DB_PATH = TEST_DB;
  });

  afterAll(() => {
    cleanup();
  });

  afterEach(() => {
    const db = getAuthDb();
    db.exec("DELETE FROM audit_log");
  });

  it("logs an audit event", () => {
    logAuditEvent({
      tenantId: "tenant-1",
      userId: "user-1",
      userEmail: "admin@test.com",
      action: "session.setup",
      resourceType: "skill",
      resourceId: "gdpr",
      metadata: { sessionId: "session-abc" },
    });

    const events = queryAuditLog({});
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("session.setup");
    expect(events[0]!.userEmail).toBe("admin@test.com");
    expect(events[0]!.resourceId).toBe("gdpr");
    expect(events[0]!.metadata.sessionId).toBe("session-abc");
  });

  it("filters by tenant", () => {
    logAuditEvent({ tenantId: "t1", userId: "u1", userEmail: "a@t.com", action: "create", resourceType: "org", resourceId: "o1" });
    logAuditEvent({ tenantId: "t2", userId: "u2", userEmail: "b@t.com", action: "delete", resourceType: "org", resourceId: "o2" });

    const t1Events = queryAuditLog({ tenantId: "t1" });
    expect(t1Events).toHaveLength(1);
    expect(t1Events[0]!.tenantId).toBe("t1");
  });

  it("filters by action", () => {
    logAuditEvent({ tenantId: "t1", userId: "u1", userEmail: "a@t.com", action: "session.setup", resourceType: "skill", resourceId: "s1" });
    logAuditEvent({ tenantId: "t1", userId: "u1", userEmail: "a@t.com", action: "evolution.save", resourceType: "lesson", resourceId: "l1" });

    const setupEvents = queryAuditLog({ action: "session.setup" });
    expect(setupEvents).toHaveLength(1);
    expect(setupEvents[0]!.action).toBe("session.setup");
  });

  it("filters by date range", () => {
    const now = Date.now();
    logAuditEvent({ tenantId: "t1", userId: "u1", userEmail: "a@t.com", action: "session.setup", resourceType: "skill", resourceId: "s1" });

    const filtered = queryAuditLog({ from: now - 1000, to: now + 1000 });
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array when no events match", () => {
    const events = queryAuditLog({ tenantId: "nonexistent" });
    expect(events).toHaveLength(0);
  });
});
