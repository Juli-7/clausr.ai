// ── Database ──
export { getDb, setDb } from "./agent/shared/memory/database";

// ── Repository ──
export {
  getOrCreateSession,
  saveChunks,
  getChunksByIds,
  getChunksBySession,
  deleteChunksBySession,
  deleteChunksByFile,
  saveFileChunks,
  getFileChunks,
  addUserMessage,
  addAssistantMessage,
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

// ── Compliance Session ──
export {
  getComplianceSession,
  ensureComplianceSession,
  setComplianceStep,
  setComplianceScope,
  setComplianceDocData,
  addComplianceDocField,
  addComplianceFile,
  getComplianceFiles,
  removeComplianceFile,
  setComplianceAuditRunning,
  setComplianceAuditDone,
  clearComplianceAuditResults,
  setCompliancePrecheckDone,
  setCompliancePackAuditResult,
  setComplianceValidation,
  setComplianceAgentResponse,
  setComplianceComments,
  getComplianceComments,
  getAllComplianceSessions,
} from "./agent/shared/memory/repository";
export type { ComplianceSessionData, ComplianceFile } from "./agent/shared/memory/repository";

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
  CheckResultItemSchema,
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
export { setupSession, setupSkill, processSessionFiles } from "./agent/loading/loading-orchestrator";
export { loadPack, listPacks, loadSkill, saveSkillToFs, deleteSkillFromFs, saveCompiledPack } from "./agent/loading/skill/loader";
export type { SkillPack, PackCheck, DocumentTemplate, DocumentField, LoadPackOptions, SkillLoader } from "./agent/loading/skill/loader";
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
export { setLLMConfig, setRetentionConfig, clearConfig, getConfig } from "./agent/llm/config";
export type { ProviderName } from "./agent/llm/factory";

// ── Prompts ──
export { COMPLIANCE_SYSTEM_PROMPTS, buildComplianceStepPrompt } from "./agent/pipeline/prompts";
export type { SessionState } from "./agent/pipeline/prompts";

// ── Compliance Packs (search/get/list with eager cache) ──
export { searchPacks, getPack, packs, allRegs, allInds } from "./compliance-packs";

// ── Compliance Session (build UI-friendly session object) ──
export { buildSession } from "./compliance-session";
export type { ComplianceSession, ValidationCheck } from "./compliance-session";

// ── Compliance Tools (LLM-callable tool definitions for chat) ──
export { TOOL_DEFS, ToolSchemas, getTool } from "./compliance-tools";
export type { ToolDef, ToolName, ToolInput } from "./compliance-tools";

// ── Compliance Chat (multi-step tool loop) ──
export { complianceChat } from "./compliance-chat";
export type { ComplianceChatEvent, ComplianceChatParams } from "./compliance-chat";

// ── Compliance Audit (async generator for pack-by-pack pipeline) ──
export { runComplianceAudit } from "./compliance-audit";
export type { ComplianceAuditEvent } from "./compliance-audit";

// ── Skill Generator ──
export { generateSkill } from "./skill-generator";
export type { GenerateSkillParams, GenerateSkillResult } from "./skill-generator";


