import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

const TEST_DB_DIR = path.join(os.tmpdir(), "clausr-ctools-test");
const TEST_DB_PATH = path.join(TEST_DB_DIR, "test-ctools.db");

beforeAll(() => {
  process.env.DATABASE_PATH = TEST_DB_PATH;
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_PROVIDER = "deepseek";
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
});

afterAll(() => {
  try { fs.rmSync(TEST_DB_DIR, { recursive: true, force: true }); } catch { }
});

const {
  mockSaveLessonOverride, mockGetLessonOverrides, mockAppendPackLessons,
} = vi.hoisted(() => ({
  mockSaveLessonOverride: vi.fn(),
  mockGetLessonOverrides: vi.fn(),
  mockAppendPackLessons: vi.fn(),
}));

vi.mock("../knowlege/regulation-api", () => ({
  getRegulationApi: vi.fn(),
}));

vi.mock("../shared/memory/repository", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    saveLessonOverride: mockSaveLessonOverride,
    getLessonOverrides: mockGetLessonOverrides,
  };
});

vi.mock("../../compliance-packs", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    appendPackLessons: mockAppendPackLessons,
  };
});

import {
  getOrCreateSession,
  ensureComplianceSession,
  getComplianceSession,
  addComplianceFile,
  getComplianceFiles,
  removeComplianceFile,
  setComplianceValidation,
  setComplianceDocumentsFinalized,
  clearComplianceAuditResults,
} from "../shared/memory/repository";
import { TOOL_DEFS } from "../../compliance-tools";
import { buildSession } from "../../compliance-session";
import type { ToolName } from "../../compliance-tools";

function sid(label: string): string {
  return `ctools-${label}-${Date.now()}`;
}

function setupSession(label: string): string {
  const id = sid(label);
  getOrCreateSession(id, "test-skill");
  ensureComplianceSession(id);
  return id;
}

describe("compliance-tools (untested)", () => {
  describe("detach_file", () => {
    it("removes a previously attached file", async () => {
      const id = setupSession("detach");
      addComplianceFile(id, { name: "doc.pdf", size: "100", time: "2024-01-01" });

      const result = await TOOL_DEFS.detach_file.execute(id, { name: "doc.pdf" });
      expect(result.files).toEqual([]);
      expect(getComplianceFiles(id)).toEqual([]);
    });

    it("returns remaining files after removal", async () => {
      const id = setupSession("detach2");
      addComplianceFile(id, { name: "keep.pdf", size: "100", time: "2024-01-01" });
      addComplianceFile(id, { name: "remove.pdf", size: "200", time: "2024-01-01" });

      const result = await TOOL_DEFS.detach_file.execute(id, { name: "remove.pdf" }) as { files: { name: string }[] };
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({ name: "keep.pdf" });
    });
  });

  describe("export_document", () => {
    it("returns a download URL for the requested doc type", async () => {
      const id = setupSession("export");
      const result = await TOOL_DEFS.export_document.execute(id, { docType: "declaration" });
      expect(result.downloadUrl).toContain(id);
      expect(result.downloadUrl).toContain("declaration");
    });
  });

  describe("get_file_content", () => {
    it("returns error when file not found", async () => {
      const id = setupSession("gfc-none");
      const result = await TOOL_DEFS.get_file_content.execute(id, { fileName: "nonexistent.pdf" });
      expect(result).toHaveProperty("error");
    });

    it("returns error when file not extracted yet", async () => {
      const id = setupSession("gfc-none");
      addComplianceFile(id, { name: "notes.txt", size: "50", time: "2024-01-01" });
      const result = await TOOL_DEFS.get_file_content.execute(id, { fileName: "notes.txt" });
      expect(result).toHaveProperty("error");
    });
  });

  describe("run_validation", () => {
    it("returns 100% score when no packs selected", async () => {
      const id = setupSession("rv-empty");
      const result = await TOOL_DEFS.run_validation.execute(id, {});
      expect(result.score).toBe(100);
      expect(result.total).toBe(0);
    });
  });

  describe("search_files", () => {
    it("returns empty results when no files uploaded", async () => {
      const id = setupSession("sf-empty");
      const result = await TOOL_DEFS.search_files.execute(id, { query: "test" });
      expect(result.results).toEqual([]);
    });
  });

  describe("prepare_for_audit", () => {
    it("returns error when session not found", async () => {
      const result = await TOOL_DEFS.prepare_for_audit.execute("nonexistent", {});
      expect(result).toHaveProperty("error");
    });

    it("returns error when validation not run", async () => {
      const id = setupSession("pfa-novalidate");
      const result = await TOOL_DEFS.prepare_for_audit.execute(id, {});
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("run_validation");
    });

    it("runs with validation passed and no packs selected", async () => {
      const id = setupSession("pfa-ok");
      setComplianceValidation(id, [{ id: "test", title: "Test", status: "pass", note: "" }], 100);
      const result = await TOOL_DEFS.prepare_for_audit.execute(id, {});
      expect(result.ok).toBe(true);
      expect(result.documentsFinalized).toBe(true);
    });
  });

  describe("suggest_lesson", () => {
    it("saves a pending lesson without applyToSkill", async () => {
      const id = setupSession("sl-pending");
      mockGetLessonOverrides.mockReturnValue(["Existing lesson"]);
      const result = await TOOL_DEFS.suggest_lesson.execute(id, {
        skillName: "test-skill",
        text: "Always check mounting height first",
      });
      expect(result.saved).toBe(true);
      expect(result.pendingCount).toBe(1);
      expect(mockSaveLessonOverride).toHaveBeenCalled();
    });

    it("saves a lesson with sourceCheck", async () => {
      const id = setupSession("sl-source");
      const result = await TOOL_DEFS.suggest_lesson.execute(id, {
        skillName: "test-skill",
        text: "LED is preferred",
        sourceCheck: "light_source",
        applyToSkill: false,
      });
      expect(result.saved).toBe(true);
    });
  });

  describe("setup_pack_audit tool wrapper", () => {
    it("rejects with error for nonexistent pack", async () => {
      const id = setupSession("spa");
      await expect(TOOL_DEFS.setup_pack_audit.execute(id, { packId: "__nonexistent__" })).rejects.toThrow("not found");
    });
  });

});
