import type { Citation, SourceCitation, Verdict, Claim } from "@/lib/agent/schemas";
import type { ReportTemplate } from "@/lib/agent/template-types";
import type { TextChunk } from "@/lib/agent/extractors";

// ── Types ──

export interface CitationPaletteEntry {
  id: string;
  regulation: string;
  clause: string;
  text: string;
}

export interface SourcePaletteEntry {
  id: number;
  fileId: string;
  filename: string;
  extractedText: string;
  keyExcerpt: string;
  chunks?: TextChunk[];
  dataUrl?: string;
  pageNumber?: number;
}

export interface VehicleData {
  make: string;
  model: string;
  lightSource: string;
  mountingHeight: string;
  beamPattern: string;
  luminousFlux: string;
  colorTemp: string;
  cutoffSharpness: string;
  levelingDeviation: string;
}

export interface CheckResult {
  name: string;
  type: "numerical" | "qualitative";
  regulation: string;
  clause: string;
  finding: string;
  verdict: "PASS" | "FAIL";
  citationRef: string;
  sourceRef?: number;
  toolCallId?: string;
  toolResult?: {
    value: number;
    limit: number;
    comparison: string;
    status: "pass" | "fail";
    note?: string;
  };
}

export interface PipelineContext {
  skill: {
    name: string;
    skillmd: string;
    template: ReportTemplate | null;
  };
  sessionId: string;
  /** Correlation ID for log tracing across a single pipeline run */
  correlationId: string;
  /** Whether to fill template structure (default true when template exists) */
  useTemplate: boolean;

  /** Generic step outputs keyed by step number or label (e.g. "toolCalls") */
  stepOutputs: Record<string, unknown>;

  vehicleData: VehicleData | null;
  loadedReferences: { filename: string; content: string }[];
  citationPalette: CitationPaletteEntry[];
  sourcePalette: SourcePaletteEntry[];
  checkResults: CheckResult[];
  /** Structured claim→citation mappings extracted from LLM output (Layer 5) */
  claims: Claim[];
  compiledCitations: Citation[];
  compiledSourceCitations: SourceCitation[];
  reportSections: Record<string, Record<string, string> | string> | null;
  verdict: Verdict | null;

  previousTurns: {
    turnNumber: number;
    userMessage: string;
    checkResults: CheckResult[];
    reasoningSummary: string;
  }[];

  uploadedFiles: {
    fileId: string;
    filename: string;
    extractedText: string;
    chunks?: TextChunk[];
    dataUrl?: string;
    pageCount?: number;
    ocrConfidence?: number;
    extractorUsed?: string;
  }[];
}

// ── Factory ──

export function createPipelineContext(
  skillName: string,
  skillmd: string,
  template: ReportTemplate | null,
  sessionId: string,
  correlationId: string,
  useTemplate?: boolean
): PipelineContext {
  return {
    skill: { name: skillName, skillmd, template },
    sessionId,
    correlationId,
    useTemplate: useTemplate ?? (template !== null),
    stepOutputs: {},
    vehicleData: null,
    loadedReferences: [],
    citationPalette: [],
    sourcePalette: [],
    checkResults: [],
    claims: [],
    compiledCitations: [],
    compiledSourceCitations: [],
    reportSections: null,
    verdict: null,
    previousTurns: [],
    uploadedFiles: [],
  };
}

// ── Context persistence across turns ──

export function serializeContext(ctx: PipelineContext): string {
  return JSON.stringify({
    vehicleData: ctx.vehicleData,
    citationPalette: ctx.citationPalette,
    sourcePalette: ctx.sourcePalette,
    checkResults: ctx.checkResults,
    compiledCitations: ctx.compiledCitations,
    compiledSourceCitations: ctx.compiledSourceCitations,
    uploadedFiles: ctx.uploadedFiles.map((f) => ({
      fileId: f.fileId,
      filename: f.filename,
      dataUrl: f.dataUrl,
      pageCount: f.pageCount,
      chunks: f.chunks,
    })),
  });
}

export function deserializeContext(
  json: string,
  skill: PipelineContext["skill"],
  sessionId: string
): Partial<PipelineContext> {
  const data = JSON.parse(json);
  return {
    skill,
    sessionId,
    vehicleData: data.vehicleData ?? null,
    citationPalette: data.citationPalette ?? [],
    sourcePalette: data.sourcePalette ?? [],
    checkResults: data.checkResults ?? [],
    compiledCitations: data.compiledCitations ?? [],
    compiledSourceCitations: data.compiledSourceCitations ?? [],
    uploadedFiles: data.uploadedFiles ?? [],
    loadedReferences: [],
    reportSections: null,
    verdict: null,
    previousTurns: [],
  };
}
