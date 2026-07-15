import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

const TEST_DB_DIR = path.join(os.tmpdir(), "clausr-e2e-compliance-test");
const TEST_DB_PATH = path.join(TEST_DB_DIR, "test-e2e-compliance.db");

beforeAll(() => {
  process.env.DATABASE_PATH = TEST_DB_PATH;
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_PROVIDER = "deepseek";
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  } catch { }
});

import {
  getOrCreateSession,
  ensureComplianceSession,
  getComplianceSession,
  setComplianceScope,
  setComplianceStep,
  addComplianceDocField,
  addComplianceFile,
  getComplianceFiles,
  setComplianceValidation,
  setComplianceComments,
  getComplianceComments,
  setComplianceAgentResponse,
} from "../shared/memory/repository";
import { TOOL_DEFS } from "../../compliance-tools";
import { buildSession } from "../../compliance-session";
import type { ToolName } from "../../compliance-tools";

function validSessionId(label: string): string {
  return `e2e-comp-${label}-${Date.now()}`;
}

describe("Compliance tools end-to-end with real DB", () => {
  it("set_scope tool writes selected pack IDs", async () => {
    const sid = validSessionId("scope");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    const result = await TOOL_DEFS.set_scope.execute(sid, { packIds: ["pack-a", "pack-b"] });
    expect(result.selectedPackIds).toEqual(["pack-a", "pack-b"]);

    const session = getComplianceSession(sid);
    expect(session).not.toBeNull();
    expect(session!.selectedPackIds).toEqual(["pack-a", "pack-b"]);
  });

  it("go_to_phase tool transitions phase correctly", async () => {
    const sid = validSessionId("phase");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    let session = getComplianceSession(sid);
    expect(session!.step).toBe(1);

    await TOOL_DEFS.go_to_phase.execute(sid, { phase: "documents" });
    session = getComplianceSession(sid);
    expect(session!.step).toBe(2);

    await TOOL_DEFS.go_to_phase.execute(sid, { phase: "audit" });
    session = getComplianceSession(sid);
    expect(session!.step).toBe(3);
  });

  it("update_doc_field tool saves and retrieves field values", async () => {
    const sid = validSessionId("docfield");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    await TOOL_DEFS.update_doc_field.execute(sid, {
      field: "manufacturer",
      value: "Acme Corp",
    });

    await TOOL_DEFS.update_doc_field.execute(sid, {
      field: "model",
      value: "XL-2000",
    });

    const session = getComplianceSession(sid);
    expect(session!.docData["manufacturer"]).toEqual({ value: "Acme Corp" });
    expect(session!.docData["model"]).toEqual({ value: "XL-2000" });
  });

  it("batch_update_doc_fields tool writes multiple fields at once", async () => {
    const sid = validSessionId("batch");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    const result = await TOOL_DEFS.batch_update_doc_fields.execute(sid, {
      fields: {
        temperature: "25C",
        humidity: "60%",
        voltage: "230V",
      },
    });

    expect(result.docData).toBeDefined();
    const docData = (result as { docData: Record<string, { value: string }> }).docData;
    expect(docData["temperature"]).toEqual({ value: "25C" });
    expect(docData["humidity"]).toEqual({ value: "60%" });
    expect(docData["voltage"]).toEqual({ value: "230V" });
  });

  it("attach_file tool stores file metadata", async () => {
    const sid = validSessionId("attach");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    await TOOL_DEFS.attach_file.execute(sid, {
      name: "test-report.pdf",
      size: "1024",
      time: "2024-01-15",
      dataUrl: "data:application/pdf;base64,dGVzdA==",
    });

    const files = getComplianceFiles(sid);
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("test-report.pdf");
  });

  it("run_validation tool checks completeness", async () => {
    const sid = validSessionId("validation");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    const result = await TOOL_DEFS.run_validation.execute(sid, {});
    expect(result).toHaveProperty("checks");
    expect(result).toHaveProperty("score");
    expect(Array.isArray(result.checks)).toBe(true);
  });

  it("get_session_state tool returns full session", async () => {
    const sid = validSessionId("state");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);
    setComplianceScope(sid, ["pack-x"]);
    setComplianceStep(sid, 2);
    addComplianceDocField(sid, "field1", { value: "val1" });

    const result = await TOOL_DEFS.get_session_state.execute(sid, {});
    expect(result.step).toBe(2);
    expect(result.selectedPackIds).toEqual(["pack-x"]);
    expect(result.docData).toBeDefined();
    // questionnaire is undefined when pack IDs don't resolve to real packs
    expect(result.questionnaire).toBeUndefined();
  });

  it("list_packs tool returns packs with titles", async () => {
    const result = await TOOL_DEFS.list_packs.execute("session-ignored", {});
    const packs = result.packs as Array<{ id: string; title: unknown }>;
    expect(Array.isArray(packs)).toBe(true);
    if (packs.length > 0) {
      expect(packs[0]).toHaveProperty("id");
      expect(packs[0]).toHaveProperty("title");
    }
  });

  it("read_pack tool returns pack content", async () => {
    const list = await TOOL_DEFS.list_packs.execute("session-ignored", {});
    const packList = (list.packs as Array<{ id: string }>) ?? [];
    if (packList.length > 0) {
      const result = await TOOL_DEFS.read_pack.execute("session-ignored", { packId: packList[0]!.id });
      expect(result).toHaveProperty("content");
      expect(typeof result.content).toBe("string");
      expect(result).toHaveProperty("source");
      expect(["pack.json", "SKILL.md"]).toContain(result.source);
    }
  });

  it("create_pack tool writes a new pack to disk and makes it discoverable", async () => {
    const testPackId = `e2e-test-pack-${Date.now()}`;
    const result = await TOOL_DEFS.create_pack.execute("session-ignored", {
      id: testPackId,
      title: { en: "E2E Test Pack" },
      description: { en: "Created during test" },
      industries: ["testing"],
      regulation_ids: ["R99"],
      fields: [{ id: "voltage", label: { en: "Voltage (V)" }, type: "number", required: true }],
      documents: [{ type: "test-doc", title: { en: "Test Document" }, fields: ["voltage"] }],
      checks: [{
        id: "voltage_range", field: "voltage", type: "number",
        description: "Voltage must be between 100V and 240V",
        clause: "R99.3.1", constraint: "range(100-240)", sample: "Voltage is 230V, within range.",
      }],
      redlines: ["Do not pass without measurement evidence"],
    });

    expect(result.created).toBe(true);
    expect(result.packId).toBe(testPackId);

    // Verify pack is discoverable via list_packs
    const list = await TOOL_DEFS.list_packs.execute("session-ignored", {});
    const packList = list.packs as Array<{ id: string }>;
    expect(packList.some((p) => p.id === testPackId)).toBe(true);

    // Verify pack content is readable via read_pack
    const content = await TOOL_DEFS.read_pack.execute("session-ignored", { packId: testPackId });
    expect(content).toHaveProperty("content");
    expect(content.source).toBe("pack.json");

    // Cleanup — remove the test pack from disk
    const packsDir = path.join(process.cwd(), "packs");
    try { fs.rmSync(path.join(packsDir, testPackId), { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("suggest_lesson tool saves lesson", async () => {
    const sid = validSessionId("lesson");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    const result = await TOOL_DEFS.suggest_lesson.execute(sid, {
      skillName: "test-lighting",
      text: "LED headlamps must meet R48 thermal requirements",
      sourceCheck: "light_source",
      applyToSkill: false,
    });

    expect(result.saved).toBe(true);
    expect(result.lesson).toContain("light_source");
  });

  it("full multi-tool workflow: scope → docs → validation", async () => {
    const sid = validSessionId("full-workflow");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    await TOOL_DEFS.set_scope.execute(sid, { packIds: ["automotive-lighting"] });
    await TOOL_DEFS.go_to_phase.execute(sid, { phase: "documents" });

    await TOOL_DEFS.batch_update_doc_fields.execute(sid, {
      fields: {
        manufacturer: "Acme Corp",
        model: "XL-2000",
        voltage: "12V",
      },
    });

    await TOOL_DEFS.attach_file.execute(sid, {
      name: "test-sheet.pdf",
      size: "2048",
      time: "2024-06-01",
      dataUrl: "data:application/pdf;base64,dGVzdA==",
    });

    const validationResult = await TOOL_DEFS.run_validation.execute(sid, {});
    expect(validationResult.score).toBeGreaterThanOrEqual(0);
    expect(validationResult.score).toBeLessThanOrEqual(100);

    await TOOL_DEFS.go_to_phase.execute(sid, { phase: "audit" });

    const finalSession = getComplianceSession(sid);
    expect(finalSession!.step).toBe(3);
    expect(finalSession!.selectedPackIds).toContain("automotive-lighting");

    expect(buildSession(sid)).toBeDefined();
  });
});
