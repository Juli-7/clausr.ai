import { getRegulationApi } from "@/lib/agent/knowledge/regulation-api";
import type { ComplianceCheckInput } from "@/lib/agent/shared/schemas";
import type {
  PipelineContext,
  CitationPaletteEntry,
} from "./pipeline-context";
import type { StepResult } from "./types";
import { logPipeline } from "./logger";

// ── Reference loading ──

export async function loadReferences(ctx: PipelineContext): Promise<StepResult> {
  try {
    const regulationIds = ctx.skill.regulationIds;

    if (regulationIds.length === 0) {
      logPipeline(`  [BUILTIN] load-references: no regulation IDs from checks, skipping`);
      return { success: true };
    }

    logPipeline(`  [BUILTIN] load-references: ${regulationIds.join(", ")}`);

    const api = getRegulationApi();
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

    const refTexts: string[] = [];
    const palette: CitationPaletteEntry[] = [];
    const seen = new Set<string>();

    for (const reg of regulations) {
      const header = `--- ${reg.code} ---`;
      const bodyLines: string[] = [];

      for (const clause of reg.clauses) {
        const clauseText = clause.title
          ? `§${clause.number} ${clause.title}\n${clause.text}`
          : `§${clause.number}\n${clause.text}`;
        bodyLines.push(clauseText);

        const id = `${reg.code}.${clause.number}`;
        if (!seen.has(id)) {
          seen.add(id);
          palette.push({
            id,
            regulation: reg.code,
            clause: clause.number,
            text: clauseText,
          });
        }
      }

      refTexts.push(`${header}\n${bodyLines.join("\n\n")}`);
    }

    logPipeline(`  [BUILTIN] loaded ${refTexts.length} regulation texts`);
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

    ctx.palette.loadCitationPalette(palette);
    logPipeline(`  [BUILTIN] citationPalette=${palette.length} entries: ${palette.map(e => `${e.regulation}§${e.clause}[${e.id}]`).join(", ")}`);

    ctx.steps.setRaw("2", {
      references: ctx.palette.getReferences().map((r) => r.filename),
      citationCount: palette.length,
      sourceCount: ctx.files.getFiles().length,
    });

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
