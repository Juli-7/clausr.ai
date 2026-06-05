import type { EvaluationInput, EvaluationResult } from "./types";
import { computeConfidence } from "./confidence";
import { buildFindings } from "./summary";
import { validate } from "./validate";

export function evaluate(input: EvaluationInput): EvaluationResult {
  // Sort check results to follow SKILL.md check order (# Checks sequence)
  const checkResults = [...input.checkResults].sort((a, b) => {
    const aIdx = input.checks.findIndex(c => c.field === a.name);
    const bIdx = input.checks.findIndex(c => c.field === b.name);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
  const citations = [...input.citations];
  const sourceCitations = [...input.sourceCitations];

  const validationErrors = validate({
    claims: input.claims,
    citations,
    sourceCitations,
    citationPalette: input.citationPalette,
    sourcePalette: input.sourcePalette,
    reportContent: null,
  });

  const confidence = computeConfidence({ ...input, validationErrors });
  const findings = buildFindings(checkResults);

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
    confidence,
    findings,
    validationErrors,
    citations,
    sourceCitations,
    claims: [...input.claims],
    reason,
    reasoningSteps,
  };
}
