import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../packs/route";
import { createAuthRequest } from "./test-helper";

describe("GET /api/compliance/packs", () => {
  it("returns 401 without auth", async () => {
    const req = new NextRequest("http://localhost/api/compliance/packs");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with packs list", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("packs");
    expect(body).toHaveProperty("regs");
    expect(body).toHaveProperty("inds");
    expect(Array.isArray(body.packs)).toBe(true);
    expect(body.packs.length).toBeGreaterThanOrEqual(1);
  });

  it("returns pack with required fields", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs");
    const res = await GET(req);
    const body = await res.json();
    const pack = body.packs[0];
    expect(pack).toHaveProperty("id");
    expect(pack).toHaveProperty("title");
    expect(pack).toHaveProperty("desc");
    expect(pack).toHaveProperty("checks");
    expect(pack).toHaveProperty("documents");
  });

  it("filters by query param", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs?q=medical");
    const res = await GET(req);
    const body = await res.json();
    expect(body.packs.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by regulation", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs?reg=MDR");
    const res = await GET(req);
    const body = await res.json();
    for (const p of body.packs) {
      expect(p.regs.some((r: string) => r.includes("MDR"))).toBe(true);
    }
  });

  it("filters by industry", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs?industry=Medical");
    const res = await GET(req);
    const body = await res.json();
    for (const p of body.packs) {
      expect(p.inds.some((i: string) => i.includes("Medical"))).toBe(true);
    }
  });
});
