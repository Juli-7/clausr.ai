import type { CheckResult } from "@/lib/agent/pipeline/pipeline-context";

/**
 * Build findings map from check results.
 * Each entry: field_name → "finding → VERDICT [citation]"
 */
export function buildFindings(
  checkResults: readonly CheckResult[]
): Record<string, string> {
  const findings: Record<string, string> = {};
  for (const cr of checkResults) {
    const cite = cr.citationRef ? ` [${cr.citationRef}]` : "";
    const src = cr.sourceRef ? ` [S${cr.sourceRef}]` : "";
    findings[cr.name] = `${cr.finding} → ${cr.verdict}${cite}${src}`;
  }
  return findings;
}
