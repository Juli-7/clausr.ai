import { loadReferencesForConditions } from "@/lib/agent/regulation/skill-source";
import { getConversationHistory, getRecentMemories } from "@/lib/agent/memory/repository";
import { getSkill } from "@/lib/agent/skill/registry";
import type { ComplianceCheckInput } from "@/lib/agent/schemas";
import type {
  PipelineContext,
  CitationPaletteEntry,
} from "./pipeline-context";
import type { StepResult } from "./step-executor";
import { logPipeline } from "./logger";

// ── Builtin executors ──

export async function executeBuiltin(
  executor: string,
  ctx: PipelineContext
): Promise<StepResult> {
  switch (executor) {
    case "builtin:load-references":
      return loadReferences(ctx);
    default:
      return { success: false, error: `Unknown builtin executor: "${executor}"`, errorCode: "BUILTIN_ERROR" };
  }
}

// ── Reference loading ──

async function loadReferences(ctx: PipelineContext): Promise<StepResult> {
  try {
    const conditions = extractConditions(ctx);
    logPipeline(`  [BUILTIN] load-references conditions=[${conditions.join(", ")}]`);

    const refTexts = loadReferencesForConditions(ctx.skill.name, conditions);
    logPipeline(`  [BUILTIN] loaded ${refTexts.length} reference texts`);
    ctx.loadedReferences = refTexts.map((rt) => {
      const headerMatch = rt.match(/^--- ([\w-]+\.md) ---\n/);
      return {
        filename: headerMatch?.[1] ?? "unknown.md",
        content: rt,
      };
    });

    const skill = getSkill(ctx.skill.name);
	    const loadedFilenames = new Set(ctx.loadedReferences.map(r => r.filename));
	    const relevantClauses = (skill.clauseIndex ?? []).filter(c => {
	      const refFilename = `un-r${c.regulation.slice(1)}.md`;
	      return loadedFilenames.has(refFilename);
	    });

	    ctx.citationPalette = buildCitationPaletteFromIndex(relevantClauses);
    logPipeline(`  [BUILTIN] citationPalette=${ctx.citationPalette.length} entries: ${ctx.citationPalette.map(e => `${e.regulation}§${e.clause}[${e.id}]`).join(", ")}`);

    // Build source palette from uploaded files
    ctx.sourcePalette = ctx.uploadedFiles.map((f, i) => ({
      id: i + 1,
      fileId: f.fileId,
      filename: f.filename,
      extractedText: f.extractedText,
      keyExcerpt: f.extractedText.slice(0, 200),
      chunks: f.chunks,
      dataUrl: f.dataUrl,
      pageNumber: f.pageCount,
    }));

    const memories = getRecentMemories(ctx.skill.name);
    logPipeline(`  [BUILTIN] sourcePalette=${ctx.sourcePalette.length} entries memories=${memories.length}`);

    ctx.stepOutputs["2"] = {
      references: ctx.loadedReferences.map((r) => r.filename),
      citationCount: ctx.citationPalette.length,
      sourceCount: ctx.sourcePalette.length,
      memoryCount: memories.length,
    };

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Builtin "load-references" error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Compliance check builtin (replaces compliance-check.py) ──

export interface ComplianceCheckResult {
  name: string;
  value: number;
  limit: number | string;
  comparison: string;
  status: "pass" | "fail";
  note: string;
}

export function executeComplianceCheck(input: ComplianceCheckInput): { results: ComplianceCheckResult[] } {
  const results: ComplianceCheckResult[] = [];

  for (const check of input.checks) {
    const { name, value, limit, operator } = check;
    let status: "pass" | "fail" = "pass";
    let note = "";
    let comparison = "";

    if (operator === "range" && typeof limit === "string") {
      const parts = limit.split("-");
      const lo = parseFloat(parts[0]);
      const hi = parseFloat(parts[1]);
      comparison = `${value} in [${lo}, ${hi}]`;
      if (value < lo || value > hi) {
        status = "fail";
        note = `Value ${value} outside range [${lo}, ${hi}]`;
      }
    } else {
      const limitVal = typeof limit === "string" ? parseFloat(limit) : limit;
      switch (operator) {
        case ">=":
          comparison = `${value} >= ${limitVal}`;
          if (value < limitVal) { status = "fail"; note = `${value} < ${limitVal}`; }
          break;
        case "<=":
          comparison = `${value} <= ${limitVal}`;
          if (value > limitVal) { status = "fail"; note = `${value} > ${limitVal}`; }
          break;
        case ">":
          comparison = `${value} > ${limitVal}`;
          if (value <= limitVal) { status = "fail"; note = `${value} <= ${limitVal}`; }
          break;
        case "<":
          comparison = `${value} < ${limitVal}`;
          if (value >= limitVal) { status = "fail"; note = `${value} >= ${limitVal}`; }
          break;
      }
    }

    results.push({ name, value, limit, comparison, status, note });
  }

  return { results };
}

// ── Helpers ──

function extractConditions(ctx: PipelineContext): string[] {
  const conditions: string[] = [];

  // From vehicle data
  if (ctx.vehicleData) {
    const vd = ctx.vehicleData;
    if (vd.lightSource && vd.lightSource !== "unknown")
      conditions.push("lighting", vd.lightSource.toLowerCase());
    if (vd.beamPattern && vd.beamPattern !== "unknown")
      conditions.push("beam");
    if (vd.colorTemp && vd.colorTemp !== "unknown")
      conditions.push("colour");
    if (vd.cutoffSharpness && vd.cutoffSharpness !== "unknown")
      conditions.push("cutoff");
  }

  // From uploaded file text (fallback when vehicleData not yet populated)
  for (const file of ctx.uploadedFiles) {
    const lower = file.extractedText.toLowerCase();
    const filePatterns = [
      { words: ["led", "headlamp", "low beam", "high beam", "lighting", "xenon"], kw: "lighting" },
      { words: ["brake", "braking", "abs", "stop lamp"], kw: "braking" },
      { words: ["emission", "exhaust", "co2", "nox"], kw: "emissions" },
      { words: ["cut-off", "cutoff"], kw: "cutoff" },
      { words: ["colour", "color", "temperature", "kelvin"], kw: "colour" },
    ];
    for (const { words, kw } of filePatterns) {
      if (words.some((w) => lower.includes(w))) conditions.push(kw);
    }
  }

  // From user message
  try {
    const history = getConversationHistory(ctx.sessionId);
    const lastMsg =
      history.filter((m) => m.role === "user").pop()?.content ?? "";
    const lower = lastMsg.toLowerCase();
    const msgPatterns = [
      { words: ["light", "led", "headlamp", "beam", "flash"], kw: "lighting" },
      { words: ["brake", "braking", "abs"], kw: "braking" },
      { words: ["emission", "exhaust", "co2", "nox"], kw: "emissions" },
      { words: ["cutoff", "cut-off"], kw: "cutoff" },
      { words: ["colour", "color", "temperature"], kw: "colour" },
    ];
    for (const { words, kw } of msgPatterns) {
      if (words.some((w) => lower.includes(w))) conditions.push(kw);
    }
  } catch {
    // ignore — no history available
  }

  return conditions;
}

function buildCitationPaletteFromIndex(
  clauseIndex: { regulation: string; clause: string; text: string }[]
): CitationPaletteEntry[] {
  const palette: CitationPaletteEntry[] = [];
  const seen = new Set<string>();
  for (const entry of clauseIndex) {
    const id = `${entry.regulation}.${entry.clause}`;
    if (seen.has(id)) continue;
    seen.add(id);
    palette.push({
      id,
      regulation: entry.regulation,
      clause: entry.clause,
      text: entry.text,
    });
  }
  return palette;
}

