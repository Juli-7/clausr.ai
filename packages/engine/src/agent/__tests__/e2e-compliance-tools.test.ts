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

  it("change_step tool transitions step correctly", async () => {
    const sid = validSessionId("step");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    let session = getComplianceSession(sid);
    expect(session!.step).toBe(1);

    await TOOL_DEFS.change_step.execute(sid, { step: 2 });
    session = getComplianceSession(sid);
    expect(session!.step).toBe(2);

    await TOOL_DEFS.change_step.execute(sid, { step: 3 });
    session = getComplianceSession(sid);
    expect(session!.step).toBe(3);
  });

  it("update_doc_field tool saves and retrieves field values", async () => {
    const sid = validSessionId("docfield");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    await TOOL_DEFS.update_doc_field.execute(sid, {
      docType: "declaration-of-conformity",
      field: "manufacturer",
      value: { value: "Acme Corp", sourceCitation: ["S1.c3"] },
    });

    await TOOL_DEFS.update_doc_field.execute(sid, {
      docType: "declaration-of-conformity",
      field: "model",
      value: { value: "XL-2000" },
    });

    const session = getComplianceSession(sid);
    expect(session!.docData["declaration-of-conformity"]!.manufacturer).toEqual({ value: "Acme Corp", sourceCitation: ["S1.c3"] });
    expect(session!.docData["declaration-of-conformity"]!.model).toEqual({ value: "XL-2000" });
  });

  it("batch_update_doc_fields tool writes multiple fields at once", async () => {
    const sid = validSessionId("batch");
    getOrCreateSession(sid, "test-lighting");
    ensureComplianceSession(sid);

    const result = await TOOL_DEFS.batch_update_doc_fields.execute(sid, {
      docType: "test-report",
      fields: {
        temperature: { value: "25C" },
        humidity: { value: "60%" },
        voltage: { value: "230V" },
      },
    });

    expect(result.docData).toBeDefined();
    const docData = (result as { docData: Record<string, Record<string, { value: string }>> }).docData;
    expect(docData["test-report"]!.temperature).toEqual({ value: "25C" });
    expect(docData["test-report"]!.humidity).toEqual({ value: "60%" });
    expect(docData["test-report"]!.voltage).toEqual({ value: "230V" });
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
    addComplianceDocField(sid, "doc", "field1", { value: "val1" });

    const result = await TOOL_DEFS.get_session_state.execute(sid, {});
    expect(result.step).toBe(2);
    expect(result.selectedPackIds).toEqual(["pack-x"]);
    expect(result.docData).toBeDefined();
  });

  it("search_packs tool returns pack results", async () => {
    const result = await TOOL_DEFS.search_packs.execute("session-ignored", { query: "lighting" });
    expect(result).toHaveProperty("packs");
    expect(Array.isArray(result.packs)).toBe(true);
    expect(result).toHaveProperty("regs");
    expect(result).toHaveProperty("inds");
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
    await TOOL_DEFS.change_step.execute(sid, { step: 2 });

    await TOOL_DEFS.batch_update_doc_fields.execute(sid, {
      docType: "declaration-of-conformity",
      fields: {
        manufacturer: { value: "Acme Corp" },
        model: { value: "XL-2000" },
        voltage: { value: "12V" },
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

    await TOOL_DEFS.change_step.execute(sid, { step: 3 });

    const finalSession = getComplianceSession(sid);
    expect(finalSession!.step).toBe(3);
    expect(finalSession!.selectedPackIds).toContain("automotive-lighting");

    expect(buildSession(sid)).toBeDefined();
  });
});
