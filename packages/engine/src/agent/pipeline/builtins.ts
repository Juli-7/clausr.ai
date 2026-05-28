import { getRegulationApi } from "../knowledge/regulation-api";
import type {
  PipelineContext,
  CitationPaletteEntry,
} from "./pipeline-context";
import type { StepResult } from "./types";
import { logPipeline } from "./logger";

// ── Reference loading ──

export async function loadRegulationSummaries(ctx: PipelineContext): Promise<StepResult> {
  try {
    const regulationIds = ctx.skill.regulationIds;

    if (regulationIds.length === 0) {
      logPipeline(`  [BUILTIN] load-summaries: no regulation IDs, skipping`);
      return { success: true };
    }

    logPipeline(`  [BUILTIN] load-summaries: ${regulationIds.join(", ")}`);

    const api = await getRegulationApi();
    const regulations = (
      await Promise.all(
        regulationIds.map(async (id) => {
          const resolved = api.resolveCode(id);
          if (!resolved) return null;
          const result = await api.getRegulation({ code: resolved });
          return result.success ? result.data : null;
        })
      )
    ).filter((r): r is NonNullable<typeof r> => r !== null);

    // Tier 1: Build compact summaries (clause numbers + titles only) + full reference texts
    const summaries: {
      code: string;
      title: string;
      description: string;
      clauseIndex: { number: string; title: string }[];
    }[] = [];
    const refTexts: string[] = [];

    for (const reg of regulations) {
      const header = `--- ${reg.code} ---`;
      const bodyLines: string[] = [];
      const clauseIndex: { number: string; title: string }[] = [];

      for (const clause of reg.clauses) {
        const clauseText = clause.title
          ? `\xA7${clause.number} ${clause.title}\n${clause.text}`
          : `\xA7${clause.number}\n${clause.text}`;
        bodyLines.push(clauseText);
        clauseIndex.push({ number: clause.number, title: clause.title });
      }

      refTexts.push(`${header}\n${bodyLines.join("\n\n")}`);
      summaries.push({
        code: reg.code,
        title: reg.title,
        description: reg.description,
        clauseIndex,
      });
    }

    logPipeline(`  [BUILTIN] loaded ${summaries.length} regulation summaries`);

    ctx.palette.loadReferences(refTexts.map((rt) => {
      let code = "unknown.md";
      const headerStart = rt.indexOf("--- ");
      if (headerStart !== -1) {
        const headerEnd = rt.indexOf(" ---\n", headerStart + 4);
        if (headerEnd !== -1) {
          code = rt.substring(headerStart + 4, headerEnd);
        }
      }
      return { filename: code, content: rt };
    }));

    ctx.palette.loadSummaries(summaries);

    // Tier 2: Eagerly load clause texts for checks' declared clause fields
    const preloadedEntries: CitationPaletteEntry[] = [];
    const seen = new Set<string>();

    for (const check of ctx.skill.checks) {
      if (!check.clause) continue;
      for (const reg of regulations) {
        let clauseNumber: string;
        if (check.clause.startsWith(reg.code + ".")) {
          clauseNumber = check.clause.substring(reg.code.length + 1);
        } else {
          clauseNumber = check.clause;
        }
        const clause = reg.clauses.find((c) => c.number === clauseNumber);
        if (clause) {
          const ref = `${reg.code}.${clause.number}`;
          if (!seen.has(ref)) {
            seen.add(ref);
            const text = clause.title
              ? `\xA7${clause.number} ${clause.title}\n${clause.text}`
              : `\xA7${clause.number}\n${clause.text}`;
            preloadedEntries.push({
              id: ref,
              regulation: reg.code,
              clause: clause.number,
              text,
            });
          }
          break;
        }
      }
    }

    ctx.palette.addPaletteEntries(preloadedEntries);
    logPipeline(`  [BUILTIN] pre-loaded ${preloadedEntries.length} check-related clause(s): ${preloadedEntries.map((e) => e.id).join(", ")}`);

    ctx.steps.setRaw("referenceSummary", {
      references: ctx.palette.getReferences().map((r) => r.filename),
      citationCount: preloadedEntries.length,
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
