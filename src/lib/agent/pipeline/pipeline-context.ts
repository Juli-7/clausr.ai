import type { Citation, SourceCitation, Verdict, Claim } from "@/lib/agent/shared/schemas";
import type { TextChunk } from "@/lib/agent/user-info/extractors";
import type { ParsedCheck } from "@/lib/agent/loading/skill/check-parser";
import { CheckStore } from "@/lib/agent/shared/slices/check-store";
import { StepMemory } from "@/lib/agent/shared/slices/step-memory";
import { FileRegistry } from "@/lib/agent/shared/slices/file-registry";
import { PaletteStore } from "@/lib/agent/shared/slices/palette-store";
import { ReportAssembler } from "@/lib/agent/shared/slices/report-assembler";

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
    checks: ParsedCheck[];
  };
  sessionId: string;
  correlationId: string;

  /** Decomposed context slices */
  checks: CheckStore;
  steps: StepMemory;
  files: FileRegistry;
  palette: PaletteStore;
  report: ReportAssembler;

  /** @deprecated — use ctx.checks / ctx.steps / ctx.files / ctx.palette / ctx.report instead */
  stepOutputs: Record<string, unknown>;

  skillData: Record<string, unknown>;
  loadedReferences: { filename: string; content: string }[];
  citationPalette: CitationPaletteEntry[];
  sourcePalette: SourcePaletteEntry[];
  checkResults: CheckResult[];
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
  sessionId: string,
  correlationId: string,
  checks?: ParsedCheck[]
): PipelineContext {
  return {
    skill: { name: skillName, skillmd, checks: checks ?? [] },
    sessionId,
    correlationId,
    checks: new CheckStore(),
    steps: new StepMemory(),
    files: new FileRegistry(),
    palette: new PaletteStore(),
    report: new ReportAssembler(),
    stepOutputs: {},
    skillData: {},
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
    skillData: ctx.skillData,
    citationPalette: [...ctx.palette.getCitationPalette()],
    sourcePalette: ctx.files.getSourcePalette(),
    checkResults: [...ctx.checks.getResults()],
    compiledCitations: [...ctx.checks.getCitations()],
    compiledSourceCitations: [...ctx.checks.getSourceCitations()],
    uploadedFiles: ctx.files.getFiles().map((f) => ({
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
    skillData: data.skillData ?? {},
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
