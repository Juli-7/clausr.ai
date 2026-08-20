import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { POST } from "../packs/route";
import { PUT } from "../packs/[id]/route";
import { GET as listVersions } from "../packs/[id]/versions/route";
import { POST as restoreVersion } from "../packs/[id]/versions/[versionId]/route";
import { createAuthRequest } from "./test-helper";

const PACKS_DIR = process.env.PACKS_DIR ?? path.join(process.cwd(), "packs");
const TEST_PACK_SLUG = "e2e-version-test-pack";

async function createPack(): Promise<string> {
  const req = await createAuthRequest("http://localhost/api/compliance/packs", {
    method: "POST",
    body: JSON.stringify({
      title: "Version Test Pack",
      description: "For versioning tests",
      industries: ["Testing"],
      regulation_ids: ["REG_1"],
      triggers: ["test"],
      documents: [{ type: "doc1", title: "Doc 1", fields: [{ field: "f1", label: "Field 1", type: "text", required: true }] }],
    }),
  });
  const res = await POST(req);
  expect(res.status).toBe(201);
  const { id } = await res.json();
  return id as string;
}

describe("Pack versioning API", () => {
  afterAll(() => {
    const testDir = path.join(PACKS_DIR, TEST_PACK_SLUG);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("bumps version on PUT and archives previous versions", async () => {
    const id = await createPack();

    // Initial version is 1.0.0
    const packPath = path.join(PACKS_DIR, id, "pack.json");
    let packJson = JSON.parse(fs.readFileSync(packPath, "utf-8"));
    expect(packJson.pack.version).toBe("1.0.0");

    // No archived versions yet
    const v0Req = await createAuthRequest(`http://localhost/api/compliance/packs/${id}/versions`);
    const v0Res = await listVersions(v0Req, { params: Promise.resolve({ id }) });
    const v0 = await v0Res.json();
    expect(v0.versions).toEqual([]);

    // First edit → patch bump → 1.0.1
    const put1Req = await createAuthRequest(`http://localhost/api/compliance/packs/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title: "Version Test Pack v2" }),
    });
    const put1Res = await PUT(put1Req, { params: Promise.resolve({ id }) });
    expect(put1Res.status).toBe(200);

    packJson = JSON.parse(fs.readFileSync(packPath, "utf-8"));
    expect(packJson.pack.version).toBe("1.0.1");
    expect(packJson.pack.status).toBe("published");
    expect(packJson.pack.updatedAt).toBeTruthy();

    // 1.0.0 should now be archived
    const v1Req = await createAuthRequest(`http://localhost/api/compliance/packs/${id}/versions`);
    const v1Res = await listVersions(v1Req, { params: Promise.resolve({ id }) });
    const v1 = await v1Res.json();
    expect(v1.versions.length).toBe(1);
    expect(v1.versions[0].version).toBe("1.0.0");

    // Second edit with minor bump → 1.1.0
    const put2Req = await createAuthRequest(`http://localhost/api/compliance/packs/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title: "Version Test Pack v3", bump: "minor" }),
    });
    const put2Res = await PUT(put2Req, { params: Promise.resolve({ id }) });
    expect(put2Res.status).toBe(200);

    packJson = JSON.parse(fs.readFileSync(packPath, "utf-8"));
    expect(packJson.pack.version).toBe("1.1.0");

    const v2Req = await createAuthRequest(`http://localhost/api/compliance/packs/${id}/versions`);
    const v2Res = await listVersions(v2Req, { params: Promise.resolve({ id }) });
    const v2 = await v2Res.json();
    expect(v2.versions.length).toBe(2);

    // Restore 1.0.0 → current version becomes 1.0.0
    const v100 = v2.versions.find((x: { version: string }) => x.version === "1.0.0");
    expect(v100).toBeTruthy();
    const restoreReq = await createAuthRequest(`http://localhost/api/compliance/packs/${id}/versions/${v100.id}`, { method: "POST" });
    const restoreRes = await restoreVersion(restoreReq, { params: Promise.resolve({ id, versionId: v100.id }) });
    expect(restoreRes.status).toBe(200);

    packJson = JSON.parse(fs.readFileSync(packPath, "utf-8"));
    expect(packJson.pack.version).toBe("1.0.0");

    if (fs.existsSync(path.join(PACKS_DIR, id))) {
      fs.rmSync(path.join(PACKS_DIR, id), { recursive: true, force: true });
    }
  });

  it("rejects invalid bump values", async () => {
    const id = await createPack();

    const putReq = await createAuthRequest(`http://localhost/api/compliance/packs/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title: "X", bump: "weird" }),
    });
    const putRes = await PUT(putReq, { params: Promise.resolve({ id }) });
    expect(putRes.status).toBe(400);

    if (fs.existsSync(path.join(PACKS_DIR, id))) {
      fs.rmSync(path.join(PACKS_DIR, id), { recursive: true, force: true });
    }
  });
});
