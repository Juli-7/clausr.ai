import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

const TEST_DB = join(tmpdir(), `test-usage-${process.pid}.db`);

import { closeAuthDb, getAuthDb } from "../../auth/db";
import {
  recordUsage,
  getUsageByTenant,
  getUsageSummary,
  getUsagePerUser,
  getUserUsage,
  getAllUsage,
} from "../service";

function cleanup() {
  closeAuthDb();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
}

describe("usage service", () => {
  beforeAll(() => {
    process.env.AUTH_DB_PATH = TEST_DB;
  });

  afterAll(() => {
    cleanup();
  });

  afterEach(() => {
    const db = getAuthDb();
    db.exec("DELETE FROM usage_events");
  });

  it("records a usage event", () => {
    recordUsage({
      tenantId: "tenant-1",
      userId: "user-1",
      sessionId: "session-1",
      eventType: "llm_tokens",
      quantity: 100,
      unit: "tokens",
      cost: 0.002,
    });

    const events = getUsageByTenant("tenant-1");
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("llm_tokens");
    expect(events[0]!.quantity).toBe(100);
    expect(events[0]!.cost).toBe(0.002);
  });

  it("returns empty array for tenant with no usage", () => {
    const events = getUsageByTenant("nonexistent");
    expect(events).toHaveLength(0);
  });

  it("returns usage summary with totals", () => {
    recordUsage({ tenantId: "t1", userId: "u1", sessionId: "s1", eventType: "llm_tokens", quantity: 100, cost: 0.002 });
    recordUsage({ tenantId: "t1", userId: "u1", sessionId: "s1", eventType: "llm_tokens", quantity: 200, cost: 0.004 });
    recordUsage({ tenantId: "t1", userId: "u1", sessionId: "s2", eventType: "llm_tokens", quantity: 50, cost: 0.001 });

    const summary = getUsageSummary("t1");
    expect(summary.totalCost).toBeCloseTo(0.007);
    expect(summary.totalSessions).toBe(2);
    expect(summary.byType).toHaveLength(1);
    expect(summary.byType[0]!.quantity).toBe(350);
  });

  it("returns usage per user", () => {
    recordUsage({ tenantId: "t2", userId: "u1", sessionId: "s1", eventType: "llm_tokens", quantity: 100, cost: 0.002 });
    recordUsage({ tenantId: "t2", userId: "u2", sessionId: "s2", eventType: "llm_tokens", quantity: 50, cost: 0.001 });

    const perUser = getUsagePerUser("t2");
    expect(perUser).toHaveLength(2);
    expect(perUser.find((u) => u.userId === "u1")!.totalQuantity).toBe(100);
    expect(perUser.find((u) => u.userId === "u2")!.totalQuantity).toBe(50);
  });

  it("returns user-scoped usage", () => {
    recordUsage({ tenantId: "t3", userId: "u1", sessionId: "s1", eventType: "llm_tokens", quantity: 100, cost: 0.002 });
    recordUsage({ tenantId: "t3", userId: "u2", sessionId: "s2", eventType: "llm_tokens", quantity: 50, cost: 0.001 });

    const userUsage = getUserUsage("u1");
    expect(userUsage.totalQuantity).toBe(100);
    expect(userUsage.totalSessions).toBe(1);
  });

  it("returns all usage grouped by tenant", () => {
    recordUsage({ tenantId: "all-t1", userId: "u1", sessionId: "s1", eventType: "llm_tokens", quantity: 100, cost: 0.002 });
    recordUsage({ tenantId: "all-t2", userId: "u2", sessionId: "s2", eventType: "llm_tokens", quantity: 50, cost: 0.001 });

    const all = getAllUsage();
    expect(all.find((t) => t.tenantId === "all-t1")!.totalCost).toBeCloseTo(0.002);
    expect(all.find((t) => t.tenantId === "all-t2")!.totalCost).toBeCloseTo(0.001);
  });

  it("filters by date range", () => {
    const now = Date.now();
    recordUsage({ tenantId: "range-t1", userId: "u1", sessionId: "s1", eventType: "llm_tokens", quantity: 100, cost: 0.002 });

    const filtered = getUsageByTenant("range-t1", { from: now - 1000, to: now + 1000 });
    expect(filtered).toHaveLength(1);
  });
});
