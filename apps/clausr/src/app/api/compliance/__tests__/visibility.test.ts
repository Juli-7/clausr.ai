import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { GET as listPacks, POST as createPack } from "../packs/route";
import { GET as getPack, PUT as updatePack } from "../packs/[id]/route";
import { createAuthRequest, createAuthRequestWithToken, seedUser } from "./test-helper";

const PACKS_DIR = process.env.PACKS_DIR ?? path.join(process.cwd(), "packs");

function packJsonPath(packId: string) {
  return path.join(PACKS_DIR, packId, "pack.json");
}

function getPackVisibilityField(packId: string): { visibility?: string; visibleToOrgIds?: string[] } {
  try {
    const raw = JSON.parse(fs.readFileSync(packJsonPath(packId), "utf-8"));
    return { visibility: raw?.pack?.visibility, visibleToOrgIds: raw?.pack?.visibleToOrgIds };
  } catch {
    return {};
  }
}

function setPackVisibilityField(packId: string, visibility: string, visibleToOrgIds?: string[]) {
  const p = packJsonPath(packId);
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  raw.pack = raw.pack ?? {};
  raw.pack.visibility = visibility;
  if (visibleToOrgIds !== undefined) {
    raw.pack.visibleToOrgIds = visibleToOrgIds;
  } else {
    delete raw.pack.visibleToOrgIds;
  }
  fs.writeFileSync(p, JSON.stringify(raw, null, 2), "utf-8");
}

// Track packs we create so we can clean up
const testPacks: string[] = [];

const MARKETPLACE_PACK = "eu-md-doc";
const CUSTOM_PACK_ID = "visibility-test-pack";

describe("Pack visibility — canReadPack logic", () => {
  let superToken: string;
  let normalUserToken: string;
  let orgUserToken: string;
  let orgId: string;
  let otherOrgUserToken: string;
  let otherOrgId: string;

  beforeAll(async () => {
    const suffix = Date.now().toString(36);

    // Get superadmin token
    const req = await createAuthRequest("http://localhost/api/compliance/packs");
    superToken = req.headers.get("Cookie")?.replace("session=", "") ?? "";

    // Seed a normal user (no org)
    const normal = await seedUser({ email: `normal-${suffix}@test.ai`, name: "Normal" });
    normalUserToken = normal.token;

    // Seed a user in an org
    const orgUser = await seedUser({
      email: `orguser-${suffix}@test.ai`,
      name: "Org User",
      org: { name: `Test Org A ${suffix}`, slug: `test-org-a-${suffix}`, role: "expert" },
    });
    orgUserToken = orgUser.token;
    orgId = orgUser.org!.id;

    // Seed a user in a different org
    const otherUser = await seedUser({
      email: `otheruser-${suffix}@test.ai`,
      name: "Other Org User",
      org: { name: `Other Org B ${suffix}`, slug: `other-org-b-${suffix}`, role: "tester" },
    });
    otherOrgUserToken = otherUser.token;
    otherOrgId = otherUser.org!.id;

    // Create a test pack so we can modify its visibility
    const createReq = await createAuthRequest("http://localhost/api/compliance/packs", {
      method: "POST",
      body: JSON.stringify({
        title: "Visibility Test Pack",
        description: "Pack for testing visibility rules",
        industries: ["Testing"],
        regulation_ids: ["TEST_REG"],
        triggers: ["visibility-test"],
        documents: [{ type: "vis-doc", title: "Vis Doc", fields: [{ field: "f1", label: "F1", type: "text", required: true }] }],
      }),
    });
    const createRes = await createPack(createReq);
    expect(createRes.status).toBe(201);
    const { id } = await createRes.json();
    expect(id).toBe(CUSTOM_PACK_ID);
    testPacks.push(CUSTOM_PACK_ID);
  });

  afterAll(() => {
    for (const pid of testPacks) {
      const dir = path.join(PACKS_DIR, pid);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Superadmin — sees everything
  // ─────────────────────────────────────────────────────────────────────
  it("superadmin sees all packs including author-only and org-only", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "author");
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", superToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.packs.map((p: any) => p.id);
    expect(ids).toContain(CUSTOM_PACK_ID);
    expect(ids).toContain(MARKETPLACE_PACK);
  });

  it("superadmin can get any pack detail", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "author");
    const req = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`, superToken
    );
    const res = await getPack(req, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CUSTOM_PACK_ID);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Regular user (no org) — marketplace only, not author-only
  // ─────────────────────────────────────────────────────────────────────
  it("regular user sees marketplace packs", async () => {
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", normalUserToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.packs.map((p: any) => p.id);
    expect(ids).toContain(MARKETPLACE_PACK);
  });

  it("regular user does not see author-only packs", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "author");
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", normalUserToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.packs.map((p: any) => p.id);
    expect(ids).not.toContain(CUSTOM_PACK_ID);
  });

  it("regular user gets 404 (not 403) for author-only pack detail", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "author");
    const req = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`, normalUserToken
    );
    const res = await getPack(req, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(404);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Org-visibility — only members of targeted orgs can see
  // ─────────────────────────────────────────────────────────────────────
  it("org-visibility pack is visible to user in targeted org", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId]);
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", orgUserToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.packs.map((p: any) => p.id);
    expect(ids).toContain(CUSTOM_PACK_ID);
  });

  it("org-visibility pack detail is accessible to user in targeted org", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId]);
    const req = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`, orgUserToken
    );
    const res = await getPack(req, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CUSTOM_PACK_ID);
  });

  it("org-visibility pack is hidden from user in non-targeted org", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId]);
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", otherOrgUserToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.packs.map((p: any) => p.id);
    expect(ids).not.toContain(CUSTOM_PACK_ID);
  });

  it("org-visibility pack detail returns 404 for user in non-targeted org", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId]);
    const req = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`, otherOrgUserToken
    );
    const res = await getPack(req, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(404);
  });

  it("org-visibility pack with empty visibleToOrgIds is hidden from normal user", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", []);
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", normalUserToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.packs.map((p: any) => p.id);
    expect(ids).not.toContain(CUSTOM_PACK_ID);
  });

  it("org-visibility pack visibleToOrgIds is returned in GET detail", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId, otherOrgId]);
    const req = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`, superToken
    );
    const res = await getPack(req, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visibility).toBe("org");
    expect(body.visibleToOrgIds).toEqual(expect.arrayContaining([orgId, otherOrgId]));
  });

  // ─────────────────────────────────────────────────────────────────────
  // Marketplace + org packs — regular user sees both
  // ─────────────────────────────────────────────────────────────────────
  it("regular user sees marketplace packs but not org-only packs (without membership)", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId]);
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", normalUserToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.packs.map((p: any) => p.id);
    expect(ids).toContain(MARKETPLACE_PACK);
    expect(ids).not.toContain(CUSTOM_PACK_ID);
  });

  // ─────────────────────────────────────────────────────────────────────
  // PUT visibleToOrgIds
  // ─────────────────────────────────────────────────────────────────────
  it("updates visibleToOrgIds via PUT", async () => {
    const putReq = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`,
      superToken,
      {
        method: "PUT",
        body: JSON.stringify({ visibleToOrgIds: [otherOrgId] }),
      }
    );
    const res = await updatePack(putReq, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(200);

    const { visibleToOrgIds } = getPackVisibilityField(CUSTOM_PACK_ID);
    expect(visibleToOrgIds).toEqual([otherOrgId]);
  });

  it("rejects visibleToOrgIds with non-array value", async () => {
    const putReq = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`,
      superToken,
      {
        method: "PUT",
        body: JSON.stringify({ visibleToOrgIds: "not-an-array" }),
      }
    );
    const res = await updatePack(putReq, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(400);
  });

  it("rejects visibleToOrgIds with non-string elements", async () => {
    const putReq = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`,
      superToken,
      {
        method: "PUT",
        body: JSON.stringify({ visibleToOrgIds: [123, true] }),
      }
    );
    const res = await updatePack(putReq, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(400);
  });

  it("clears visibleToOrgIds when switching visibility to author", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId]);

    const putReq = createAuthRequestWithToken(
      `http://localhost/api/compliance/packs/${CUSTOM_PACK_ID}`,
      superToken,
      {
        method: "PUT",
        body: JSON.stringify({ visibility: "author", visibleToOrgIds: [] }),
      }
    );
    const res = await updatePack(putReq, { params: Promise.resolve({ id: CUSTOM_PACK_ID }) });
    expect(res.status).toBe(200);

    const { visibility, visibleToOrgIds } = getPackVisibilityField(CUSTOM_PACK_ID);
    expect(visibility).toBe("author");
    expect(visibleToOrgIds).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Response includes visibility fields
  // ─────────────────────────────────────────────────────────────────────
  it("packs list response includes visibility and visibleToOrgIds for superadmin", async () => {
    setPackVisibilityField(CUSTOM_PACK_ID, "org", [orgId]);
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", superToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const pack = body.packs.find((p: any) => p.id === CUSTOM_PACK_ID);
    expect(pack).toBeDefined();
    expect(pack.visibility).toBe("org");
    expect(pack.visibleToOrgIds).toEqual([orgId]);
  });

  it("packs list includes canEdit flag for author", async () => {
    // The pack was created by superadmin (admin@clausr.ai)
    const req = createAuthRequestWithToken("http://localhost/api/compliance/packs", superToken);
    const res = await listPacks(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const pack of body.packs) {
      expect(pack).toHaveProperty("canEdit");
    }
  });
});
