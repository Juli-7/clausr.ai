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
import { finalizePhase } from "../present/phases/finalize-phase";
import {
  saveSessionSetup,
  loadSessionSetup,
  hasSessionSetup,
  getOrCreateSession,
} from "../shared/memory/repository";
import { parseChecks } from "../loading/skill/check-parser";
import { generateStepsFromChecks } from "../loading/generate-steps";
import { executeLlmToolStep } from "../pipeline/executors/llm-executor";
import type { ExecutableStep } from "../pipeline/types";

const TEST_DB_DIR = path.join(os.tmpdir(), "clausr-e2e-test");
const TEST_DB_PATH = path.join(TEST_DB_DIR, "test-e2e.db");

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

function validTestSessionId(label: string): string {
  return `e2e-${label}-${Date.now()}`;
}

function makeStreamTextMock(jsonText: string) {
  (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    textStream: (async function* () {
      yield jsonText;
    })(),
    usage: Promise.resolve({ inputTokens: 50, outputTokens: 20 }),
  });
}

describe("Full pipeline end-to-end", () => {
  it("parseChecks → generateSteps → restoreContext → executeLlmToolStep → finalizePhase produces valid AgentResponse", async () => {
    expect(TEST_CHECKS).toHaveLength(3);
    expect(TEST_STEPS).toHaveLength(3);
    expect(TEST_STEPS[0]!.type).toBe("llm+tool");

    const sid = validTestSessionId("e2e-full");
    getOrCreateSession(sid, "test-lighting");

    const ctx = createPipelineContext(
      "test-lighting",
      LIGHTING_SKILL_MD,
      sid,
      "corr-e2e-full",
      TEST_CHECKS,
      [],
      ["R48", "R112"],
    );

    ctx.palette.addPaletteEntries([
      { id: "R48.6.1", regulation: "R48", clause: "6.1", text: "§6.1 Light source requirements" },
      { id: "R48.6.2", regulation: "R48", clause: "6.2", text: "§6.2 Mounting height minimum 500mm" },
      { id: "R112.5.5", regulation: "R112", clause: "5.5", text: "§5.5 Colour temperature not more than 6000K" },
    ]);

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

    for (const step of TEST_STEPS) {
      makeStreamTextMock(
        step.number === 1
          ? `{"value":"Mounting height is 650 mm from ground [S1.c3]","sourceCitation":["S1.c3"],"citationRef":["R48.6.2"],"verdict":"PASS"}`
          : step.number === 2
            ? `{"value":"LED headlamps [S1.c1]","sourceCitation":["S1.c1"],"citationRef":["R48.6.1"],"verdict":"PASS"}`
            : `{"value":"Colour temperature is 5000 K [S1.c4]","sourceCitation":["S1.c4"],"citationRef":["R112.5.5"],"verdict":"PASS"}`
      );

      const result = await executeLlmToolStep(step, ctx);
      expect(result.success).toBe(true);
    }

    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );

    const final = await finalizePhase(ctx, TEST_STEPS, sid);

    expect(final.response.content).toBeTruthy();
    expect(final.response.content).toContain("mounting_height");
    expect(final.response.content).toContain("light_source");
    expect(final.response.content).toContain("colour_temperature");
    expect(final.response.citations).toHaveLength(3);
    expect(final.response.sessionId).toBe(sid);
    expect(final.response.round).toBe(1);
    expect(final.confidence.score).toBeGreaterThan(0);
    expect(final.confidence.score).toBeLessThanOrEqual(100);
    expect(final.validationErrors).toHaveLength(0);
  });

  it("handles step failure gracefully mid-pipeline", async () => {
    const sid = validTestSessionId("e2e-failure");
    getOrCreateSession(sid, "test-lighting");

    const ctx = createPipelineContext(
      "test-lighting",
      LIGHTING_SKILL_MD,
      sid,
      "corr-e2e-fail",
      TEST_CHECKS,
      [],
      ["R48", "R112"],
    );

    ctx.files.addFile({
      fileId: "spec.pdf",
      filename: "spec.pdf",
      extractedText: "LED headlamps.",
      chunks: [{ id: "c1", text: "LED headlamps." }],
    });

    makeStreamTextMock("not valid json at all");

    const failResult = await executeLlmToolStep(TEST_STEPS[0]!, ctx);
    expect(failResult.success).toBe(false);
    expect(failResult.errorCode).toBe("JSON_PARSE_FAILED");
    expect(ctx.checks.getResults()).toHaveLength(0);
  });

  it("preserves previous results and reports them in finalizePhase", async () => {
    const sid = validTestSessionId("e2e-preserve");
    getOrCreateSession(sid, "test-lighting");

    const ctx = createPipelineContext(
      "test-lighting",
      LIGHTING_SKILL_MD,
      sid,
      "corr-e2e-preserve",
      TEST_CHECKS,
      [],
      ["R48", "R112"],
    );

    ctx.palette.addPaletteEntries([
      { id: "R48.6.1", regulation: "R48", clause: "6.1", text: "§6.1" },
      { id: "R48.6.2", regulation: "R48", clause: "6.2", text: "§6.2" },
      { id: "R112.5.5", regulation: "R112", clause: "5.5", text: "§5.5" },
    ]);

    ctx.files.addFile({
      fileId: "spec.pdf",
      filename: "spec.pdf",
      extractedText: "LED headlamps. Mounting height 650 mm. Colour temperature 5000 K.",
      chunks: [
        { id: "c1", text: "LED headlamps." },
        { id: "c3", text: "Mounting height 650 mm." },
        { id: "c4", text: "Colour temperature 5000 K." },
      ],
    });

    for (const step of TEST_STEPS) {
      makeStreamTextMock(
        step.number === 1
          ? `{"value":"Mounting height is 650 mm [S1.c3]","sourceCitation":["S1.c3"],"citationRef":["R48.6.2"],"verdict":"PASS"}`
          : step.number === 2
            ? `{"value":"LED headlamps [S1.c1]","sourceCitation":["S1.c1"],"citationRef":["R48.6.1"],"verdict":"PASS"}`
            : `{"value":"Colour temperature is 5000 K [S1.c4]","sourceCitation":["S1.c4"],"citationRef":["R112.5.5"],"verdict":"PASS"}`
      );

      await executeLlmToolStep(step, ctx);
    }

    const results = ctx.checks.getResults();
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.verdict === "PASS")).toBe(true);

    ctx.checks.compileCitations(
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette(),
    );

    const final = await finalizePhase(ctx, TEST_STEPS, sid);
    expect(final.response.content).toBeTruthy();
    expect(final.response.round).toBe(1);
  });

  it("round-trips through DB save/restore", async () => {
    const sid = validTestSessionId("e2e-roundtrip");
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
    expect(loaded!.steps[0]!.title).toContain("mounting_height");

    const restored = await restoreContext(sid, "corr-e2e-rt");
    expect(restored).not.toBeNull();
    expect(restored!.ctx.skill.name).toBe("test-lighting");
    expect(restored!.steps).toHaveLength(3);
    expect(restored!.steps[0]!.number).toBe(1);
  });
});
