import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as createSession } from "../session/route";
import { GET as getSession } from "../session/[id]/route";
import { createAuthRequest } from "./test-helper";

describe("Compliance Session Lifecycle", () => {
  let sessionId: string;

  it("POST creates new session", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/session", {
      method: "POST",
    });
    const res = await createSession(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sessionId");
    expect(body.step).toBe(1);
    sessionId = body.sessionId;
  });

  it("GET returns session state", async () => {
    const req = await createAuthRequest(`http://localhost/api/compliance/session/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(sessionId);
    expect(body.step).toBe(1);
    expect(body.selectedPackIds).toEqual([]);
    expect(body.auditRunning).toBe(false);
    expect(body.auditDone).toBe(false);
  });

  it("returns 401 without auth", async () => {
    const req = new NextRequest("http://localhost/api/compliance/session", { method: "POST" });
    const res = await createSession(req);
    expect(res.status).toBe(401);
  });
});
