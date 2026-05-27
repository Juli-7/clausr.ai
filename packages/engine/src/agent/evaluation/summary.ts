import type { CheckResult } from "../pipeline/pipeline-context";

/**
 * Build findings map from check results.
 * Each entry: field_name → "finding → VERDICT [citation]"
 */
export function buildFindings(
  checkResults: readonly CheckResult[]
): Record<string, string> {
  const findings: Record<string, string> = {};
  for (const cr of checkResults) {
    if (cr.verdict !== "FAIL") continue;
    const src = cr.sourceCitation.length > 0 ? cr.sourceCitation.map(r => ` [${r}]`).join("") : "";
    findings[cr.name] = `${cr.finding} → ${cr.verdict}${src}`;
  }
  return findings;
}
