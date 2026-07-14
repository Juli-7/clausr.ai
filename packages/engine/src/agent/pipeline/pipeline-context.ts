import type { TextChunk } from "../user-info/extractors";
import type { ParsedCheck } from "../loading/skill/check-parser";
import { CheckStore } from "./slices/check-store";
import { StepMemory } from "./slices/step-memory";
import { FileRegistry } from "./slices/file-registry";
import { PaletteStore } from "./slices/palette-store";
import { loadSessionSetup } from "../shared/memory/repository";

// ── Types ──

export interface CitationPaletteEntry {
  id: string;
  regulation: string;
  clause: string;
  text: string;
}

export interface SourcePaletteEntry {
  id: string;
  fileId: string;
  filename: string;
  extractedText: string;
  keyExcerpt: string;
  chunks?: TextChunk[];
  dataUrl?: string;
  pageNumber?: number;
  pageCount?: number;
}

export interface CheckResult {
  name: string;
  type: "numerical" | "qualitative";
  finding: string;
  verdict: "PASS" | "FAIL";
  citationRef: string[];
  sourceCitation: string[];
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
    scripts: { name: string; path: string; desc: string; params: string }[];
    regulationIds: string[];
  };
  sessionId: string;
  correlationId: string;

  /** Owned context slices — canonical data store */
  checks: CheckStore;
  steps: StepMemory;
  files: FileRegistry;
  palette: PaletteStore;

  /** Data carried across turns */
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

  /** Optional chat history context injected by compliance audit runner */
  chatContext?: string;
}

// ── Factory ──

export function createPipelineContext(
  skillName: string,
  skillmd: string,
  sessionId: string,
  correlationId: string,
  checks: ParsedCheck[],
  scripts?: { name: string; path: string; desc: string; params: string }[],
  regulationIds?: string[]
): PipelineContext {
  return {
    skill: { name: skillName, skillmd, checks, scripts: scripts ?? [], regulationIds: regulationIds ?? [] },
    sessionId,
    correlationId,
    checks: new CheckStore(),
    steps: new StepMemory(),
    files: new FileRegistry(),
    palette: new PaletteStore(),
    previousTurns: [],
    uploadedFiles: [],
  };
}

// ── Restore from DB session_setup ──

export async function restoreContext(
  sessionId: string,
  correlationId: string,
): Promise<{ ctx: PipelineContext; steps: import("../pipeline/types").ExecutableStep[] } | null> {
  const setup = loadSessionSetup(sessionId);
  if (!setup) return null;

  const ctx = createPipelineContext(
    setup.skillName,
    setup.skillmd,
    sessionId,
    correlationId,
    setup.checks,
    setup.scripts,
    setup.regulationIds,
  );

  ctx.files = FileRegistry.fromJSON(setup.fileRegistry);

  return { ctx, steps: setup.steps };
}
