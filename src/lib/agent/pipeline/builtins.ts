import { getRegulationApi } from "@/lib/agent/regulation/regulation-api";
import { getConversationHistory } from "@/lib/agent/memory/repository";
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
    const regulationIds = ctx.skill.checks.length > 0
      ? Array.from(new Set(
          ctx.skill.checks
            .filter((c) => c.clause)
            .map((c) => {
              const match = c.clause!.match(/R(\d+)/);
              return match ? `R${match[1]}` : null;
            })
            .filter((id): id is string => id !== null)
        )).sort()
      : [];

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
      const headerMatch = rt.match(/^--- ([\w-]+) ---\n/);
      return {
        filename: headerMatch?.[1] ?? "unknown.md",
        content: rt,
      };
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
