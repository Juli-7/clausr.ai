import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { POST as createSession } from "../session/route";
import { POST as createShareLink, DELETE as revokeShareLink, getShareToken, resolveShareToken } from "../session/[id]/share-link/route";
import { createAuthRequest } from "./test-helper";

const SHARE_DIR = path.join(process.cwd(), "data", "audit-share-links");

describe("Audit share links", () => {
  let sessionId: string;

  afterAll(() => {
    try {
      if (sessionId) {
        const dir = SHARE_DIR;
        for (const f of fs.readdirSync(dir)) {
          if (f.includes(sessionId) || f.startsWith("share-link")) {
            fs.rmSync(path.join(dir, f), { force: true });
          }
        }
      }
    } catch { }
  });

  it("creates, resolves and revokes a share link", async () => {
    // Create a session (owner = admin)
    const createReq = await createAuthRequest("http://localhost/api/compliance/session", { method: "POST" });
    const createRes = await createSession(createReq);
    expect(createRes.status).toBe(200);
    sessionId = (await createRes.json()).sessionId as string;

    // Create share link
    const linkReq = await createAuthRequest(`http://localhost/api/compliance/session/${sessionId}/share-link`, { method: "POST" });
    const linkRes = await createShareLink(linkReq, { params: Promise.resolve({ id: sessionId }) });
    expect(linkRes.status).toBe(200);
    const link = await linkRes.json();
    expect(link.token).toBeTruthy();
    expect(link.url).toBe(`/share/${link.token}`);

    // Token is retrievable
    expect(getShareToken(sessionId)).toBe(link.token);

    // Token resolves back to the session
    const resolved = resolveShareToken(link.token);
    expect(resolved?.sessionId).toBe(sessionId);

    // Creating again returns the same token
    const linkReq2 = await createAuthRequest(`http://localhost/api/compliance/session/${sessionId}/share-link`, { method: "POST" });
    const linkRes2 = await createShareLink(linkReq2, { params: Promise.resolve({ id: sessionId }) });
    const link2 = await linkRes2.json();
    expect(link2.token).toBe(link.token);

    // Revoke
    const revokeReq = await createAuthRequest(`http://localhost/api/compliance/session/${sessionId}/share-link`, { method: "DELETE" });
    const revokeRes = await revokeShareLink(revokeReq, { params: Promise.resolve({ id: sessionId }) });
    expect(revokeRes.status).toBe(200);
    expect(getShareToken(sessionId)).toBeNull();
    expect(resolveShareToken(link.token)).toBeNull();
  });

  it("returns 401 without auth", async () => {
    const req = new NextRequest("http://localhost/api/compliance/session/some-id/share-link", { method: "POST" });
    const res = await createShareLink(req, { params: Promise.resolve({ id: "some-id" }) });
    expect(res.status).toBe(401);
  });
});
