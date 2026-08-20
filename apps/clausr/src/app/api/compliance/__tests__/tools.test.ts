import { vi, describe, it, expect, beforeAll } from "vitest";

vi.mock("ai", () => ({
  streamText: vi.fn().mockReturnValue({
    textStream: (async function* () {})(),
    usage: Promise.resolve({ promptTokens: 0, completionTokens: 0 }),
  }),
  tool: vi.fn().mockReturnValue({}),
  wrapLanguageModel: vi.fn().mockReturnValue({}),
}));

import { NextRequest } from "next/server";
import { POST as createSession } from "../session/route";
import { POST as execTool } from "../session/[id]/tool/route";
import { createAuthRequest } from "./test-helper";

describe("Compliance Tools", () => {
  let sessionId: string;

  beforeAll(async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/session", {
      method: "POST",
    });
    const res = await createSession(req);
    const body = await res.json();
    sessionId = body.sessionId;
  });

  it("tool endpoint requires auth", async () => {
    const req = new NextRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "get_session_state", input: {} }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(401);
  });

  it("list_packs returns packs with titles", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "list_packs", input: {} }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("packs");
    expect(Array.isArray(body.packs)).toBe(true);
    if (body.packs.length > 0) {
      expect(body.packs[0]).toHaveProperty("id");
      expect(body.packs[0]).toHaveProperty("title");
    }
  });

  it("read_pack returns pack content", async () => {
    // First get available packs
    const listReq = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      { method: "POST", body: JSON.stringify({ name: "list_packs", input: {} }) }
    );
    const listRes = await execTool(listReq, { params: Promise.resolve({ id: sessionId }) });
    const listBody = await listRes.json();
    const packs = listBody.packs ?? [];

    if (packs.length > 0) {
      const req = await createAuthRequest(
        `http://localhost/api/compliance/session/${sessionId}/tool`,
        {
          method: "POST",
          body: JSON.stringify({ name: "read_pack", input: { packId: packs[0].id } }),
        }
      );
      const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("content");
      expect(typeof body.content).toBe("string");
      expect(body).toHaveProperty("source");
      expect(["pack.json", "SKILL.md"]).toContain(body.source);
    }
  });

  it("set_scope updates selected packs", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "set_scope", input: { packIds: ["eu-mdr", "eu-emc"] } }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedPackIds).toContain("eu-mdr");
    expect(body.selectedPackIds).toContain("eu-emc");
  });

  it("go_to_phase moves between steps", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "go_to_phase", input: { phase: "documents" } }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.step).toBe(2);
  });

  it("batch_update_doc_fields persists document data", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "batch_update_doc_fields",
          input: { fields: { manufacturerName: "Test Corp" } },
        }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.docData.manufacturerName).toBe("Test Corp");
  });

  it("run_validation returns checks and score", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "run_validation", input: {} }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("checks");
    expect(body).toHaveProperty("score");
    expect(Array.isArray(body.checks)).toBe(true);
  });

  it("unknown tool returns error", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "nonexistent_tool", input: {} }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unknown tool");
  });

  describe("setup_pack_audit", () => {
  it("succeeds with scope selected", async () => {
    // Set scope first
    const scopeReq = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      { method: "POST", body: JSON.stringify({ name: "set_scope", input: { packIds: ["eu-mdr", "eu-emc"] } }) }
    );
    await execTool(scopeReq, { params: Promise.resolve({ id: sessionId }) });

    // Call run_validation then prepare_for_audit first
    const valReq = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      { method: "POST", body: JSON.stringify({ name: "run_validation", input: {} }) }
    );
    await execTool(valReq, { params: Promise.resolve({ id: sessionId }) });

    const prepReq = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      { method: "POST", body: JSON.stringify({ name: "prepare_for_audit", input: {} }) }
    );
    const prepRes = await execTool(prepReq, { params: Promise.resolve({ id: sessionId }) });
    expect(prepRes.status).toBe(200);

    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "setup_pack_audit", input: { packId: "eu-mdr" } }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
    expect(body).toHaveProperty("packId");
  });

  it("setup_pack_audit rejects non-existent pack", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "setup_pack_audit", input: { packId: "__nonexistent__" } }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
});
