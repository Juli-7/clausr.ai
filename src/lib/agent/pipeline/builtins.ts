import { getRegulationApi } from "@/lib/agent/knowledge/regulation-api";
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

export function executeComplianceCheck(
  value: number,
  limit: number | string,
  operator: string
): ComplianceCheckResult {
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

  return { status, comparison, note };
}
