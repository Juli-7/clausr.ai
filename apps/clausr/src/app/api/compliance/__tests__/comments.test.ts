import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { POST as createSession } from "../session/route";
import { PATCH as saveComments } from "../session/[id]/comments/route";
import { createAuthRequest } from "./test-helper";

describe("PATCH /api/compliance/session/[id]/comments", () => {
  let sessionId: string;

  beforeAll(async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/session", {
      method: "POST",
    });
    const res = await createSession(req);
    const body = await res.json();
    sessionId = body.sessionId;
  });

  it("returns 401 without auth", async () => {
    const req = new NextRequest(
      `http://localhost/api/compliance/session/${sessionId}/comments`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: [{ packId: "eu-mdr", text: "ok" }] }),
      }
    );
    const res = await saveComments(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(401);
  });

  it("saves comments array", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/comments`,
      {
        method: "PATCH",
        body: JSON.stringify({ comments: [{ packId: "eu-mdr", text: "Looks compliant" }] }),
      }
    );
    const res = await saveComments(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("rejects non-array comments", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/comments`,
      {
        method: "PATCH",
        body: JSON.stringify({ comments: "not an array" }),
      }
    );
    const res = await saveComments(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(400);
  });
});
