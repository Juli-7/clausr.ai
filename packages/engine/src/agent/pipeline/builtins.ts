import { getRegulationApi } from "../knowledge/regulation-api";
import type {
  PipelineContext,
} from "./pipeline-context";
import type { StepResult } from "./types";
import { logPipeline } from "./logger";

// ── Reference loading ──

export async function loadRegulationSummaries(ctx: PipelineContext): Promise<StepResult> {
  try {
    const checks = ctx.skill.checks;

    // Collect unique clause refs from checks (e.g. "R48.6.2")
    const clauseRefs = new Set<string>();
    for (const check of checks) {
      if (check.clause) clauseRefs.add(check.clause);
    }

    if (clauseRefs.size === 0) {
      logPipeline(`  [BUILTIN] load-summaries: no clause refs in checks, skipping`);
      return { success: true };
    }

    logPipeline(`  [BUILTIN] load-summaries: ${[...clauseRefs].join(", ")}`);

    const api = await getRegulationApi();

    // Resolve each clause ref into { regulationCode, clauseNumber }
    const refs: { regulationCode: string; clauseNumber: string }[] = [];
    const regCodes = new Set<string>();
    for (const ref of clauseRefs) {
      const dot = ref.indexOf(".");
      if (dot === -1) continue;
      const regCode = ref.substring(0, dot);
      const clauseNum = ref.substring(dot + 1);
      const resolved = await api.resolveCode(regCode);
      if (resolved) {
        refs.push({ regulationCode: resolved, clauseNumber: clauseNum });
        regCodes.add(resolved);
      } else {
        logPipeline(`  [BUILTIN] ⚠ could not resolve regulation code "${regCode}" from ref "${ref}"`);
      }
    }

    // Query clause texts (to get titles) + regulation metadata
    const clauseResults = await api.getClauses({ refs });
    if (!clauseResults.success) {
      return { success: false, error: `Failed to load clauses: ${clauseResults.error}` };
    }

    // Load regulation metadata for each unique regulation code
    const metaMap = new Map<string, { title: string; description: string }>();
    for (const code of regCodes) {
      const meta = await api.getRegulationMeta({ code });
      if (meta.success && meta.data) {
        metaMap.set(code, { title: meta.data.title, description: meta.data.description });
      }
    }

    // Build summaries: clauseIndex from clause results + metadata from metaMap
    const summaries: {
      code: string;
      title: string;
      description: string;
      clauseIndex: { number: string; title: string }[];
    }[] = [];

    const summariesByCode = new Map<string, { number: string; title: string }[]>();
    for (const item of clauseResults.data ?? []) {
      const code = item.regulationCode;
      if (!summariesByCode.has(code)) summariesByCode.set(code, []);
      summariesByCode.get(code)!.push({ number: item.clause.number, title: item.clause.title });
    }

    for (const [code, clauseIndex] of summariesByCode) {
      const meta = metaMap.get(code);
      summaries.push({
        code,
        title: meta?.title ?? code,
        description: meta?.description ?? "",
        clauseIndex,
      });
    }

    logPipeline(`  [BUILTIN] loaded ${summaries.length} regulation summaries (${[...clauseRefs].length} clause refs)`);

    ctx.palette.loadSummaries(summaries);

    // No longer pre-loading full clause texts — LLM fetches them via tools

    ctx.steps.setRaw("referenceSummary", {
      references: summaries.map((s) => s.code),
      citationCount: summaries.length,
      sourceCount: ctx.files.getFiles().length,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Builtin "load-regulations" error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Compliance check builtin ──

export interface ComplianceCheckResult {
  status: "pass" | "fail";
  comparison: string;
  note: string;
}

function parseRounding(rounding?: number | string): { places: number; mode: "standard" | "ceil" | "floor" } | null {
  if (rounding === undefined) return null;
  if (typeof rounding === "number") return { places: rounding, mode: "standard" };
  const parts = rounding.split(":");
  const places = parseInt(parts[0]!, 10);
  if (isNaN(places) || places < 0) return null;
  const mode = parts[1] === "ceil" ? "ceil" : parts[1] === "floor" ? "floor" : "standard";
  return { places, mode };
}

function roundValue(value: number, places: number, mode: "standard" | "ceil" | "floor"): number {
  const factor = 10 ** places;
  switch (mode) {
    case "ceil": return Math.ceil(value * factor) / factor;
    case "floor": return Math.floor(value * factor) / factor;
    default: return Math.round(value * factor) / factor;
  }
}

export function executeComplianceCheck(
  value: number,
  limit: number | string,
  operator: string,
  rounding?: number | string
): ComplianceCheckResult {
  let status: "pass" | "fail" = "pass";
  let note = "";
  let comparison = "";

  const roundingConfig = parseRounding(rounding);
  const compareValue = roundingConfig
    ? roundValue(value, roundingConfig.places, roundingConfig.mode)
    : value;

  if (operator === "range" && typeof limit === "string") {
    const parts = limit.split("-");
    const lo = parseFloat(parts[0]!);
    const hi = parseFloat(parts[1]!);
    comparison = `${compareValue} in [${lo}, ${hi}]`;
    if (compareValue < lo || compareValue > hi) {
      status = "fail";
      note = `Value ${compareValue} outside range [${lo}, ${hi}]`;
    }
  } else if (operator === "tolerance" && typeof limit === "string") {
    const match = limit.match(/^([\d.]+)±([\d.]+)(%)?$/);
    if (!match) {
      status = "fail";
      note = `Invalid tolerance format: ${limit}`;
    } else {
      const [, nominalStr, tolStr, isPercent] = match;
      const nominal = parseFloat(nominalStr!);
      const tol = parseFloat(tolStr!);
      const delta = isPercent ? nominal * tol / 100 : tol;
      const lo = nominal - delta;
      const hi = nominal + delta;
      comparison = `${compareValue} within ${isPercent ? `${tol}%` : `±${tol}`} of ${nominal} (${lo}-${hi})`;
      if (compareValue < lo || compareValue > hi) {
        status = "fail";
        note = `Value ${compareValue} outside ±${isPercent ? `${tol}%` : tol} tolerance of ${nominal} (allowed: ${lo}-${hi})`;
      }
    }
  } else {
    const limitVal = typeof limit === "string" ? parseFloat(limit) : limit;
    switch (operator) {
      case ">=":
        comparison = `${compareValue} >= ${limitVal}`;
        if (compareValue < limitVal) { status = "fail"; note = `${compareValue} < ${limitVal}`; }
        break;
      case "<=":
        comparison = `${compareValue} <= ${limitVal}`;
        if (compareValue > limitVal) { status = "fail"; note = `${compareValue} > ${limitVal}`; }
        break;
      case ">":
        comparison = `${compareValue} > ${limitVal}`;
        if (compareValue <= limitVal) { status = "fail"; note = `${compareValue} <= ${limitVal}`; }
        break;
      case "<":
        comparison = `${compareValue} < ${limitVal}`;
        if (compareValue >= limitVal) { status = "fail"; note = `${compareValue} >= ${limitVal}`; }
        break;
    }
  }

  if (compareValue !== value) {
    note = note ? `${note}; Rounded from ${value}` : `Rounded from ${value}`;
  }

  return { status, comparison, note };
}
