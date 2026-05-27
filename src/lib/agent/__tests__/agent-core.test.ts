import { describe, it, expect } from "vitest";
import { parseChunkRef } from "@/lib/agent/shared/schemas";
import { parseChecks } from "@/lib/agent/loading/skill/check-parser";
import { executeComplianceCheck } from "@/lib/agent/pipeline/builtins";
import { computeConfidence } from "@/lib/agent/evaluation/confidence";
import { createPipelineContext } from "@/lib/agent/pipeline/pipeline-context";
import { CheckStore } from "@/lib/agent/pipeline/slices/check-store";
import { StepMemory } from "@/lib/agent/pipeline/slices/step-memory";
import { PaletteStore } from "@/lib/agent/pipeline/slices/palette-store";
import { FileRegistry } from "@/lib/agent/pipeline/slices/file-registry";
import { ReportAssembler } from "@/lib/agent/pipeline/slices/report-assembler";

// ── parseChunkRef ──

describe("parseChunkRef", () => {
  it("parses valid chunk ref", () => {
    expect(parseChunkRef("S1.chunk-abc")).toEqual({ fileRef: 1, chunkId: "chunk-abc" });
  });

  it("parses chunk ref with numeric id", () => {
    expect(parseChunkRef("S3.42")).toEqual({ fileRef: 3, chunkId: "42" });
  });

  it("returns null for bare source ref", () => {
    expect(parseChunkRef("S1")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseChunkRef("")).toBeNull();
  });

  it("returns null for regulation ref", () => {
    expect(parseChunkRef("R48.6.1")).toBeNull();
  });
});

// ── parseChecks ──

describe("parseChecks", () => {
  it("parses checks from SKILL.md paragraph format", () => {
    const md = `## Checks

### mounting_height
1. **type**: number
2. **description**: Measured in mm from ground
3. **clause**: R48 §6.2
4. **constraint**: >= 500
5. **depends_on**: (none)
6. **sample**: The mounting height is 650 mm [S1.c3].

### light_source
1. **type**: string
2. **description**: Type of light source
3. **clause**: R112 §5.5
4. **depends_on**: (none)
5. **sample**: The vehicle uses LED headlamps [S1.c1].
`;
    const checks = parseChecks(md);
    expect(checks).toHaveLength(2);
    expect(checks[0].field).toBe("mounting_height");
    expect(checks[0].type).toEqual({ kind: "number" });
    expect(checks[0].constraint).toBe(">= 500");
    expect(checks[0].clause).toBe("R48 §6.2");
    expect(checks[0].description).toBe("Measured in mm from ground");
    expect(checks[1].field).toBe("light_source");
    expect(checks[1].type).toEqual({ kind: "string" });
  });

  it("parses enum type", () => {
    const md = `## Checks

### colour
1. **type**: enum(red, green, blue)
2. **description**: Choose a colour
3. **clause**: (none)
4. **depends_on**: (none)
5. **sample**: (none)
`;
    const checks = parseChecks(md);
    expect(checks).toHaveLength(1);
    expect(checks[0].type).toEqual({ kind: "enum", values: ["red", "green", "blue"] });
  });

  it("returns empty array when no ## Checks section", () => {
    expect(parseChecks("# Just a heading\nNo checks here")).toEqual([]);
  });

  it("skips entries with missing type", () => {
    const md = `## Checks

### valid_field
1. **type**: string
2. **description**: A valid field
3. **clause**: (none)
4. **depends_on**: (none)
5. **sample**: (none)
`;
    const checks = parseChecks(md);
    expect(checks).toHaveLength(1);
    expect(checks[0].field).toBe("valid_field");
  });
});

// ── executeComplianceCheck ──

describe("executeComplianceCheck", () => {
  it("passes >= check when value meets limit", () => {
    const result = executeComplianceCheck(650, 500, ">=");
    expect(result.status).toBe("pass");
    expect(result.comparison).toBe("650 >= 500");
  });

  it("fails >= check when value below limit", () => {
    const result = executeComplianceCheck(400, 500, ">=");
    expect(result.status).toBe("fail");
    expect(result.note).toContain("400 < 500");
  });

  it("passes <= check when value under limit", () => {
    const result = executeComplianceCheck(5500, 6000, "<=");
    expect(result.status).toBe("pass");
  });

  it("fails <= check when value exceeds limit", () => {
    const result = executeComplianceCheck(6500, 6000, "<=");
    expect(result.status).toBe("fail");
  });

  it("passes range check when value in range", () => {
    const result = executeComplianceCheck(15, "10-20", "range");
    expect(result.status).toBe("pass");
  });

  it("fails range check when value out of range", () => {
    const result = executeComplianceCheck(25, "10-20", "range");
    expect(result.status).toBe("fail");
  });

  it("rounds value before >= check when rounding is specified", () => {
    const result = executeComplianceCheck(1.2345, 1.23, ">=", 2);
    expect(result.status).toBe("pass");
    expect(result.comparison).toBe("1.23 >= 1.23");
  });

  it("rounds value making borderline pass", () => {
    const result = executeComplianceCheck(1.229, 1.23, ">=", 2);
    expect(result.status).toBe("pass");
    expect(result.comparison).toBe("1.23 >= 1.23");
    expect(result.note).toContain("Rounded from 1.229");
  });

  it("includes rounding note when value was modified", () => {
    const result = executeComplianceCheck(1.236, 1.23, ">=", 2);
    expect(result.status).toBe("pass");
    expect(result.note).toContain("Rounded from 1.236");
  });

  it("does not add rounding note when value unchanged", () => {
    const result = executeComplianceCheck(1.23, 1.23, ">=", 2);
    expect(result.status).toBe("pass");
    expect(result.note).toBe("");
  });

  it("uses ceil rounding mode — rounds up past limit", () => {
    const result = executeComplianceCheck(1.231, 1.23, "<=", "2:ceil");
    expect(result.status).toBe("fail");
    expect(result.comparison).toBe("1.24 <= 1.23");
    expect(result.note).toContain("Rounded from 1.231");
  });

  it("uses floor rounding mode — rounds down below limit", () => {
    const result = executeComplianceCheck(1.239, 1.24, ">=", "2:floor");
    expect(result.status).toBe("fail");
    expect(result.comparison).toBe("1.23 >= 1.24");
    expect(result.note).toContain("Rounded from 1.239");
  });

  it("handles string rounding number without mode", () => {
    const result = executeComplianceCheck(1.2345, 1.23, ">=", "2");
    expect(result.status).toBe("pass");
    expect(result.comparison).toBe("1.23 >= 1.23");
    expect(result.note).toContain("Rounded from 1.2345");
  });

  it("passes tolerance check with percent", () => {
    const result = executeComplianceCheck(104, "100±5%", "tolerance");
    expect(result.status).toBe("pass");
    expect(result.comparison).toContain("95-105");
  });

  it("fails tolerance check with percent", () => {
    const result = executeComplianceCheck(106, "100±5%", "tolerance");
    expect(result.status).toBe("fail");
    expect(result.note).toContain("outside");
  });

  it("passes tolerance check with absolute", () => {
    const result = executeComplianceCheck(101, "100±2", "tolerance");
    expect(result.status).toBe("pass");
    expect(result.comparison).toContain("98-102");
  });

  it("fails tolerance check with absolute", () => {
    const result = executeComplianceCheck(103, "100±2", "tolerance");
    expect(result.status).toBe("fail");
  });

  it("fails tolerance check on bad format", () => {
    const result = executeComplianceCheck(100, "bad", "tolerance");
    expect(result.status).toBe("fail");
    expect(result.note).toContain("Invalid tolerance format");
  });

  it("rounds value before tolerance check", () => {
    const result = executeComplianceCheck(105.3, "100±5%", "tolerance", 0);
    expect(result.status).toBe("pass");
    expect(result.comparison).toContain("105 within 5% of 100");
    expect(result.note).toContain("Rounded from 105.3");
  });
});

// ── computeConfidence ──

describe("computeConfidence", () => {
  it("returns 100 when all sources perfect and no llm override", () => {
    const result = computeConfidence({
      checkResults: [],
      citationPalette: [],
      sourcePalette: [],
      files: [],
      stepOutputs: {},
      stepTitles: {},
      claims: [],
      citations: [],
      sourceCitations: [],
      checks: [],
      toolCalls: [],
    });
    expect(result.score).toBe(100);
    expect(result.ocrConfidence).toBe(100);
    expect(result.needsExpert).toBe(false);
  });

  it("applies OCR penalty", () => {
    const result = computeConfidence({
      checkResults: [],
      citationPalette: [],
      sourcePalette: [],
      files: [{ ocrConfidence: 50 }],
      stepOutputs: {},
      stepTitles: {},
      claims: [],
      citations: [],
      sourceCitations: [],
      checks: [],
      toolCalls: [],
    });
    // avgOcr=50, penalty=(1-0.5)*30=15, base=85, llmMultiplier=1
    expect(result.score).toBe(85);
    expect(result.ocrConfidence).toBe(50);
  });

  it("applies PDF penalty for fallback extraction", () => {
    const result = computeConfidence({
      checkResults: [],
      citationPalette: [],
      sourcePalette: [],
      files: [{ extractorUsed: "fallback" }],
      stepOutputs: {},
      stepTitles: {},
      claims: [],
      citations: [],
      sourceCitations: [],
      checks: [],
      toolCalls: [],
    });
    // base=100-0-10=90
    expect(result.score).toBe(90);
  });

  it("respects LLM confidence multiplier from step outputs", () => {
    const result = computeConfidence({
      checkResults: [],
      citationPalette: [],
      sourcePalette: [],
      files: [],
      stepOutputs: {
        "1": { confidence: { llmMultiplier: 0.7, llmReasoning: "Low confidence" } },
      },
      stepTitles: {},
      claims: [],
      citations: [],
      sourceCitations: [],
      checks: [],
      toolCalls: [],
    });
    // 100 * 0.7 = 70
    expect(result.score).toBe(70);
    expect(result.llmMultiplier).toBe(0.7);
    expect(result.llmReasoning).toBe("Low confidence");
  });

  it("clamps multiplier to [0.5, 1.0]", () => {
    const low = computeConfidence({
      checkResults: [],
      citationPalette: [],
      sourcePalette: [],
      files: [],
      stepOutputs: { "1": { confidence: { llmMultiplier: 0.1 } } },
      stepTitles: {},
      claims: [],
      citations: [],
      sourceCitations: [],
      checks: [],
      toolCalls: [],
    });
    expect(low.score).toBe(50);

    const high = computeConfidence({
      checkResults: [],
      citationPalette: [],
      sourcePalette: [],
      files: [],
      stepOutputs: { "1": { confidence: { llmMultiplier: 1.5 } } },
      stepTitles: {},
      claims: [],
      citations: [],
      sourceCitations: [],
      checks: [],
      toolCalls: [],
    });
    expect(high.score).toBe(100);
  });
});

// ── createPipelineContext ──

describe("createPipelineContext", () => {
  it("creates context with default empty slices", () => {
    const ctx = createPipelineContext("test-skill", "# Skill body", "sess-1", "corr-1", []);
    expect(ctx.skill.name).toBe("test-skill");
    expect(ctx.skill.skillmd).toBe("# Skill body");
    expect(ctx.skill.checks).toEqual([]);
    expect(ctx.skill.scripts).toEqual([]);
    expect(ctx.sessionId).toBe("sess-1");
    expect(ctx.correlationId).toBe("corr-1");
    expect(ctx.checks).toBeInstanceOf(CheckStore);
    expect(ctx.steps).toBeInstanceOf(StepMemory);
    expect(ctx.files).toBeInstanceOf(FileRegistry);
    expect(ctx.palette).toBeInstanceOf(PaletteStore);
    expect(ctx.report).toBeInstanceOf(ReportAssembler);
    expect(ctx.previousTurns).toEqual([]);
    expect(ctx.uploadedFiles).toEqual([]);
  });

  it("passes checks and scripts to context", () => {
    const checks = parseChecks(`## Checks

### x
1. **type**: number
2. **description**: Test field
3. **clause**: (none)
4. **constraint**: (none)
5. **depends_on**: (none)
6. **sample**: (none)
`);
    const scripts = [{ name: "test", path: "/scripts/test.py", desc: "Test", params: "" }];
    const ctx = createPipelineContext("s", "md", "sess-1", "corr-1", checks, scripts);
    expect(ctx.skill.checks).toHaveLength(1);
    expect(ctx.skill.checks[0].field).toBe("x");
    expect(ctx.skill.scripts).toHaveLength(1);
    expect(ctx.skill.scripts[0].name).toBe("test");
  });
});

// ── CheckStore ──

describe("CheckStore", () => {
  it("adds and retrieves check results", () => {
    const store = new CheckStore();
    store.addResults([{
      name: "mounting_height", type: "numerical",
      finding: "650",       verdict: "PASS", citationRef: ["R48.6.2"], sourceCitation: [],
    }]);
    expect(store.getResults()).toHaveLength(1);
    expect(store.computeVerdict()).toBe("PASS");
    expect(store.failureCount).toBe(0);
  });

  it("computes FAIL when any check fails", () => {
    const store = new CheckStore();
    store.addResults([
      { name: "a", type: "numerical", finding: "ok", verdict: "PASS", citationRef: [], sourceCitation: [] },
      { name: "b", type: "numerical", finding: "bad", verdict: "FAIL", citationRef: [], sourceCitation: [] },
    ]);
    expect(store.computeVerdict()).toBe("FAIL");
    expect(store.failureCount).toBe(1);
  });

  it("removes results for a field", () => {
    const store = new CheckStore();
    store.addResults([
      { name: "a", type: "numerical", finding: "1", verdict: "PASS", citationRef: [], sourceCitation: [] },
      { name: "b", type: "numerical", finding: "2", verdict: "PASS", citationRef: [], sourceCitation: [] },
    ]);
    const removed = store.removeResultsForField("a");
    expect(removed).toHaveLength(1);
    expect(store.getResults()).toHaveLength(1);
    expect(store.getResults()[0].name).toBe("b");
  });

  it("compiles citations from check results", () => {
    const store = new CheckStore();
    store.addResults([{
      name: "mounting_height", type: "numerical",
      finding: "650",       verdict: "PASS", citationRef: ["R48.6.2"], sourceCitation: [],
    }]);
    store.compileCitations(
      [{ id: "R48.6.2", regulation: "R48", clause: "6.2", text: "Mount at least 500mm" }],
      []
    );
    expect(store.getCitations()).toHaveLength(1);
    expect(store.getCitations()[0].ref).toBe("R48.6.2");
  });

  it("sets verdict to PASS when no results", () => {
    const store = new CheckStore();
    expect(store.computeVerdict()).toBe("PASS");
  });

  it("adds and retrieves claims", () => {
    const store = new CheckStore();
    store.addClaims([{ statement: "Height is 650mm", citationRef: "R48.6.2", sourceCitation: "S1.c1" }]);
    expect(store.getClaims()).toHaveLength(1);
    expect(store.getClaims()[0].statement).toBe("Height is 650mm");
  });
});

// ── StepMemory ──

describe("StepMemory", () => {
  it("writes and reads by step number", () => {
    const mem = new StepMemory();
    mem.write(1, { result: "pass" });
    expect(mem.read(1)).toEqual({ result: "pass" });
  });

  it("returns latest step", () => {
    const mem = new StepMemory();
    mem.write(1, "first");
    mem.write(2, "second");
    expect(mem.latest()).toEqual({ stepNumber: 2, value: "second" });
  });

  it("returns null when no steps written", () => {
    expect(new StepMemory().latest()).toBeNull();
  });

  it("stores and retrieves raw keys", () => {
    const mem = new StepMemory();
    mem.setRaw("toolCalls", [{ step: 1, toolName: "check" }]);
    expect(mem.getRaw("toolCalls")).toEqual([{ step: 1, toolName: "check" }]);
  });

  it("returns copy of entries", () => {
    const mem = new StepMemory();
    mem.write(1, "data");
    const entries = mem.entries();
    expect(entries).toEqual({ "1": "data" });
    entries["2"] = "mutated";
    expect(mem.read(2)).toBeUndefined();
  });
});

// ── PaletteStore ──

describe("PaletteStore", () => {
  it("stores and retrieves references", () => {
    const store = new PaletteStore();
    store.loadReferences([{ filename: "r48.md", content: "# R48" }]);
    expect(store.getReferences()).toHaveLength(1);
    expect(store.getReferences()[0].filename).toBe("r48.md");
  });

  it("stores citation palette", () => {
    const store = new PaletteStore();
    store.loadCitationPalette([{ id: "R48.6.2", regulation: "R48", clause: "6.2", text: "Mount at least 500mm" }]);
    expect(store.getCitationPalette()).toHaveLength(1);
  });

  it("finds citation by ref", () => {
    const store = new PaletteStore();
    store.loadCitationPalette([
      { id: "R48.6.2", regulation: "R48", clause: "6.2", text: "text" },
      { id: "R112.5.5", regulation: "R112", clause: "5.5", text: "other" },
    ]);
    expect(store.findCitation("R48.6.2")?.regulation).toBe("R48");
    expect(store.findCitation("missing")).toBeUndefined();
  });

  it("formats context summary", () => {
    const store = new PaletteStore();
    store.loadCitationPalette([{ id: "R48.6.2", regulation: "R48", clause: "6.2", text: "Mount at least 500mm" }]);
    const summary = store.formatContextSummary();
    expect(summary).toContain("[R48.6.2]");
    expect(summary).toContain("R48");
    expect(summary).toContain("§6.2");
  });

  it("returns empty string for empty citation palette", () => {
    expect(new PaletteStore().formatContextSummary()).toBe("");
  });
});

// ── FileRegistry ──

describe("FileRegistry", () => {
  it("adds and lists files", () => {
    const reg = new FileRegistry();
    reg.addFile({ fileId: "f1", filename: "test.pdf", extractedText: "content" });
    expect(reg.hasFiles()).toBe(true);
    expect(reg.getFiles()).toHaveLength(1);
  });

  it("reports no files when empty", () => {
    expect(new FileRegistry().hasFiles()).toBe(false);
  });

  it("generates source palette with chunk-level ids", () => {
    const reg = new FileRegistry();
    reg.addFile({ fileId: "f1", filename: "a.pdf", extractedText: "hello world" });
    reg.addFile({
      fileId: "f2", filename: "b.pdf", extractedText: "foo bar baz",
      chunks: [{ id: "c1", text: "chunk one" }],
    });
    const palette = reg.getSourcePalette();
    expect(palette).toHaveLength(2);
    expect(palette[0].id).toBe("S1");
    expect(palette[1].id).toBe("S2.c1");
    expect(palette[0].filename).toBe("a.pdf");
  });

  it("builds context summary with chunks", () => {
    const reg = new FileRegistry();
    reg.addFile({
      fileId: "f1", filename: "doc.pdf", extractedText: "full text",
      chunks: [{ id: "c1", text: "chunk one" }, { id: "c2", text: "chunk two" }],
    });
    const summary = reg.buildContextSummary();
    expect(summary).toContain("[S1.c1] chunk one");
    expect(summary).toContain("[S1.c2] chunk two");
  });

  it("computes average OCR confidence", () => {
    const reg = new FileRegistry();
    reg.addFile({ fileId: "f1", filename: "a.png", extractedText: "", ocrConfidence: 80 });
    reg.addFile({ fileId: "f2", filename: "b.png", extractedText: "", ocrConfidence: 90 });
    expect(reg.averageOcrConfidence()).toBe(85);
  });

  it("returns 100 when no files have OCR confidence", () => {
    const reg = new FileRegistry();
    reg.addFile({ fileId: "f1", filename: "a.pdf", extractedText: "text" });
    expect(reg.averageOcrConfidence()).toBe(100);
  });
});

// ── ReportAssembler ──

describe("ReportAssembler", () => {
  it("stores and retrieves content", () => {
    const r = new ReportAssembler();
    r.setContent({ summary: "All checks pass." });
    expect(r.getContent()).toContain("summary");
    expect(r.getContent()).toContain("All checks pass.");
  });

  it("returns fallback when no content set", () => {
    expect(new ReportAssembler().getContent()).toBe("Assessment not available.");
  });

  it("stores and retrieves sections", () => {
    const r = new ReportAssembler();
    r.setContent({ findings: { "mounting_height": "650 [PASS]" } });
    expect(r.getSections()).toEqual({ findings: { "mounting_height": "650 [PASS]" } });
    expect(r.getSection("findings")).toEqual({ "mounting_height": "650 [PASS]" });
    expect(r.getSection("missing")).toBeUndefined();
  });

  it("returns all content flat", () => {
    const r = new ReportAssembler();
    r.setContent({ a: "hello", b: { x: "world" } });
    expect(r.getAllContentFlat()).toBe("hello world");
  });

  it("handles verdict", () => {
    const r = new ReportAssembler();
    expect(r.getVerdict()).toBeNull();
    r.setVerdict("PASS");
    expect(r.getVerdict()).toBe("PASS");
  });
});

// ── (enforceChecks removed — step execution loop is the sole verdict source) ──
