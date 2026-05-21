import type {
  Citation,
  SourceCitation,
  Claim,
  Confidence,
} from "@/lib/agent/schemas";
import type { ParsedCheck } from "@/lib/agent/skill/check-parser";
import type { CitationPaletteEntry, SourcePaletteEntry, CheckResult } from "@/lib/agent/pipeline/pipeline-context";
import type { ValidationError as PipelineValidationError } from "./validate";

/**
 * Raw data from the pipeline — the input to evaluation.
 */
export interface EvaluationInput {
  checkResults: readonly CheckResult[];
  citationPalette: readonly CitationPaletteEntry[];
  sourcePalette: SourcePaletteEntry[];
  files: { ocrConfidence?: number; extractorUsed?: string }[];
  stepOutputs: Record<string, unknown>;
  stepTitles: Record<number, string>;
  claims: readonly Claim[];
  citations: Citation[];
  sourceCitations: SourceCitation[];
  checks: ParsedCheck[];
  toolCalls: unknown;
}

/**
 * The result of evaluation — ready for response assembly.
 */
export interface EvaluationResult {
  confidence: Confidence;
  findings: Record<string, string>;
  validationErrors: PipelineValidationError[];
  citations: Citation[];
  sourceCitations: SourceCitation[];
  claims: Claim[];
  reason: string;
  reasoningSteps: { stepNumber: number; title: string; body: string }[];
}
