import { logPipeline } from "../logger";
import type { PipelineContext, CheckResult } from "../pipeline-context";

/**
 * Verify every check in `## Checks` was executed as a CheckResult.
 * For missing numerical checks, attempts a simple extraction from file data.
 * For missing qualitative checks, marks as "not assessed".
 */
export function enforceChecks(ctx: PipelineContext): void {
  const defined = ctx.skill.checks;
  if (defined.length === 0) {
    logPipeline("  [ENFORCE] no checks defined, skipping");
    return;
  }

  const existing = ctx.checks.getResults();
  const existingByField = new Map(existing.map(c => [c.name, c]));

  const missing = defined.filter(c => !existingByField.has(c.field));
  if (missing.length === 0) {
    logPipeline(`  [ENFORCE] all ${defined.length} checks have results`);
    return;
  }

  logPipeline(`  [ENFORCE] ${missing.length}/${defined.length} checks missing results — filling gaps`);

  const fileTexts = ctx.files.getFiles()
    .map(f => f.extractedText)
    .join("\n\n")
    .toLowerCase();

  for (const check of missing) {
    const field = check.field;
    const fieldLower = field.toLowerCase();

    let extractedValue: string | undefined;
    const fieldRegex = new RegExp(
      `(?:${fieldLower.replace(/[_\s]/g, "[_\\s]")})\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`,
      "i"
    );
    const match = fileTexts.match(fieldRegex);
    if (match) {
      extractedValue = match[1];
    }

    const result: CheckResult = {
      name: field,
      type: check.type.kind === "number" ? "numerical" : "qualitative",
      regulation: "",
      clause: "",
      finding: extractedValue
        ? `${field}: ${extractedValue} (auto-extracted)`
        : `${field}: not assessed (no file data)`,
      verdict: extractedValue ? "PASS" : "FAIL",
      citationRef: "",
    };

    if (extractedValue && check.clause) {
      const regMatch = check.clause.match(/R(\d+)/);
      if (regMatch) result.regulation = `R${regMatch[1]}`;
    }

    ctx.checks.addResults([result]);
    logPipeline(`  [ENFORCE] filled "${field}": ${result.finding} → ${result.verdict}`);
  }
}
