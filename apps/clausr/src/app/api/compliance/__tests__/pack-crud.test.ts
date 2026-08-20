import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { GET as listPacks, POST } from "../packs/route";
import { GET as getPack, PUT, DELETE } from "../packs/[id]/route";
import { createAuthRequest } from "./test-helper";
import { buildComplianceStepPrompt, getPack as engineGetPack, listPacks as engineListPacks } from "@clausr/engine";
import type { SkillPack } from "@clausr/engine";

const PACKS_DIR = process.env.PACKS_DIR ?? path.join(process.cwd(), "packs");
const TEST_PACK_SLUG = "e2e-test-pack";

describe("POST /api/compliance/packs — pack creation", () => {
  afterAll(() => {
    const testDir = path.join(PACKS_DIR, TEST_PACK_SLUG);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates a pack with valid data", async () => {
    const body = {
      title: "E2E Test Pack",
      description: "A test pack created during e2e testing",
      icon: "🧪",
      methodology: "Automated testing methodology",
      industries: ["Testing", "Automation"],
      regulation_ids: ["TEST_REG_1", "TEST_REG_2"],
      triggers: ["e2e", "testing", "automation"],
      documents: [
        {
          type: "test-declaration",
          title: "Test Declaration of Conformity",
          fields: [
            {
              field: "manufacturerName",
              label: "Manufacturer Name",
              type: "text",
              required: true,
            },
            {
              field: "productDescription",
              label: "Product Description",
              type: "textarea",
              required: true,
            },
            {
              field: "testDate",
              label: "Test Date",
              type: "date",
              required: false,
            },
          ],
        },
        {
          type: "test-technical-file",
          title: "Test Technical File",
          fields: [
            {
              field: "manufacturerName",
              label: "Manufacturer Name",
              type: "text",
              required: true,
            },
            {
              field: "testResults",
              label: "Test Results",
              type: "textarea",
              required: true,
            },
          ],
        },
      ],
      redlines: ["Do not skip validation", "Do not use expired certificates"],
      lessons: ["Always verify test data"],
    };

    const req = await createAuthRequest("http://localhost/api/compliance/packs", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data).toHaveProperty("id");
    expect(data.id).toBe(TEST_PACK_SLUG);
    expect(data).toHaveProperty("title", "E2E Test Pack");

    // Verify files were written to disk
    const packDir = path.join(PACKS_DIR, TEST_PACK_SLUG);
    expect(fs.existsSync(packDir)).toBe(true);
    expect(fs.existsSync(path.join(packDir, "pack.json"))).toBe(true);
    expect(fs.existsSync(path.join(packDir, "SKILL.md"))).toBe(true);

    // Verify pack.json content
    const packJson = JSON.parse(fs.readFileSync(path.join(packDir, "pack.json"), "utf-8"));
    expect(packJson.pack.title).toBe("E2E Test Pack");
    expect(packJson.documents).toHaveLength(2);
    expect(packJson.documents[0].fields).toHaveLength(3);
    expect(packJson.redlines).toHaveLength(2);
  });

  it("rejects pack without title", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs", {
      method: "POST",
      body: JSON.stringify({ description: "no title", documents: [{ type: "x", title: "X", fields: [{ field: "a", label: "A", type: "text", required: true }] }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("title");
  });

  it("rejects pack without documents", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs", {
      method: "POST",
      body: JSON.stringify({ title: "No Docs Pack", description: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("document");
  });

  it("rejects pack without auth", async () => {
    const req = new NextRequest("http://localhost/api/compliance/packs", {
      method: "POST",
      body: JSON.stringify({ title: "x", description: "x", documents: [{ type: "x", title: "X", fields: [{ field: "a", label: "A", type: "text", required: true }] }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/compliance/packs — returns pack data", () => {
  it("returns packs with top-level fields and document string refs", async () => {
    const pack = engineGetPack("eu-mdr") as SkillPack;
    expect(pack).toBeDefined();
    expect(pack.fields.length).toBeGreaterThan(0);
    expect(pack.documents.length).toBeGreaterThan(0);

    // Fields are at top level
    const fieldIds = pack.fields.map(f => f.id);
    expect(fieldIds).toContain("manufacturerName");

    // Documents reference fields by string ID
    for (const doc of pack.documents) {
      for (const fieldId of doc.fields) {
        expect(fieldIds).toContain(fieldId);
      }
    }
  });

  it("returns 404 for non-existent pack", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs/non-existent");
    const res = await getPack(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });
});

describe("buildComplianceStepPrompt — flat-field prompt", () => {
  it("groups required fields by pack", () => {
    const packs: SkillPack[] = [
      {
        id: "test-pack",
        title: "Test Pack",
        desc: "",
        regs: [],
        inds: [],
        icon: "",
        version: "",
        fields: [
          { id: "manufacturerName", label: "Manufacturer Name", type: "text", required: true },
          { id: "productId", label: "Product ID", type: "text", required: true },
          { id: "testResults", label: "Test Results", type: "text", required: true },
        ],
        documents: [
          { type: "test-declaration", title: "Test Declaration", fields: ["manufacturerName", "productId"] },
          { type: "test-technical", title: "Test Technical File", fields: ["manufacturerName", "testResults"] },
        ],
        checks: [],
        redlines: [],
        lessons: [],
      },
    ];

    const prompt = buildComplianceStepPrompt(2, packs);

    expect(prompt).toContain("Test Pack");
    expect(prompt).toContain("Manufacturer Name");
    expect(prompt).toContain("Product ID");
    expect(prompt).toContain("Test Results");
  });

  it("includes session state when provided", () => {
    const prompt = buildComplianceStepPrompt(2, [], {
      step: 2,
      selectedPackIds: ["pack-1"],
      filledFieldCount: 3,
      totalRequiredFields: 5,
      validationScore: 60,
      uploadedFileCount: 2,
    });

    expect(prompt).toContain("Current Session State");
    expect(prompt).toContain("3/5");
    expect(prompt).toContain("60%");
    expect(prompt).toContain("2");
  });
});

describe("PUT /api/compliance/packs — update pack", () => {
  afterAll(() => {
    const testDir = path.join(PACKS_DIR, TEST_PACK_SLUG);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("updates an existing pack", async () => {
    // First create
    const createReq = await createAuthRequest("http://localhost/api/compliance/packs", {
      method: "POST",
      body: JSON.stringify({
        title: "Update Test Pack",
        description: "Will be updated",
        industries: ["Testing"],
        regulation_ids: ["REG_1"],
        triggers: ["test"],
        documents: [{ type: "doc1", title: "Doc 1", fields: [{ field: "f1", label: "Field 1", type: "text", required: true }] }],
      }),
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    const { id } = await createRes.json();

    // Then update
    const updateReq = await createAuthRequest(`http://localhost/api/compliance/packs/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title: "Updated Title", icon: "🔬" }),
    });
    const updateRes = await PUT(updateReq, { params: Promise.resolve({ id }) });
    expect(updateRes.status).toBe(200);

    const testDir = path.join(PACKS_DIR, id);
    const packPath = path.join(testDir, "pack.json");
    expect(fs.existsSync(packPath)).toBe(true);
    const packJson = JSON.parse(fs.readFileSync(packPath, "utf-8"));
    expect(packJson.pack.title).toBe("Updated Title");
    expect(packJson.pack.icon).toBe("🔬");

    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });
});

describe("DELETE /api/compliance/packs — delete pack", () => {
  it("deletes an existing pack", async () => {
    // Create
    const createReq = await createAuthRequest("http://localhost/api/compliance/packs", {
      method: "POST",
      body: JSON.stringify({
        title: "Delete Test Pack",
        description: "Will be deleted",
        industries: ["Testing"],
        regulation_ids: ["REG_1"],
        triggers: ["test"],
        documents: [{ type: "doc1", title: "Doc 1", fields: [{ field: "f1", label: "Field 1", type: "text", required: true }] }],
      }),
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    const { id } = await createRes.json();

    // Delete
    const deleteReq = await createAuthRequest(`http://localhost/api/compliance/packs/${id}`, { method: "DELETE" });
    const deleteRes = await DELETE(deleteReq, { params: Promise.resolve({ id }) });
    expect(deleteRes.status).toBe(200);

    const testDir = path.join(PACKS_DIR, id);
    expect(fs.existsSync(testDir)).toBe(false);
  });

  it("returns 404 for non-existent pack", async () => {
    const req = await createAuthRequest("http://localhost/api/compliance/packs/non-existent", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });
});
