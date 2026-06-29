import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((config: { execute: (...args: unknown[]) => unknown; description: string }) => ({
    type: "function",
    function: { execute: config.execute },
    execute: config.execute,
    description: config.description,
  })),
}));

import { streamText } from "ai";
import {
  restoreContext,
  createPipelineContext,
} from "../pipeline/pipeline-context";
import type { PipelineContext } from "../pipeline/pipeline-context";
import { finalizePhase } from "../present/phases/finalize-phase";
import {
  saveSessionSetup,
  loadSessionSetup,
  hasSessionSetup,
  getOrCreateSession,
} from "../shared/memory/repository";
import { parseChecks } from "../loading/skill/check-parser";
import { generateStepsFromChecks } from "../loading/generate-steps";
import { identifyRevisionTargets } from "../pipeline/revision-phase";
import { executeLlmToolStep } from "../pipeline/executors/llm-executor";
import { executeComplianceCheck } from "../pipeline/builtins";
import { buildSystemPrompt, buildUserMessage } from "../pipeline/prompts";
import type { ExecutableStep } from "../pipeline/types";

const TEST_DB_DIR = path.join(os.tmpdir(), "clausr-pipeline-test");
const TEST_DB_PATH = path.join(TEST_DB_DIR, "test-agent.db");

const LIGHTING_SKILL_MD = `---
name: test-lighting
description: Test lighting skill
regulation_ids:
  - R48
---

## Checks

### mounting_height
1. **type**: number(0-2000)
2. **attention**: headlamp mounting height
3. **description**: Headlamp mounting height in mm from ground
4. **clause**: R48.6.2
5. **constraint**: range(500-1200)
6. **depends_on**: (none)
7. **sample**: The mounting height is 650 mm [S1.c3].

### light_source
1. **type**: enum(led, halogen, xenon)
2. **attention**: light source type
3. **description**: Type of light source
4. **clause**: R48.6.1
5. **depends_on**: (none)
6. **sample**: The vehicle uses LED headlamps [S1.c1].

### colour_temperature
1. **type**: number(3000-8000)
2. **attention**: colour temperature
3. **description**: Colour temperature in Kelvin
4. **clause**: R112.5.5
5. **constraint**: <= 6000
6. **depends_on**: (none)
7. **sample**: The colour temperature is 5000 K [S1.c4].
`;

const TEST_CHECKS = parseChecks(LIGHTING_SKILL_MD);
const TEST_STEPS = generateStepsFromChecks(TEST_CHECKS, ["R48", "R112"]);

function validTestSessionId(label: string): string {
  return `pipeline-test-${label}-${Date.now()}`;
}

beforeAll(() => {
  process.env.DATABASE_PATH = TEST_DB_PATH;
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_PROVIDER = "deepseek";
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  } catch { /* already cleaned */ }
});

// ── Helpers ──

function createPopulatedContext(sessionId: string, correlationId: string): PipelineContext {
  const ctx = createPipelineContext(
    "test-lighting",
    LIGHTING_SKILL_MD,
    sessionId,
    correlationId,
    TEST_CHECKS,
    [],
    ["R48", "R112"],
  );

  ctx.checks.addResults([
    {
      name: "mounting_height",
      type: "numerical",
      finding: "Mounting height is 650 mm",
      verdict: "PASS",
      citationRef: ["R48.6.2"],
      sourceCitation: ["S1.c3"],
    },
    {
      name: "light_source",
      type: "qualitative",
      finding: "LED headlamps",
      verdict: "PASS",
      citationRef: ["R48.6.1"],
      sourceCitation: ["S1.c1"],
    },
    {
      name: "colour_temperature",
      type: "numerical",
      finding: "Colour temperature is 5000 K",
      verdict: "PASS",
      citationRef: ["R112.5.5"],
      sourceCitation: ["S1.c4"],
    },
  ]);

  ctx.palette.loadCitationPalette([
    { id: "R48.6.1", regulation: "R48", clause: "6.1", text: "§6.1 Light source requirements" },
    { id: "R48.6.2", regulation: "R48", clause: "6.2", text: "§6.2 Mounting height minimum 500mm" },
    { id: "R112.5.5", regulation: "R112", clause: "5.5", text: "§5.5 Colour temperature not more than 6000K" },
  ]);

  ctx.steps.write(1, {
    mounting_height: {
      value: "Mounting height is 650 mm [S1.c3]",
      sourceCitation: ["S1.c3"],
      citationRef: ["R48.6.2"],
      verdict: "PASS",
    },
  });
  ctx.steps.write(2, {
    light_source: {
      value: "LED headlamps [S1.c1]",
      sourceCitation: ["S1.c1"],
      citationRef: ["R48.6.1"],
      verdict: "PASS",
    },
  });
  ctx.steps.write(3, {
    colour_temperature: {
      value: "Colour temperature is 5000 K [S1.c4]",
      sourceCitation: ["S1.c4"],
      citationRef: ["R112.5.5"],
      verdict: "PASS",
    },
  });

  ctx.files.addFile({
    fileId: "spec.pdf",
    filename: "spec.pdf",
    extractedText: "LED headlamps. Mounting height 650 mm. Colour temperature 5000 K.",
    chunks: [
      { id: "c1", text: "The vehicle uses LED headlamps." },
      { id: "c3", text: "Mounting height is 650 mm from ground." },
      { id: "c4", text: "Colour temperature measures 5000 K." },
    ],
  });

  return ctx;
}

// ── Tests ──

describe("Pipeline DB round-trip", () => {
  it("saves and loads session setup", () => {
    const sid = validTestSessionId("roundtrip");
    getOrCreateSession(sid, "test-lighting");
    saveSessionSetup(sid, {
      skillName: "test-lighting",
      skillmd: LIGHTING_SKILL_MD,
      checks: TEST_CHECKS,
      scripts: [],
      regulationIds: ["R48", "R112"],
      steps: TEST_STEPS,
      fileRegistry: [],
    });
    expect(hasSessionSetup(sid)).toBe(true);
    const loaded = loadSessionSetup(sid);
    expect(loaded).not.toBeNull();
    expect(loaded!.skillName).toBe("test-lighting");
    expect(loaded!.steps).toHaveLength(3);
    expect(loaded!.checks).toHaveLength(3);
    expect(loaded!.checks[0]!.field).toBe("mounting_height");
    expect(loaded!.regulationIds).toEqual(["R48", "R112"]);
  });

  it("restoreContext deserializes steps and checks", async () => {
    const sid = validTestSessionId("restore");
    getOrCreateSession(sid, "test-lighting");
    saveSessionSetup(sid, {
      skillName: "test-lighting",
      skillmd: LIGHTING_SKILL_MD,
      checks: TEST_CHECKS,
      scripts: [],
      regulationIds: ["R48", "R112"],
      steps: TEST_STEPS,
      fileRegistry: [],
    });
    const restored = await restoreContext(sid, "corr-restore-1");
    expect(restored).not.toBeNull();
    expect(restored!.ctx.skill.name).toBe("test-lighting");
    expect(restored!.ctx.skill.checks).toHaveLength(3);
    expect(restored!.steps).toHaveLength(3);
    expect(restored!.steps[0]!.number).toBe(1);
    expect(restored!.steps[0]!.title).toBe("Evaluate: mounting_height");
    expect(restored!.steps[0]!.type).toBe("llm+tool");
  });

  it("returns null for missing session", async () => {
    const restored = await restoreContext("nonexistent", "corr-missing");
    expect(restored).toBeNull();
  });
});

describe("finalizePhase integration", () => {
  it("produces valid AgentResponse with PASS verdict", async () => {
    const sid = validTestSessionId("finalize");
    getOrCreateSession(sid, "test-lighting");
    const ctx = createPopulatedContext(sid, "corr-finalize-1");
    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );
    const result = await finalizePhase(ctx, TEST_STEPS, sid);
    expect(result.response.content).toBeTruthy();
    expect(result.response.citations).toHaveLength(3);
    expect(result.response.sessionId).toBe(sid);
    expect(result.response.round).toBe(1);
    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence.score).toBeLessThanOrEqual(100);
    expect(result.confidence.needsExpert).toBe(false);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.response.sections).toBeDefined();
  });

  it("sets FAIL verdict when checks fail", async () => {
    const sid = validTestSessionId("finalize-fail");
    getOrCreateSession(sid, "test-lighting");
    const ctx = createPopulatedContext(sid, "corr-finalize-2");
    ctx.checks.addResults([{
      name: "colour_temperature",
      type: "numerical",
      finding: "6500 K exceeds 6000 K limit",
      verdict: "FAIL",
      citationRef: ["R112.5.5"],
      sourceCitation: ["S1.c4"],
    }]);
    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );
    const result = await finalizePhase(ctx, TEST_STEPS, sid);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.response.content).toContain("colour_temperature");
  });

  it("includes findings section with FAIL results", async () => {
    const sid = validTestSessionId("findings");
    getOrCreateSession(sid, "test-lighting");
    const ctx = createPopulatedContext(sid, "corr-findings");
    ctx.checks.addResults([{
      name: "mounting_height",
      type: "numerical",
      finding: "Mounting height 300 mm below minimum 500 mm",
      verdict: "FAIL",
      citationRef: ["R48.6.2"],
      sourceCitation: ["S1.c3"],
    }]);
    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );
    const result = await finalizePhase(ctx, TEST_STEPS, sid);
    expect(result.response.content).toBeTruthy();
    expect(result.response.content.length).toBeGreaterThan(50);
  });

  it("handles missing step outputs gracefully", async () => {
    const sid = validTestSessionId("empty-steps");
    getOrCreateSession(sid, "test-lighting");
    const ctx = createPopulatedContext(sid, "corr-empty");
    ctx.checks.removeResultsForField("mounting_height");
    ctx.checks.removeResultsForField("light_source");
    ctx.checks.removeResultsForField("colour_temperature");
    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );
    await finalizePhase(ctx, [], sid);
  });

  it("tracks round count correctly", async () => {
    const sid = validTestSessionId("rounds");
    getOrCreateSession(sid, "test-lighting");
    const ctx = createPopulatedContext(sid, "corr-rounds");
    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );
    const r1 = await finalizePhase(ctx, TEST_STEPS, sid);
    expect(r1.response.round).toBe(1);
    const r2 = await finalizePhase(ctx, TEST_STEPS, sid);
    expect(r2.response.round).toBe(2);
  });
});

interface MockToolResult {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

interface MockStreamConfig {
  onStepFinish?: (event: { toolResults?: MockToolResult[]; text?: string }) => void;
  abortSignal?: AbortSignal;
}

interface MockToolResult {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

describe("executeLlmToolStep with mocked LLM", () => {
  function mockLlmTextResponse(jsonText: string, toolResults?: MockToolResult[]) {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockImplementation((config: MockStreamConfig) => {
      if (config.onStepFinish && toolResults) {
        config.onStepFinish({
          toolResults,
          text: jsonText,
        });
      }
      return {
        textStream: (async function* () {
          yield jsonText;
        })(),
        usage: Promise.resolve({ promptTokens: 0, outputTokens: 0 }),
      };
    });
  }

  it("extracts CheckResult from LLM narrative for qualitative step", async () => {
    const sid = validTestSessionId("llm-narrative");
    const cid = "corr-llm-narr";
    getOrCreateSession(sid, "test-lighting");

    const ctx = createPipelineContext("test-lighting", LIGHTING_SKILL_MD, sid, cid, TEST_CHECKS, [], ["R48", "R112"]);
    ctx.palette.loadCitationPalette([
      { id: "R48.6.1", regulation: "R48", clause: "6.1", text: "§6.1 Light source requirements" },
    ]);
    ctx.files.addFile({
      fileId: "spec.pdf",
      filename: "spec.pdf",
      extractedText: "LED headlamps.",
      chunks: [{ id: "c1", text: "LED headlamps." }],
    });

    const step: ExecutableStep = {
      number: 2,
      title: "Evaluate: light_source",
      type: "llm+tool",
      instructions: "Retrieve relevant chunks. Search the context for 'light source type'.",
    };

    mockLlmTextResponse(
      `{"value":"LED headlamps [S1.c1]","sourceCitation":["S1.c1"],"citationRef":["R48.6.1"],"verdict":"PASS"}`
    );

    const result = await executeLlmToolStep(step, ctx);
    expect(result.success).toBe(true);
    expect(result.streamedTokens).toBeDefined();
    expect(result.streamedTokens!.join("")).toContain("LED headlamps");
    const checkResults = ctx.checks.getResults();
    expect(checkResults).toHaveLength(1);
    expect(checkResults[0]!.name).toBe("light_source");
    expect(checkResults[0]!.verdict).toBe("PASS");
    expect(checkResults[0]!.citationRef).toContain("R48.6.1");
  });

  it("merges tool results for numerical steps", async () => {
    const sid = validTestSessionId("llm-tool");
    const cid = "corr-llm-tool";
    getOrCreateSession(sid, "test-lighting");

    const ctx = createPipelineContext("test-lighting", LIGHTING_SKILL_MD, sid, cid, TEST_CHECKS, [], ["R48", "R112"]);
    ctx.palette.loadCitationPalette([
      { id: "R48.6.2", regulation: "R48", clause: "6.2", text: "§6.2 Mounting height minimum 500mm" },
    ]);

    const step: ExecutableStep = {
      number: 1,
      title: "Evaluate: mounting_height",
      type: "llm+tool",
      instructions: "Retrieve relevant chunks. Search the context for 'headlamp mounting height'. Type: number. Constraint: range(500-1200).",
    };

    mockLlmTextResponse(
      `{"value":"Mounting height is 650 mm from ground [S1.c3]","sourceCitation":["S1.c3"],"citationRef":["R48.6.2"],"verdict":"PASS"}`,
      [
        {
          input: { value: 650, limit: "500-1200", operator: "range" },
          output: { status: "pass", comparison: "650 in [500, 1200]" },
        },
      ],
    );

    const result = await executeLlmToolStep(step, ctx);
    expect(result.success).toBe(true);
    const checkResults = ctx.checks.getResults();
    expect(checkResults).toHaveLength(1);
    expect(checkResults[0]!.name).toBe("mounting_height");
    expect(checkResults[0]!.verdict).toBe("PASS");
    expect(checkResults[0]!.citationRef).toContain("R48.6.2");
  });

  it("handles LLM error gracefully", async () => {
    const sid = validTestSessionId("llm-error");
    const cid = "corr-llm-err";
    getOrCreateSession(sid, "test-lighting");
    const ctx = createPipelineContext("test-lighting", LIGHTING_SKILL_MD, sid, cid, TEST_CHECKS, [], ["R48", "R112"]);

    vi.mocked(streamText).mockImplementationOnce(() => {
      throw new Error("API timeout");
    });

    const step: ExecutableStep = {
      number: 1,
      title: "Evaluate: mounting_height",
      type: "llm+tool",
      instructions: "Test instructions",
    };

    const result = await executeLlmToolStep(step, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("API timeout");
    expect(result.errorCode).toBe("LLM_ERROR");
  });
});

describe("identifyRevisionTargets", () => {
  it("maps field names to step numbers", () => {
    const targets = identifyRevisionTargets(["mounting_height", "colour_temperature"], TEST_CHECKS);
    expect(targets).toEqual([1, 3]);
  });

  it("ignores unknown field names", () => {
    const targets = identifyRevisionTargets(["nonexistent"], TEST_CHECKS);
    expect(targets).toEqual([]);
  });

  it("deduplicates and sorts step numbers", () => {
    const targets = identifyRevisionTargets(["colour_temperature", "light_source", "colour_temperature"], TEST_CHECKS);
    expect(targets).toEqual([2, 3]);
  });

  it("returns empty for no fields", () => {
    expect(identifyRevisionTargets([], TEST_CHECKS)).toEqual([]);
  });
});

describe("generateStepsFromChecks", () => {
  it("generates one step per check", () => {
    expect(TEST_STEPS).toHaveLength(3);
  });

  it("sets step numbers sequentially", () => {
    expect(TEST_STEPS[0]!.number).toBe(1);
    expect(TEST_STEPS[1]!.number).toBe(2);
    expect(TEST_STEPS[2]!.number).toBe(3);
  });

  it("includes field instructions", () => {
    expect(TEST_STEPS[0]!.instructions).toContain("headlamp mounting height");
    expect(TEST_STEPS[0]!.instructions).toContain("range(500-1200)");
    expect(TEST_STEPS[0]!.instructions).toContain("R48.6.2");
    expect(TEST_STEPS[0]!.instructions).toContain("mounting height");
  });

  it("all steps are llm+tool type", () => {
    expect(TEST_STEPS.every((s) => s.type === "llm+tool")).toBe(true);
  });
});

describe("Full pipeline event flow", () => {
  it("finalizePhase returns expected event data shape", async () => {
    const sid = validTestSessionId("pipeline-flow");
    getOrCreateSession(sid, "test-lighting");
    const ctx = createPopulatedContext(sid, "corr-flow");
    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );
    const result = await finalizePhase(ctx, TEST_STEPS, sid);
    expect(result.validationErrors).toBeDefined();
    expect(Array.isArray(result.validationErrors)).toBe(true);
    expect(result.response.round).toBeGreaterThan(0);
    expect(typeof result.response.content).toBe("string");
    expect(result.response.content.length).toBeGreaterThan(0);
  });

  it("confidence is computed from real OCR data", async () => {
    const sid = validTestSessionId("confidence-test");
    const ctx = createPipelineContext("test-lighting", LIGHTING_SKILL_MD, sid, "corr-conf", TEST_CHECKS, [], ["R48", "R112"]);
    ctx.files.addFile({
      fileId: "scan.png",
      filename: "scan.png",
      extractedText: "LED headlamps",
      ocrConfidence: 85,
      extractorUsed: "tesseract",
    });
    ctx.checks.addResults([{
      name: "light_source",
      type: "qualitative",
      finding: "LED",
      verdict: "PASS",
      citationRef: ["R48.6.1"],
      sourceCitation: ["S1.c1"],
    }]);
    ctx.checks.compileCitations(
      [{ id: "R48.6.1", regulation: "R48", clause: "6.1", text: "§6.1" }],
      ctx.files.getSourcePalette(),
    );

    getOrCreateSession(sid, "test-lighting");
    const result = await finalizePhase(ctx, TEST_STEPS.slice(1, 2), sid);
    expect(result.confidence.score).toBeLessThan(100);
    expect(result.confidence.ocrConfidence).toBe(85);
  });
});

describe("executeComplianceCheck", () => {
  it("passes values within range", () => {
    const result = executeComplianceCheck(650, "500-1200", "range");
    expect(result.status).toBe("pass");
    expect(result.comparison).toBe("650 in [500, 1200]");
  });

  it("fails values outside range", () => {
    const result = executeComplianceCheck(300, "500-1200", "range");
    expect(result.status).toBe("fail");
    expect(result.note).toContain("outside range");
  });

  it("passes with <= constraint", () => {
    const result = executeComplianceCheck(5000, 6000, "<=");
    expect(result.status).toBe("pass");
  });

  it("fails with <= constraint exceeded", () => {
    const result = executeComplianceCheck(6500, 6000, "<=");
    expect(result.status).toBe("fail");
  });
});

describe("Prompt building", () => {
  it("buildSystemPrompt includes context and retry message", () => {
    const prompt = buildSystemPrompt("Context: test data", "Previous attempt failed");
    expect(prompt).toContain("Context: test data");
    expect(prompt).toContain("PREVIOUS ATTEMPT FAILED");
    expect(prompt).toContain("Previous attempt failed");
    expect(prompt).toContain("sourceCitation");
    expect(prompt).toContain("citationRef");
    expect(prompt).toContain("verdict");
  });

  it("buildSystemPrompt omits retry context when no error", () => {
    const prompt = buildSystemPrompt("Context: clean");
    expect(prompt).toContain("Context: clean");
    expect(prompt).not.toContain("PREVIOUS ATTEMPT FAILED");
  });

  it("buildUserMessage includes step info and file chunks", () => {
    const msg = buildUserMessage(1, "Evaluate: height", "Check mounting height", "[S1.c3] 650mm");
    expect(msg).toContain("Step 1: Evaluate: height");
    expect(msg).toContain("Check mounting height");
    expect(msg).toContain("[S1.c3] 650mm");
    expect(msg).not.toContain("REVISION");
  });

  it("buildUserMessage includes revision context when provided", () => {
    const msg = buildUserMessage(1, "Evaluate: height", "Check mounting height", "[S1.c3] 650mm", undefined, {
      userFeedback: "Check again, value seems wrong",
      previousOutput: '{"height": {"value": "300mm"}}',
    });
    expect(msg).toContain("REVISION");
    expect(msg).toContain("Check again, value seems wrong");
    expect(msg).toContain('{"height": {"value": "300mm"}}');
  });

  it("buildUserMessage omits file chunks when empty", () => {
    const msg = buildUserMessage(1, "Evaluate: height", "Check mounting height", "");
    expect(msg).not.toContain("Available Chunks");
    expect(msg).toContain("Check mounting height");
  });
});
