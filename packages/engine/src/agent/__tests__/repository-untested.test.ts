import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

const TEST_DB_DIR = path.join(os.tmpdir(), "clausr-repo-test");
const TEST_DB_PATH = path.join(TEST_DB_DIR, "test-repo.db");

beforeAll(() => {
  process.env.DATABASE_PATH = TEST_DB_PATH;
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_PROVIDER = "deepseek";
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
});

afterAll(() => {
  try { fs.rmSync(TEST_DB_DIR, { recursive: true, force: true }); } catch { }
});

import {
  getOrCreateSession,
  addUserMessage,
  addAssistantMessage,
  addAssistantResponse,
  getConversationHistory,
  getResponseCount,
  saveChunks,
  getChunksByIds,
  deleteChunksBySession,
  deleteChunksByFile,
  searchChunksFts5,
  saveSessionSetup,
  loadSessionSetup,
  hasSessionSetup,
  saveContextSnapshot,
  deleteSession,
  saveFileChunks,
  getFileChunks,
  saveSessionFiles,
  getSessionFiles,
  saveLessonOverride,
  getLessonOverrides,
  ensureComplianceSession,
  getComplianceSession,
  setComplianceDocData,
  addComplianceDocField,
  setComplianceComments,
  getComplianceComments,
  clearComplianceAuditResults,
  setComplianceDocumentsFinalized,
  setCompliancePackStates,
  getCompliancePackStates,
  setComplianceAgentResponse,
  addComplianceFile,
  getComplianceFiles,
  removeComplianceFile,
} from "../shared/memory/repository";

function sid(label: string): string {
  return `repo-test-${label}-${Date.now()}`;
}

describe("repository (untested functions)", () => {
  describe("chunk store", () => {
    it("saveChunks stores chunks and returns ids", () => {
      const id = sid("chunks");
      getOrCreateSession(id, "test-skill");
      const ids = saveChunks(id, "file-1", [
        { id: "c1", text: "Chunk one content" },
        { id: "c2", text: "Chunk two content" },
      ]);
      expect(ids).toHaveLength(2);
    });

    it("getChunksByIds retrieves stored chunks", () => {
      const id = sid("getchunks");
      getOrCreateSession(id, "test-skill");
      const ids = saveChunks(id, "file-1", [
        { id: "c1", text: "Get me" },
      ]);
      const chunks = getChunksByIds(ids);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe("Get me");
    });

    it("getChunksByIds returns empty for empty input", () => {
      expect(getChunksByIds([])).toEqual([]);
    });

    it("deleteChunksBySession removes all chunks for a session", () => {
      const id = sid("delchunks");
      getOrCreateSession(id, "test-skill");
      saveChunks(id, "file-1", [{ id: "c1", text: "Delete me" }]);
      deleteChunksBySession(id);
      const chunks = getChunksByIds([`${id}_file-1_0`]);
      expect(chunks).toHaveLength(0);
    });

    it("deleteChunksByFile removes chunks for a specific file", () => {
      const id = sid("delfile");
      getOrCreateSession(id, "test-skill");
      saveChunks(id, "keep-file", [{ id: "c1", text: "Keep" }]);
      saveChunks(id, "delete-file", [{ id: "c2", text: "Delete" }]);
      deleteChunksByFile(id, "delete-file");
      const kept = getChunksByIds([`${id}_keep-file_0`]);
      const deleted = getChunksByIds([`${id}_delete-file_0`]);
      expect(kept).toHaveLength(1);
      expect(deleted).toHaveLength(0);
    });

    it("searchChunksFts5 returns empty when no FTS5 index", () => {
      const id = sid("fts");
      getOrCreateSession(id, "test-skill");
      const results = searchChunksFts5(id, "test query");
      expect(results).toEqual([]);
    });
  });

  describe("messages and responses", () => {
    it("addAssistantMessage stores a message", () => {
      const id = sid("amsg");
      getOrCreateSession(id, "test-skill");
      addAssistantMessage(id, "Hello from assistant");
      const history = getConversationHistory(id);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ role: "assistant", content: "Hello from assistant" });
    });

    it("getConversationHistory returns all messages in order", () => {
      const id = sid("conv");
      getOrCreateSession(id, "test-skill");
      addUserMessage(id, "User msg 1");
      addAssistantMessage(id, "Assistant reply 1");
      addUserMessage(id, "User msg 2");
      const history = getConversationHistory(id);
      expect(history).toHaveLength(3);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("User msg 1");
      expect(history[2].role).toBe("user");
      expect(history[2].content).toBe("User msg 2");
    });

    it("addAssistantResponse and getResponseCount work", () => {
      const id = sid("resp");
      getOrCreateSession(id, "test-skill");
      expect(getResponseCount(id)).toBe(0);
      addAssistantResponse(id, { content: "Response 1", reasoning: "", citations: [], verdict: "PASS", round: 1 });
      expect(getResponseCount(id)).toBe(1);
      addAssistantResponse(id, { content: "Response 2", reasoning: "", citations: [], verdict: "FAIL", round: 2 });
      expect(getResponseCount(id)).toBe(2);
    });
  });

  describe("session setup", () => {
    it("saveSessionSetup and loadSessionSetup round-trip", () => {
      const id = sid("setup");
      getOrCreateSession(id, "test-skill");
      const data = {
        skillName: "test-skill",
        skillmd: "# Test",
        checks: [],
        scripts: [],
        regulationIds: ["R48"],
        steps: [],
        fileRegistry: [],
      };
      saveSessionSetup(id, data);
      const loaded = loadSessionSetup(id);
      expect(loaded).not.toBeNull();
      expect(loaded!.skillName).toBe("test-skill");
      expect(loaded!.regulationIds).toEqual(["R48"]);
    });

    it("hasSessionSetup returns true after setup saved", () => {
      const id = sid("hassetup");
      getOrCreateSession(id, "test-skill");
      expect(hasSessionSetup(id)).toBe(false);
      saveSessionSetup(id, { skillName: "test", skillmd: "# T", checks: [], scripts: [], regulationIds: [], steps: [], fileRegistry: [] });
      expect(hasSessionSetup(id)).toBe(true);
    });

    it("loadSessionSetup returns null for missing session", () => {
      expect(loadSessionSetup("nonexistent")).toBeNull();
    });
  });

  describe("context snapshots", () => {
    it("saveContextSnapshot stores snapshot", () => {
      const id = sid("snap");
      getOrCreateSession(id, "test-skill");
      saveContextSnapshot({
        sessionId: id,
        turnNumber: 1,
        stepNumber: 1,
        stepTitle: "Test step",
        stepType: "llm+tool",
        systemPrompt: "system",
        userMessage: "user",
        contextSummary: "summary",
        skillmd: "# Skill",
        templateJson: null,
        loadedReferences: "[]",
        uploadedFilesJson: "[]",
        stepOutputsJson: "{}",
      });
    });
  });

  describe("deleteSession", () => {
    it("deletes session and all related data", () => {
      const id = sid("del");
      getOrCreateSession(id, "test-skill");
      addUserMessage(id, "test");
      addAssistantMessage(id, "test");
      expect(getConversationHistory(id)).toHaveLength(2);
      deleteSession(id);
      expect(getConversationHistory(id)).toHaveLength(0);
    });
  });

  describe("file chunks", () => {
    it("saveFileChunks and getFileChunks round-trip", () => {
      const id = sid("fc");
      getOrCreateSession(id, "test-skill");
      expect(getFileChunks(id)).toBe("[]");
      saveFileChunks(id, JSON.stringify([{ fileId: "f1", filename: "doc.pdf" }]));
      const result = JSON.parse(getFileChunks(id));
      expect(result).toHaveLength(1);
      expect(result[0].fileId).toBe("f1");
    });
  });

  describe("session files", () => {
    it("saveSessionFiles and getSessionFiles round-trip", () => {
      const id = sid("sf");
      getOrCreateSession(id, "test-skill");
      expect(getSessionFiles(id)).toBe("[]");
      saveSessionFiles(id, JSON.stringify([{ name: "doc.pdf" }]));
      const result = JSON.parse(getSessionFiles(id));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("doc.pdf");
    });
  });

  describe("lesson overrides", () => {
    it("saveLessonOverride and getLessonOverrides round-trip", () => {
      const skillName = `test-skill-${Date.now()}`;
      const id = sid("lo");
      getOrCreateSession(id, skillName);
      saveLessonOverride(skillName, "Lesson 1");
      saveLessonOverride(skillName, "Lesson 2");
      const lessons = getLessonOverrides(skillName);
      expect(lessons).toHaveLength(2);
      expect(lessons[0]).toBe("Lesson 1");
      expect(lessons[1]).toBe("Lesson 2");
    });

    it("getLessonOverrides returns empty for unknown skill", () => {
      expect(getLessonOverrides(`unknown-${Date.now()}`)).toEqual([]);
    });
  });

  describe("compliance session management", () => {
    it("ensureComplianceSession creates initial session state", () => {
      const id = sid("csv");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      const session = getComplianceSession(id);
      expect(session).not.toBeNull();
      expect(session!.step).toBe(1);
      expect(session!.selectedPackIds).toEqual([]);
      expect(session!.auditRunning).toBe(false);
      expect(session!.auditDone).toBe(false);
      expect(session!.documentsFinalized).toBe(false);
    });

    it("setComplianceDocData stores document data", () => {
      const id = sid("docdata");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      setComplianceDocData(id, { manufacturer: { value: "Acme" } });
      const session = getComplianceSession(id);
      expect(session!.docData).toEqual({ manufacturer: { value: "Acme" } });
    });

    it("addComplianceDocField merges a single field", () => {
      const id = sid("addfield");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      setComplianceDocData(id, { manufacturer: { value: "Acme" } });
      addComplianceDocField(id, "model", { value: "XL-2000" });
      const session = getComplianceSession(id);
      expect(session!.docData).toEqual({
        manufacturer: { value: "Acme" },
        model: { value: "XL-2000" },
      });
    });

    it("addComplianceDocField is no-op when session missing", () => {
      addComplianceDocField("nonexistent", "field", { value: "test" });
    });

    it("setCompliancePackStates and getCompliancePackStates round-trip", () => {
      const id = sid("pstates");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      setCompliancePackStates(id, { "pack-a": { state: "ready" } });
      const states = getCompliancePackStates(id);
      expect(states).toEqual({ "pack-a": { state: "ready" } });
    });

    it("getCompliancePackStates returns {} for missing session", () => {
      expect(getCompliancePackStates("nonexistent")).toEqual({});
    });

    it("setComplianceAgentResponse stores per-pack response JSON", () => {
      const id = sid("agentr");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      setComplianceAgentResponse(id, "pack-a", JSON.stringify({ content: "Report" }));
      const session = getComplianceSession(id);
      expect(session!.agentResponses["pack-a"]).toBe(JSON.stringify({ content: "Report" }));
    });

    it("clearComplianceAuditResults resets audit results", () => {
      const id = sid("clearaud");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      clearComplianceAuditResults(id);
      const session = getComplianceSession(id);
      expect(session!.auditResults).toEqual([]);
      expect(session!.auditDone).toBe(false);
    });

    it("setComplianceDocumentsFinalized sets flag", () => {
      const id = sid("docfinal");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      setComplianceDocumentsFinalized(id, true);
      const session = getComplianceSession(id);
      expect(session!.documentsFinalized).toBe(true);
    });

    it("setComplianceComments and getComplianceComments round-trip", () => {
      const id = sid("comments");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      setComplianceComments(id, JSON.stringify(["Looks good"]));
      const comments = getComplianceComments(id);
      expect(JSON.parse(comments)).toEqual(["Looks good"]);
    });

    it("getComplianceComments returns [] for missing session", () => {
      const comments = getComplianceComments("nonexistent");
      expect(comments).toBe("[]");
    });

    it("addComplianceFile merges files by name", () => {
      const id = sid("addfile");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      addComplianceFile(id, { name: "doc.pdf", size: "100", time: "2024-01-01" });
      addComplianceFile(id, { name: "doc.pdf", size: "200", time: "2024-01-02" });
      const files = getComplianceFiles(id);
      expect(files).toHaveLength(1);
      expect(files[0].size).toBe("200");
    });

    it("addComplianceFile is no-op when session missing", () => {
      const prev: unknown[] = [];
      addComplianceFile("nonexistent", { name: "test.pdf", size: "100", time: "2024-01-01" });
    });

    it("removeComplianceFile removes by name", () => {
      const id = sid("rmfile");
      getOrCreateSession(id, "test-skill");
      ensureComplianceSession(id);
      addComplianceFile(id, { name: "keep.pdf", size: "100", time: "2024-01-01" });
      addComplianceFile(id, { name: "remove.pdf", size: "200", time: "2024-01-01" });
      removeComplianceFile(id, "remove.pdf");
      const files = getComplianceFiles(id);
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe("keep.pdf");
    });
  });
});
