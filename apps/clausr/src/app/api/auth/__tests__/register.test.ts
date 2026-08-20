import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../register/route";
import { getAuthDb, getUserByPhone, getOrgBySlug, getOrgConfig } from "@clausr/platform-core";

const ORIGIN = "https://app.raipple.com";

function makeRequest(phone: string, code: string) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ phone, code }),
  });
}

describe("POST /api/auth/register", () => {
  const testPhone = "13800001111";

  afterAll(() => {
    // Clean up test user and org
    const db = getAuthDb();
    const user = getUserByPhone(testPhone);
    if (user) {
      db.prepare("DELETE FROM organization_members WHERE user_id = ?").run(user.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    }
    const org = getOrgBySlug(`trial-13800001111`);
    if (org) {
      db.prepare("DELETE FROM organizations WHERE id = ?").run(org.id);
    }
  });

  it("registers a phone user with phone as name (fallback when no name provided)", async () => {
    const res = await POST(makeRequest(testPhone, "123456"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.name).toBe(testPhone);
    expect(body.user.platformRole).toBe("operator");
  });

  it("creates a trial org named with the phone number", async () => {
    const org = getOrgBySlug(`trial-13800001111`);
    expect(org).not.toBeNull();
    expect(org!.name).toBe(`Trial ${testPhone}`);
  });

  it("sets 20 RMB usage limit and defaults to 0.025 token price", async () => {
    const org = getOrgBySlug(`trial-13800001111`);
    expect(org).not.toBeNull();
    const config = getOrgConfig(org!.id);
    expect(config.usageLimit).toBe(20);
    expect(config.usageLimitPeriod).toBe("total");
  });

  it("rejects missing phone", async () => {
    const res = await POST(makeRequest("", "123456"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Phone");
  });

  it("rejects missing code", async () => {
    const res = await POST(makeRequest("13900002222", ""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Phone");
  });

  it("rejects duplicate phone", async () => {
    const res = await POST(makeRequest(testPhone, "123456"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already registered");
  });
});
