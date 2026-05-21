import type {
  Citation,
  SourceCitation,
  Claim,
  ValidationError,
  Confidence,
} from "@/lib/agent/schemas";
import type { ParsedCheck } from "@/lib/agent/skill/check-parser";
import type { CitationPaletteEntry, SourcePaletteEntry, CheckResult } from "@/lib/agent/pipeline/pipeline-context";
import type { ValidationError as PipelineValidationError } from "./validate";

/**
 * Raw data from the pipeline — the input to evaluation.
 * Pipeline produces this naturally during execution.
 */
export interface EvaluationInput {
  /** Per-check results from LLM execution */
  checkResults: readonly CheckResult[];
  /** Citation palette (regulation clauses) loaded during step 1 */
  citationPalette: readonly CitationPaletteEntry[];
  /** Source palette (uploaded file chunks) */
  sourcePalette: SourcePaletteEntry[];
  /** Files with OCR metadata */
  files: { ocrConfidence?: number; extractorUsed?: string }[];
  /** All step outputs keyed by step number */
  stepOutputs: Record<string, unknown>;
  /** Step titles keyed by step number */
  stepTitles: Record<number, string>;
  /** Claims extracted from LLM output */
  claims: readonly Claim[];
  /** Compiled regulation citations */
  citations: Citation[];
  /** Compiled source citations */
  sourceCitations: SourceCitation[];
  /** The Checks table definitions */
  checks: ParsedCheck[];
  /** Report sections built during pipeline (findings) */
  reportSections: Record<string, Record<string, string> | string> | null;
  /** Tool call records */
  toolCalls: unknown;
}

/**
 * The result of evaluation — ready for response assembly.
 */
export interface EvaluationResult {
  verdict: "PASS" | "FAIL";
  confidence: Confidence;
  sections: Record<string, Record<string, string> | string>;
  summary: string;
  findings: Record<string, string>;
  validationErrors: PipelineValidationError[];
  clauseTexts: Record<string, string>;
  citations: Citation[];
  sourceCitations: SourceCitation[];
  claims: Claim[];
  reason: string;
  reasoningSteps: { stepNumber: number; title: string; body: string }[];
  needsExpert: boolean;
}
