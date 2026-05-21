import type { EvaluationInput, EvaluationResult } from "./types";
import { computeConfidence } from "./confidence";
import { buildSummary, buildFindings, computeVerdict } from "./summary";
import { validate } from "./validate";
import { buildClauseTextsFromPalette } from "./clause-texts";

/**
 * Evaluate the pipeline's raw output into a structured assessment.
 *
 * This is the sole entry point of the Evaluation layer.
 * It takes plain data (no PipelineContext) and returns analyzed results:
 * verdict, confidence, summary, findings, validation.
 */
export function evaluate(input: EvaluationInput): EvaluationResult {
  const checkResults = [...input.checkResults];
  const citations = [...input.citations];
  const sourceCitations = [...input.sourceCitations];

  // Verdict
  const verdict = computeVerdict(checkResults);
  const confidence = computeConfidence(input);
  const needsExpert = confidence.needsExpert;

  // Summary + findings
  const summary = buildSummary(checkResults);
  const findings = buildFindings(checkResults);

  // Section data for the response
  const sections: Record<string, Record<string, string> | string> = {};
  sections.summary = summary;
  sections.findings = findings;

  // Clause texts for citation popovers
  const clauseTexts = buildClauseTextsFromPalette(input.citationPalette);

  // Validation
  const reportContent = input.reportSections
    ? Object.values(input.reportSections)
        .map((s) => (typeof s === "string" ? s : Object.values(s).join(" ")))
        .join(" ")
    : null;

  const validationErrors = validate({
    verdict,
    claims: input.claims,
    citations,
    sourceCitations,
    citationPalette: input.citationPalette,
    sourcePalette: input.sourcePalette,
    reportContent,
  });

  // Reasoning from step outputs
  const reasoningSteps = Object.entries(input.stepTitles).map(([num, title]) => {
    const output = input.stepOutputs[num];
    const body =
      output === undefined || output === null
        ? ""
        : typeof output === "string"
          ? output
          : JSON.stringify(output, null, 2);
    return { stepNumber: Number(num), title, body };
  });

  const reason = reasoningSteps
    .filter((s) => s.body)
    .map((s) => `---STEP ${s.stepNumber}---\n${s.title}\n\n${s.body.slice(0, 500)}`)
    .join("\n");

  return {
    verdict,
    confidence,
    sections,
    summary,
    findings,
    validationErrors,
    clauseTexts,
    citations,
    sourceCitations,
    claims: [...input.claims],
    reason,
    reasoningSteps,
    needsExpert,
  };
}
