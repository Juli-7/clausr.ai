// Type-only exports — safe for client-side imports (no Node.js dependencies)

export type {
  Citation,
  SourceChunk,
  SourceCitation,
  Verdict,
  AgentResponse,
  Confidence,
  ChatRequest,
  SetupRequest,
  ChatRequestFile,
  ComplianceCheckInput,
  Claim,
  ToolCallRecord,
  ValidationError,
  ReasoningStep,
} from "./agent/shared/schemas";

export type {
  ExecutableStep,
  StepResult,
  PipelineEvent,
} from "./agent/pipeline/types";

export type {
  PipelineContext,
  CitationPaletteEntry,
  SourcePaletteEntry,
  CheckResult,
} from "./agent/pipeline/pipeline-context";

export type { SkillLoader } from "./agent/loading/skill/loader";
export type { ParsedCheck, CheckFieldType } from "./agent/loading/skill/check-parser";
export type { IRegulationApi } from "./agent/knowledge/regulation-api";
export type { Regulation, Clause } from "./agent/knowledge/regulation-types";
export type { ExtractionResult, TextChunk, WordBox } from "./agent/user-info/extractors";
export type { IDocStore, ProcessedFile, ChunkInfo } from "./agent/user-info/vector-store/types";
export type { EvaluationInput, EvaluationResult } from "./agent/evaluation/types";
export type { ReportTemplate, TemplateSection, TemplateField } from "./agent/present/template-types";
export type { UploadedFileEntry } from "./agent/pipeline/slices/file-registry";
export type { SessionSetupData, StoredChunk, Fts5Result } from "./agent/shared/memory/repository";
export type { ProviderName } from "./agent/llm/factory";
