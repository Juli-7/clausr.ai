import type { EvaluationInput, EvaluationResult } from "./types";
import { computeConfidence } from "./confidence";
import { buildFindings } from "./summary";
import { validate } from "./validate";

export function evaluate(input: EvaluationInput): EvaluationResult {
  const checkResults = [...input.checkResults];
  const citations = [...input.citations];
  const sourceCitations = [...input.sourceCitations];

  const confidence = computeConfidence(input);
  const findings = buildFindings(checkResults);

  const validationErrors = validate({
    claims: input.claims,
    citations,
    sourceCitations,
    citationPalette: input.citationPalette,
    sourcePalette: input.sourcePalette,
    reportContent: null,
  });

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
