import { logPipeline } from "../logger";
import type { PipelineContext, CheckResult } from "../pipeline-context";
import type { ExecutableStep } from "../step-executor";

/**
 * Domain-schema report assembly.
 *
 * Produces three named sections matching the auto-derived template:
 *   - summary:  short narrative (markdown)
 *   - findings: { field → finding } map (rendered as a fields table)
 *   - verdict:  set later by finalizePhase
 *
 * No LLM call — purely programmatic assembly from check results.
 */
export async function reportPhase(
  ctx: PipelineContext,
  _steps: ExecutableStep[],
  _maxStepNum: number
): Promise<void> {
  logPipeline("→ AUTO: assembling report from check results");

  const checkResults = ctx.checks.getResults();

  // findings: one entry per check field
  const findings: Record<string, string> = {};
  for (const cr of checkResults) {
    findings[cr.name] = formatFinding(cr);
  }

  // summary: short narrative auto-generated from check results
  const summary = buildSummary(checkResults);

  const sections: Record<string, Record<string, string> | string> = {};
  if (summary) sections["summary"] = summary;
  if (Object.keys(findings).length > 0) sections["findings"] = findings;

  if (Object.keys(sections).length > 0) {
    ctx.report.setContent(sections);
    logPipeline(`  ✓ report: sections=${Object.keys(sections).join(", ")}`);
  }

  const reportContent = ctx.report.getAllContentFlat();
  if (reportContent) {
    ctx.checks.supplementFromContent(
      reportContent,
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette()
    );
  }
}

function formatFinding(cr: CheckResult): string {
  const cite = cr.citationRef ? ` [${cr.citationRef}]` : "";
  const src = cr.sourceRef ? ` [S${cr.sourceRef}]` : "";
  return `${cr.finding} → ${cr.verdict}${cite}${src}`;
}

function buildSummary(checks: readonly CheckResult[]): string {
  if (checks.length === 0) return "No checks were evaluated.";

  const failures = checks.filter((c) => c.verdict === "FAIL");
  const passCount = checks.length - failures.length;
  const regulations = [...new Set(checks.map((c) => c.regulation).filter(Boolean))];

  const parts: string[] = [];
  parts.push(
    `Evaluated ${checks.length} ${checks.length === 1 ? "check" : "checks"}` +
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
