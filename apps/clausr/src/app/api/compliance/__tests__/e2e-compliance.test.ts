import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { POST as createSession } from "../session/route";
import { GET as getSession } from "../session/[id]/route";
import { GET as listPacks } from "../packs/route";
import { GET as getPack } from "../packs/[id]/route";
import { POST as execTool } from "../session/[id]/tool/route";
import { GET as exportDoc } from "../session/[id]/export/[docType]/route";
import { PATCH as saveComments } from "../session/[id]/comments/route";
import { createAuthRequest } from "./test-helper";

describe("Full Compliance E2E Workflow", () => {
  let sessionId: string;
  let packId: string;

  // ─── Step 0: Create session ────────────────────────────────────────
  it("creates a new compliance session", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/session", {
      method: "POST",
    });
    const res = await createSession(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeTruthy();
    expect(body.step).toBe(1);
    sessionId = body.sessionId;
  });

  it("rejects session creation without auth", async () => {
    const req = new NextRequest("http://localhost/api/compliance/session", { method: "POST" });
    const res = await createSession(req);
    expect(res.status).toBe(401);
  });

  // ─── Step 1: Browse & Select Packs ─────────────────────────────────
  it("lists available compliance packs", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs");
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packs.length).toBeGreaterThanOrEqual(1);
    packId = body.packs[0].id;
  });

  it("filters packs by query", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs?q=mdr");
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packs.length).toBeGreaterThanOrEqual(1);
  });

  it("filters packs by regulation", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs?reg=MDR");
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const p of body.packs) {
      expect(p.regs.some((r: string) => r.includes("MDR"))).toBe(true);
    }
  });

  it("retrieves pack detail by id", async () => {
    const req = await createAuthRequest(`http://localhost/api/compliance/packs/${packId}`);
    const res = await getPack(req, { params: Promise.resolve({ id: packId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(packId);
    expect(body.checks.length).toBeGreaterThanOrEqual(1);
    expect(body.documents.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for unknown pack", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs/nonexistent");
    const res = await getPack(req, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("rejects packs list without auth", async () => {
    const req = new NextRequest("http://localhost/api/compliance/packs");
    const res = await listPacks(req);
    expect(res.status).toBe(401);
  });

  // ─── Step 1: Set Scope ─────────────────────────────────────────────
  it("sets scope via set_scope tool", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "set_scope", input: { packIds: [packId] } }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedPackIds).toContain(packId);
  });

  it("verifies scope persisted in session state", async () => {
    const req = await createAuthRequest(`http://localhost/api/compliance/session/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selectedPackIds).toContain(packId);
    expect(body.step).toBe(1);
  });

  // ─── Step 2: Document Preparation ──────────────────────────────────
  it("advances to step 2 (documents)", async () => {
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

  it("fills a document field via batch_update_doc_fields tool", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "batch_update_doc_fields",
          input: { fields: { manufacturerName: "E2E Test Corp" } },
        }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.docData.manufacturerName).toBe("E2E Test Corp");
  });

  it("verifies doc data persisted in session state", async () => {
    const req = await createAuthRequest(`http://localhost/api/compliance/session/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.docData.manufacturerName).toBe("E2E Test Corp");
  });

  it("runs validation and returns checks with score", async () => {
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
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
  });

  // ─── Step 3: Audit ─────────────────────────────────────────────────
  it("advances to step 3 (audit)", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "go_to_phase", input: { phase: "audit" } }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.step).toBe(3);
  });

  it("calls prepare_for_audit (required before start_audit)", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "prepare_for_audit", input: {} }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.documentsFinalized).toBe(true);
    expect(Array.isArray(body.generatedFiles)).toBe(true);
  });

  it("sets up pack audit skeleton", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        body: JSON.stringify({ name: "setup_pack_audit", input: { packId } }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("packId", packId);
    expect(body).toHaveProperty("checks");
    expect(Array.isArray(body.checks)).toBe(true);
  });

  // ─── Export ─────────────────────────────────────────────────────────
  it("exports document as docx", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/export/mdr-declaration`
    );
    const res = await exportDoc(req, { params: Promise.resolve({ id: sessionId, docType: "mdr-declaration" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  // ─── Comments ───────────────────────────────────────────────────────
  it("saves and retrieves comments", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/comments`,
      {
        method: "PATCH",
        body: JSON.stringify({ comments: [{ packId, text: "E2E test comment" }] }),
      }
    );
    const res = await saveComments(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ─── Final session state ────────────────────────────────────────────
  it("final session state reflects full workflow", async () => {
    const req = await createAuthRequest(`http://localhost/api/compliance/session/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.step).toBe(3);
    expect(body.selectedPackIds).toContain(packId);
    expect(body.docData.manufacturerName).toBe("E2E Test Corp");
  });

  // ─── Auth guards ────────────────────────────────────────────────────
  it("rejects session retrieval without auth", async () => {
    const req = new NextRequest(`http://localhost/api/compliance/session/${sessionId}`);
    const res = await getSession(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(401);
  });

  it("rejects tool execution without auth", async () => {
    const req = new NextRequest(
      `http://localhost/api/compliance/session/${sessionId}/tool`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "list_packs", input: {} }),
      }
    );
    const res = await execTool(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(401);
  });

  it("rejects unknown tool", async () => {
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

  it("rejects export without auth", async () => {
    const req = new NextRequest(
      `http://localhost/api/compliance/session/${sessionId}/export/mdr-declaration`
    );
    const res = await exportDoc(req, { params: Promise.resolve({ id: sessionId, docType: "mdr-declaration" }) });
    expect(res.status).toBe(401);
  });

  it("rejects comments without auth", async () => {
    const req = new NextRequest(
      `http://localhost/api/compliance/session/${sessionId}/comments`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: [{ packId, text: "test" }] }),
      }
    );
    const res = await saveComments(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent session", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/session/nonexistent");
    const res = await getSession(req, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("rejects comments with non-array payload", async () => {
    const req = await createAuthRequest(
      `http://localhost/api/compliance/session/${sessionId}/comments`,
      {
        method: "PATCH",
        body: JSON.stringify({ comments: "invalid-string" }),
      }
    );
    const res = await saveComments(req, { params: Promise.resolve({ id: sessionId }) });
    expect(res.status).toBe(400);
  });
});
