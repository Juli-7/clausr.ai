import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getPack } from "../packs/[id]/route";
import { createAuthRequest } from "./test-helper";

describe("GET /api/compliance/packs/[id]", () => {
  it("returns 401 without auth", async () => {
    const req = new NextRequest("http://localhost/api/compliance/packs/eu-mdr");
    const res = await getPack(req, { params: Promise.resolve({ id: "eu-mdr" }) });
    expect(res.status).toBe(401);
  });

  it("returns pack detail by id", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs/eu-mdr");
    const res = await getPack(req, { params: Promise.resolve({ id: "eu-mdr" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("eu-mdr");
    expect(body.checks.length).toBeGreaterThanOrEqual(1);
    expect(body.documents.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for unknown pack", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs/nonexistent");
    const res = await getPack(req, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
  });
});
