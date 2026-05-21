import { logPipeline } from "../logger";
import type { PipelineContext } from "../pipeline-context";
import type { ParsedStep } from "@/lib/agent/skill/step-parser";

/**
 * Domain-schema report assembly.
 * Combines step outputs + check results into structured report content.
 * No LLM call — purely programmatic assembly.
 */
export async function reportPhase(
  ctx: PipelineContext,
  steps: ParsedStep[],
  maxStepNum: number
): Promise<void> {
  logPipeline("→ AUTO: assembling report from step outputs and check results");

  // Step outputs as reasoning body
  const stepTexts: string[] = [];
  for (const step of steps) {
    const output = ctx.steps.read(step.number);
    if (output === undefined || output === null) continue;
    const body = typeof output === "string" ? output : JSON.stringify(output, null, 2);
    stepTexts.push(`## Step ${step.number}: ${step.title}\n${body}`);
  }

  // Check results as structured findings
  const checkResults = ctx.checks.getResults();
  const findings: string[] = [];
  for (const cr of checkResults) {
    const cite = cr.citationRef ? ` [${cr.citationRef}]` : "";
    const src = cr.sourceRef ? ` [S${cr.sourceRef}]` : "";
    findings.push(`- **${cr.name}**: ${cr.finding} → ${cr.verdict}${cite}${src}`);
  }

  const sections: Record<string, string> = {};
  if (stepTexts.length > 0) {
    sections["assessment"] = stepTexts.join("\n\n");
  }
  if (findings.length > 0) {
    sections["findings"] = findings.join("\n");
  }

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
