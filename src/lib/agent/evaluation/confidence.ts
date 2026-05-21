import type { Confidence } from "@/lib/agent/schemas";
import type { EvaluationInput } from "./types";

/**
 * Compute objective confidence from pipeline execution side-info.
 *
 * Factors:
 *   - OCR quality (how well the extractors read uploaded files)
 *   - PDF extraction method (pdf-parse = reliable, render fallback = less)
 *   - LLM self-assessed confidence (from step outputs, if LLM provided one)
 */
export function computeConfidence(input: EvaluationInput): Confidence {
  const avgOcr = averageOcrConfidence(input.files);
  const ocrPenalty = (1 - avgOcr / 100) * 30;

  let pdfPenalty = 0;
  for (const f of input.files) {
    if (f.extractorUsed === "pdf-parse") pdfPenalty = Math.max(pdfPenalty, 5);
    else if (f.extractorUsed === "fallback") pdfPenalty = Math.max(pdfPenalty, 10);
  }

  const baseScore = Math.max(0, 100 - ocrPenalty - pdfPenalty);

  let llmMultiplier = 1.0;
  let llmReasoning = "No LLM assessment available";
  for (const key of Object.keys(input.stepOutputs)) {
    const output = input.stepOutputs[key];
    if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      if (obj.confidence && typeof obj.confidence === "object") {
        const c = obj.confidence as Record<string, unknown>;
        if (typeof c.llmMultiplier === "number") llmMultiplier = c.llmMultiplier;
        if (typeof c.llmReasoning === "string") llmReasoning = c.llmReasoning;
      }
    }
  }
  llmMultiplier = Math.max(0.5, Math.min(1.0, llmMultiplier));

  const finalScore = Math.round(baseScore * llmMultiplier * 10) / 10;

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    ocrConfidence: Math.round(avgOcr),
    dataCompleteness: 100,
    llmMultiplier: Math.round(llmMultiplier * 100) / 100,
    llmReasoning,
    needsExpert: finalScore < 50,
  };
}

function averageOcrConfidence(
  files: { ocrConfidence?: number }[]
): number {
  const withOcr = files.filter((f) => f.ocrConfidence !== undefined);
  if (withOcr.length === 0) return 100;
  return withOcr.reduce((s, f) => s + (f.ocrConfidence ?? 100), 0) / withOcr.length;
}
