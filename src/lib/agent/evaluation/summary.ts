import type { CheckResult } from "@/lib/agent/pipeline/pipeline-context";

/**
 * Build a short narrative summary from check results.
 * Deterministic — no LLM call.
 *
 * Example:
 * "Evaluated 6 checks across R48, R112. 5 passed, 1 failed.
 *  Failures: mounting_height — 450mm below required range 500-1200mm [R48.6.2]."
 */
export function buildSummary(checkResults: readonly CheckResult[]): string {
  if (checkResults.length === 0) return "No checks were evaluated.";

  const failures = checkResults.filter((c) => c.verdict === "FAIL");
  const passCount = checkResults.length - failures.length;
  const regulations = [
    ...new Set(checkResults.map((c) => c.regulation).filter(Boolean)),
  ];

  const parts: string[] = [];
  parts.push(
    `Evaluated ${checkResults.length} ${checkResults.length === 1 ? "check" : "checks"}` +
      (regulations.length > 0 ? ` across ${regulations.join(", ")}` : "") +
      `. ${passCount} passed, ${failures.length} failed.`
  );

  if (failures.length > 0) {
    const list = failures
      .map((f) => {
        const cite = f.citationRef ? ` [${f.citationRef}]` : "";
        return `**${f.name}** — ${f.finding}${cite}`;
      })
      .join("; ");
    parts.push(`Failures: ${list}.`);
  }

  return parts.join(" ");
}

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

/**
 * Compute verdict from check results.
 */
export function computeVerdict(checkResults: readonly CheckResult[]): "PASS" | "FAIL" {
  if (checkResults.length === 0) return "PASS";
  return checkResults.some((c) => c.verdict === "FAIL") ? "FAIL" : "PASS";
}
