import { logPipeline } from "@/lib/agent/pipeline/logger";
import type { PipelineContext, CheckResult } from "@/lib/agent/pipeline/pipeline-context";

/**
 * Verify every check in `## Checks` was executed as a CheckResult.
 * For missing numerical checks, attempts a simple extraction from file data.
 * For missing qualitative checks, skips (no auto-fill).
 */
export function enforceChecks(ctx: PipelineContext): void {
  const defined = ctx.skill.checks;
  if (defined.length === 0) {
    logPipeline("  [ENFORCE] no checks defined, skipping");
    return;
  }

  const existing = ctx.checks.getResults();
  const existingByField = new Map(existing.map(c => [c.name, c]));

  // Only enforce numerical checks — qualitative ones rely on LLM narrative
  const numericalMissing = defined.filter(
    c => (c.type.kind === "number" || c.constraint) && !existingByField.has(c.field)
  );
  if (numericalMissing.length === 0) {
    const qualitativeSkipped = defined.filter(c => !existingByField.has(c.field)).length;
    if (qualitativeSkipped > 0) {
      logPipeline(`  [ENFORCE] ${qualitativeSkipped} qualitative check(s) missing — skipped (narrative only)`);
    } else {
      logPipeline(`  [ENFORCE] all ${defined.length} checks have results`);
    }
    return;
  }

  logPipeline(`  [ENFORCE] ${numericalMissing.length} numerical check(s) missing results — filling gaps`);

  const fileTexts = ctx.files.getFiles()
    .map(f => f.extractedText)
    .join("\n\n")
    .toLowerCase();

  for (const check of numericalMissing) {
    const field = check.field;
    const fieldLower = field.toLowerCase();

    let extractedValue: string | undefined;
    const fieldPos = fileTexts.indexOf(fieldLower);
    if (fieldPos !== -1) {
      const afterField = fileTexts.substring(fieldPos + fieldLower.length).trimStart();
      if (afterField.startsWith(":") || afterField.startsWith("=")) {
        const raw = afterField.substring(1).trimStart();
        let numEnd = 0;
        for (let i = 0; i < raw.length; i++) {
          const c = raw[i];
          if (c >= "0" && c <= "9") { numEnd = i + 1; }
          else if (c === "." && i > 0 && numEnd <= i) { numEnd = i + 1; }
          else if (c === "-" && i === 0) { continue; }
          else break;
        }
        const numStr = raw.substring(0, numEnd);
        if (numStr.length > 0 && !isNaN(parseFloat(numStr))) {
          extractedValue = numStr;
        }
      }
    }

    const regulation = ctx.skill.regulationIds.length > 0 ? ctx.skill.regulationIds[0] : "";

    const result: CheckResult = {
      name: field,
      type: "numerical",
      regulation,
      clause: check.clause ?? "",
      finding: extractedValue
        ? `${field}: ${extractedValue} (auto-extracted)`
        : `${field}: not assessed (no file data)`,
      verdict: extractedValue ? "PASS" : "FAIL",
      citationRef: "",
    };

    ctx.checks.addResults([result]);
    logPipeline(`  [ENFORCE] filled "${field}": ${result.finding} → ${result.verdict}`);
  }
}
