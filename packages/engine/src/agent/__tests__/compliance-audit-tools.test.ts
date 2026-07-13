import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetCompliancePackStates, mockSetCompliancePackStates,
  mockSetCompliancePackAuditResult, mockSetComplianceAgentResponse,
  mockSetComplianceAuditDone, mockSetComplianceAuditRunning,
  mockGetComplianceSession,
} = vi.hoisted(() => ({
  mockGetCompliancePackStates: vi.fn(),
  mockSetCompliancePackStates: vi.fn(),
  mockSetCompliancePackAuditResult: vi.fn(),
  mockSetComplianceAgentResponse: vi.fn(),
  mockSetComplianceAuditDone: vi.fn(),
  mockSetComplianceAuditRunning: vi.fn(),
  mockGetComplianceSession: vi.fn(),
}));

vi.mock("../shared/memory/repository", () => ({
  getCompliancePackStates: mockGetCompliancePackStates,
  setCompliancePackStates: mockSetCompliancePackStates,
  setCompliancePackAuditResult: mockSetCompliancePackAuditResult,
  setComplianceAgentResponse: mockSetComplianceAgentResponse,
  setComplianceAuditDone: mockSetComplianceAuditDone,
  setComplianceAuditRunning: mockSetComplianceAuditRunning,
  getComplianceSession: mockGetComplianceSession,
}));

const { mockInitSession } = vi.hoisted(() => ({ mockInitSession: vi.fn() }));
vi.mock("../loading/phases/init-phase", () => ({
  initSession: mockInitSession,
}));

const { mockCreatePipelineContext } = vi.hoisted(() => ({ mockCreatePipelineContext: vi.fn() }));
vi.mock("../pipeline/pipeline-context", () => ({
  createPipelineContext: mockCreatePipelineContext,
}));

const { mockGenerateStepsFromChecks } = vi.hoisted(() => ({ mockGenerateStepsFromChecks: vi.fn() }));
vi.mock("../loading/generate-steps", () => ({
  generateStepsFromChecks: mockGenerateStepsFromChecks,
}));

const { mockExecuteLlmToolStep, mockParseLlmOutput } = vi.hoisted(() => ({
  mockExecuteLlmToolStep: vi.fn(),
  mockParseLlmOutput: vi.fn(),
}));
vi.mock("../pipeline/executors/llm-executor", () => ({
  executeLlmToolStep: mockExecuteLlmToolStep,
  parseLlmOutput: mockParseLlmOutput,
}));

const { mockGenerateCorrelationId } = vi.hoisted(() => ({
  mockGenerateCorrelationId: vi.fn(() => "corr-123"),
}));
vi.mock("../pipeline/errors", () => ({
  generateCorrelationId: mockGenerateCorrelationId,
}));

const { mockGetDocStore } = vi.hoisted(() => ({ mockGetDocStore: vi.fn() }));
vi.mock("../user-info/vector-store", () => ({
  getDocStore: mockGetDocStore,
}));

const { mockLogPipeline } = vi.hoisted(() => ({ mockLogPipeline: vi.fn() }));
vi.mock("../pipeline/logger", () => ({
  logPipeline: mockLogPipeline,
}));

import {
  setupPackAudit,
  runPendingChecks,
  retryCheck,
  getPackAuditState,
  finalizeAudit,
  resolveCitation,
} from "../../compliance-audit-tools";

function makeSampleCheck(field: string, dependsOn?: string) {
  return {
    field,
    type: { kind: "string" as const },
    description: `Check ${field}`,
    clause: `R48.${field}`,
    attention: field,
    sample: `Sample ${field}`,
    dependsOn,
  };
}

describe("compliance-audit-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("setupPackAudit", () => {
    it("sets up pack state with checks and steps", async () => {
      const checks = [makeSampleCheck("mounting_height"), makeSampleCheck("light_source")];
      const steps = checks.map((c, i) => ({ number: i + 1, title: c.field, instructions: c.description, type: "llm+tool" }));

      mockInitSession.mockResolvedValue({
        skill: { name: "test-skill", checks, scripts: [], regulationIds: ["R48"], skillmd: "# Skill", description: "", triggers: [] },
        isAutoSkill: false,
      });
      mockGenerateStepsFromChecks.mockReturnValue(steps);
      mockGetCompliancePackStates.mockReturnValue({});

      const result = await setupPackAudit("session-1", "test-pack");

      expect(result.ok).toBe(true);
      expect(result.packId).toBe("test-pack");
      expect(result.checks).toHaveLength(2);
      expect(result.checks[0]!.id).toBe("mounting_height");
      expect(result.checks[1]!.id).toBe("light_source");

      expect(mockSetCompliancePackStates).toHaveBeenCalled();
      const setCall = mockSetCompliancePackStates.mock.calls[0];
      expect(setCall[0]).toBe("session-1");
      const state = setCall[1]["test-pack"];
      expect(state.state).toBe("ready");
      expect(state.checkStates["mounting_height"]).toMatchObject({ state: "pending", depDepth: 1, stepNumber: 1 });
    });

    it("computes dependency depths", async () => {
      const checks = [
        makeSampleCheck("mounting_height"),
        makeSampleCheck("light_source", "mounting_height"),
      ];
      const steps = checks.map((c, i) => ({ number: i + 1, title: c.field, instructions: c.description, type: "llm+tool" }));

      mockInitSession.mockResolvedValue({
        skill: { name: "test-skill", checks, scripts: [], regulationIds: ["R48"], skillmd: "# Skill", description: "", triggers: [] },
        isAutoSkill: false,
      });
      mockGenerateStepsFromChecks.mockReturnValue(steps);
      mockGetCompliancePackStates.mockReturnValue({});

      await setupPackAudit("session-1", "test-pack");

      const state = mockSetCompliancePackStates.mock.calls[0][1]["test-pack"];
      expect(state.checkStates["mounting_height"].depDepth).toBe(1);
      expect(state.checkStates["light_source"].depDepth).toBe(2);
    });
  });

  describe("runPendingChecks", () => {
    it("throws error when pack not set up", async () => {
      mockGetCompliancePackStates.mockReturnValue({});
      await expect(runPendingChecks("session-1", "nonexistent-pack")).rejects.toThrow("not set up");
    });

    it("marks dependent as failed when dependency failed", async () => {
      const checkStates: Record<string, { state: string; depDepth: number; dependsOn: string[]; title: string; stepNumber: number; error?: string }> = {
        mounting_height: { state: "failed", depDepth: 1, dependsOn: [], title: "Mounting height", stepNumber: 1, error: "Something failed" },
        light_source: { state: "pending", depDepth: 2, dependsOn: ["mounting_height"], title: "Light source", stepNumber: 2 },
      };
      mockGetCompliancePackStates.mockReturnValue({
        "test-pack": { state: "ready", setup: { checks: [], steps: [] }, checkStates },
      });

      const result = await runPendingChecks("session-1", "test-pack");
      expect(result.allDone).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
      expect(checkStates["light_source"].state).toBe("failed");
    });

    it("returns allDone when all checks are done or failed", async () => {
      const checkStates = {
        mounting_height: { state: "done", depDepth: 1, dependsOn: [], title: "Mounting height", stepNumber: 1, result: { verdict: "PASS", reasoning: "ok", finding: "ok" } },
        light_source: { state: "failed", depDepth: 1, dependsOn: [], title: "Light source", stepNumber: 2, error: "Failed" },
      };
      mockGetCompliancePackStates.mockReturnValue({
        "test-pack": { state: "ready", setup: { checks: [], steps: [] }, checkStates },
      });

      const result = await runPendingChecks("session-1", "test-pack");
      expect(result.allDone).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it("runs ready checks at the correct dependency depth", async () => {
      const checks = [makeSampleCheck("mounting_height"), makeSampleCheck("light_source")];
      const steps = checks.map((c, i) => ({ number: i + 1, title: c.field, instructions: c.description, type: "llm+tool" }));
      const checkStates = {
        mounting_height: { state: "pending", depDepth: 1, dependsOn: [], title: "Mounting height", stepNumber: 1 },
        light_source: { state: "pending", depDepth: 1, dependsOn: [], title: "Light source", stepNumber: 2 },
      };

      mockGetCompliancePackStates.mockReturnValue({
        "test-pack": { state: "ready", setup: { checks, steps, skillName: "test", skillmd: "" }, checkStates },
      });
      mockCreatePipelineContext.mockReturnValue({
        files: { loadFiles: vi.fn() },
        skill: { checks: [] },
        steps: { write: vi.fn() },
        checks: { addResults: vi.fn() },
        palette: { getCitationPalette: () => [] },
      });
      mockGetDocStore.mockReturnValue({ getFiles: vi.fn().mockResolvedValue([]) });
      mockExecuteLlmToolStep.mockResolvedValue({
        success: true,
        streamedTokens: ['{"value":"OK","verdict":"PASS","sourceCitation":[],"citationRef":[]}'],
        toolResults: [],
      });

      const result = await runPendingChecks("session-1", "test-pack");
      expect(result.completed).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockExecuteLlmToolStep).toHaveBeenCalledTimes(2);
    });

    it("captures step execution errors", async () => {
      const checks = [makeSampleCheck("mounting_height")];
      const steps = [{ number: 1, title: "Mounting height", instructions: "Check", type: "llm+tool" }];
      const checkStates = {
        mounting_height: { state: "pending", depDepth: 1, dependsOn: [], title: "Mounting height", stepNumber: 1 },
      };

      mockGetCompliancePackStates.mockReturnValue({
        "test-pack": { state: "ready", setup: { checks, steps, skillName: "test", skillmd: "" }, checkStates },
      });
      mockCreatePipelineContext.mockReturnValue({
        files: { loadFiles: vi.fn() },
        skill: { checks: [] },
        steps: { write: vi.fn() },
        checks: { addResults: vi.fn() },
        palette: { getCitationPalette: () => [] },
      });
      mockGetDocStore.mockReturnValue({ getFiles: vi.fn().mockResolvedValue([]) });
      mockExecuteLlmToolStep.mockResolvedValue({
        success: false,
        error: "Step failed",
      });

      const result = await runPendingChecks("session-1", "test-pack");
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe("retryCheck", () => {
    it("resets the check and transitive dependents", async () => {
      const checkStates: Record<string, { state: string; depDepth: number; dependsOn: string[]; title: string; stepNumber: number; result?: { verdict: string }; error?: string }> = {
        mounting_height: { state: "done", depDepth: 1, dependsOn: [], title: "Mounting height", stepNumber: 1, result: { verdict: "PASS" } },
        light_source: { state: "done", depDepth: 2, dependsOn: ["mounting_height"], title: "Light source", stepNumber: 2, result: { verdict: "PASS" } },
        colour_temp: { state: "done", depDepth: 1, dependsOn: [], title: "Colour temp", stepNumber: 3, result: { verdict: "PASS" } },
      };

      mockGetCompliancePackStates.mockReturnValue({
        "test-pack": { state: "done", checkStates },
      });
      mockGetComplianceSession.mockReturnValue({});

      await retryCheck("session-1", "test-pack", "mounting_height");

      expect(checkStates["mounting_height"].state).toBe("pending");
      expect(checkStates["light_source"].state).toBe("pending");
      expect(checkStates["colour_temp"].state).toBe("done");
      expect(mockSetCompliancePackStates).toHaveBeenCalled();
    });

    it("returns reset check IDs", async () => {
      const checkStates: Record<string, { state: string; depDepth: number; dependsOn: string[]; title: string; stepNumber: number; result?: { verdict: string } }> = {
        mounting_height: { state: "done", depDepth: 1, dependsOn: [], title: "Mounting height", stepNumber: 1, result: { verdict: "PASS" } },
        light_source: { state: "done", depDepth: 2, dependsOn: ["mounting_height"], title: "Light source", stepNumber: 2, result: { verdict: "PASS" } },
      };

      mockGetCompliancePackStates.mockReturnValue({
        "test-pack": { state: "done", checkStates },
      });
      mockGetComplianceSession.mockReturnValue({});

      const result = await retryCheck("session-1", "test-pack", "mounting_height");
      expect(result.resetChecks).toEqual(["mounting_height", "light_source"]);
      expect(result.packState).toBe("ready");
    });

    it("throws for unknown pack", async () => {
      mockGetCompliancePackStates.mockReturnValue({});
      await expect(retryCheck("session-1", "unknown-pack", "check-1")).rejects.toThrow("not found");
    });
  });

  describe("getPackAuditState", () => {
    it("returns null for unknown pack", () => {
      mockGetCompliancePackStates.mockReturnValue({});
      expect(getPackAuditState("session-1", "unknown")).toBeNull();
    });

    it("returns state and checks", () => {
      mockGetCompliancePackStates.mockReturnValue({
        "test-pack": {
          state: "running",
          checkStates: {
            check_1: { state: "done", depDepth: 1, title: "Check 1", result: { verdict: "PASS", reasoning: "ok" } },
            check_2: { state: "pending", depDepth: 1, title: "Check 2" },
          },
        },
      });

      const result = getPackAuditState("session-1", "test-pack");
      expect(result!.packState).toBe("running");
      expect(result!.checks["check_1"]).toMatchObject({ state: "done", title: "Check 1" });
      expect(result!.checks["check_2"]).toMatchObject({ state: "pending" });
    });
  });

  describe("finalizeAudit", () => {
    it("finalizes all packs and sets audit done", async () => {
      mockGetCompliancePackStates.mockReturnValue({
        "pack-a": {
          state: "done",
          checkStates: {
            check_1: { state: "done", depDepth: 1, dependsOn: [], title: "Check 1", stepNumber: 1, result: { verdict: "PASS", reasoning: "ok", finding: "ok", sourceCitation: [], citationRef: [] } },
          },
        },
      });

      const result = await finalizeAudit("session-1");
      expect(result.auditDone).toBe(true);
      expect(result.packCount).toBe(1);
      expect(mockSetComplianceAuditDone).toHaveBeenCalledWith("session-1", true);
      expect(mockSetComplianceAuditRunning).toHaveBeenCalledWith("session-1", false);
    });
  });

  describe("resolveCitation", () => {
    it("returns null for invalid ref format", async () => {
      const result = await resolveCitation("session-1", "invalid");
      expect(result).toBeNull();
    });

    it("returns null when file not found", async () => {
      mockGetDocStore.mockReturnValue({ getFiles: vi.fn().mockResolvedValue([]) });
      const result = await resolveCitation("session-1", "S1.c3");
      expect(result).toBeNull();
    });

    it("returns null when store throws", async () => {
      mockGetDocStore.mockReturnValue({ getFiles: vi.fn().mockRejectedValue(new Error("db error")) });
      const result = await resolveCitation("session-1", "S1.c3");
      expect(result).toBeNull();
    });

    it("returns citation data for valid ref", async () => {
      mockGetDocStore.mockReturnValue({
        getFiles: vi.fn().mockResolvedValue([{
          fileId: "file-1",
          filename: "doc.pdf",
          pageCount: 5,
          chunks: [
            { id: "chunk-0", text: "Chunk zero text" },
            { id: "chunk-1", text: "Chunk one text" },
            { id: "chunk-2", text: "Chunk two text" },
          ],
        }]),
      });

      const result = await resolveCitation("session-1", "S1.c3");
      expect(result).not.toBeNull();
      expect(result!.ref).toBe("S1.c3");
      expect(result!.fileId).toBe("file-1");
      expect(result!.filename).toBe("doc.pdf");
      expect(result!.extractedText).toBe("Chunk two text");
      expect(result!.keyExcerpt).toBe("Chunk two text");
      expect(result!.chunks).toHaveLength(1);
      expect(result!.chunks![0].id).toBe("chunk-2");
    });

    it("handles multi-file sessions with correct file index", async () => {
      mockGetDocStore.mockReturnValue({
        getFiles: vi.fn().mockResolvedValue([
          { fileId: "file-1", filename: "first.pdf", chunks: [{ id: "c0", text: "First file" }] },
          { fileId: "file-2", filename: "second.pdf", chunks: [{ id: "c0", text: "Target text" }] },
        ]),
      });

      const result = await resolveCitation("session-1", "S2.c1");
      expect(result).not.toBeNull();
      expect(result!.filename).toBe("second.pdf");
      expect(result!.extractedText).toBe("Target text");
    });
  });
});
