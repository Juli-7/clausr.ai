// ── Database ──
export { getDb, setDb, getSetting, setSetting } from "./agent/shared/memory/database";

// ── Repository ──
export {
  getOrCreateSession,
  saveChunks,
  getChunksByIds,
  getChunksBySession,
  deleteChunksBySession,
  saveFileChunks,
  getFileChunks,
  addUserMessage,
  addAssistantResponse,
  getConversationHistory,
  getResponseCount,
  saveSessionFiles,
  getSessionFiles,
  getSessionMeta,
  getAllSessions,
  getResponsesForSession,
  saveSessionSetup,
  loadSessionSetup,
  hasSessionSetup,
  saveContextSnapshot,
  getContextSnapshots,
  toggleStar,
  toggleShare,
  searchChunksFts5,
  deleteSession,
  getRecentMemories,
  saveLessonOverride,
  getLessonOverrides,
  saveUserSkill,
  deleteUserSkill,
  listUserSkillNames,
  listUserSkillNamesByTenant,
  loadUserSkill,
} from "./agent/shared/memory/repository";

export type { SessionSetupData, StoredChunk, Fts5Result, UserSkillRow } from "./agent/shared/memory/repository";

// ── Schemas & Types ──
export {
  CitationSchema,
  SourceChunkSchema,
  SourceCitationSchema,
  VerdictSchema,
  AgentResponseSchema,
  ChatRequestSchema,
  SetupRequestSchema,
  ComplianceCheckSchema,
  ConfidenceSchema,
  ClaimSchema,
  ToolCallRecordSchema,
  ReasoningStepSchema,
  LessonSchema,
  parseChunkRef,
} from "./agent/shared/schemas";

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
} from "./agent/shared/types";

// ── Pipeline ──
export { orchestratePipeline } from "./agent/pipeline/orchestrator-v2";
export { executeLlmToolStep } from "./agent/pipeline/executors/llm-executor";
export { runScript } from "./agent/pipeline/executors/script-runner";
export { executeComplianceCheck, loadRegulationSummaries } from "./agent/pipeline/builtins";
export { PipelineError, StepFailedError, SkillLoadError } from "./agent/pipeline/errors";
export { logPipeline, logInfo, logError } from "./agent/pipeline/logger";
export { identifyRevisionTargets } from "./agent/pipeline/revision-phase";

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

// ── Loading / Setup ──
export { setupSession } from "./agent/loading/loading-orchestrator";
export type { SetupSessionParams } from "./agent/loading/loading-orchestrator";
export { loadSkill, listSkills, saveSkillToFs, deleteSkillFromFs } from "./agent/loading/skill/loader";
export type { SkillLoader } from "./agent/loading/skill/loader";
export { parseChecks, extractRedline, extractLessons } from "./agent/loading/skill/check-parser";
export type { ParsedCheck, CheckFieldType } from "./agent/loading/skill/check-parser";
export { generateStepsFromChecks } from "./agent/loading/generate-steps";
export { pruneOldSessions } from "./agent/loading/cleanup";

// ── Knowledge ──
export { getRegulationApi, setRegulationApi } from "./agent/knowledge/regulation-api";
export { seedRegulations, getRegulationDb, setRegulationSeedData } from "./agent/knowledge/mock-regulation-api";
export type { RegulationSeed } from "./agent/knowledge/mock-regulation-api";
export type { IRegulationApi } from "./agent/knowledge/regulation-api";
export type {
  Regulation,
  Clause,
} from "./agent/knowledge/regulation-types";

// ── User Info / Extractors ──
export { extractFileContent } from "./agent/user-info/extractors";
export type { ExtractionResult, TextChunk, WordBox } from "./agent/user-info/extractors";
export { getDocStore, setDocStore } from "./agent/user-info/vector-store";
export type { IDocStore, ProcessedFile, ChunkInfo } from "./agent/user-info/vector-store/types";

// ── Evaluation ──
export { evaluate } from "./agent/evaluation";
export { computeConfidence } from "./agent/evaluation/confidence";
export type { EvaluationInput, EvaluationResult } from "./agent/evaluation/types";

// ── Presentation ──
export { generateDocx } from "./agent/present/export/export-docx";
export type { ReportTemplate, TemplateSection, TemplateField } from "./agent/present/template-types";

// ── Pipeline Slices ──
export { CheckStore } from "./agent/pipeline/slices/check-store";
export { StepMemory } from "./agent/pipeline/slices/step-memory";
export { FileRegistry } from "./agent/pipeline/slices/file-registry";
export type { UploadedFileEntry } from "./agent/pipeline/slices/file-registry";
export { PaletteStore } from "./agent/pipeline/slices/palette-store";
export { ReportAssembler } from "./agent/pipeline/slices/report-assembler";

// ── LLM ──
export { createModel } from "./agent/llm/factory";
export type { ProviderName } from "./agent/llm/factory";
