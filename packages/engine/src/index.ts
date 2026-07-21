// ── Config / Database ──
export { getDb, setDb } from "./agent/shared/memory/database";
export { setLLMConfig, getConfig, setRetentionConfig } from "./agent/llm/config";
export { setRegulationApi, getRegulationApi } from "./agent/knowledge/regulation-api";
export { setDocStore } from "./agent/user-info/vector-store";

// ── Session Management ──
export {
  getOrCreateSession,
  ensureComplianceSession,
  getComplianceSession,
  deleteSession,
  setComplianceComments,
  getComplianceComments,
  getConversationHistory,
  getResponsesForSession,
  getSessionFiles,
  setComplianceToolCalls,
  getComplianceToolCalls,
} from "./agent/shared/memory/repository";

export { buildSession } from "./compliance-session";
export type { ComplianceSession, ValidationCheck, Questionnaire } from "./compliance-session";

// ── Packs ──
export { searchPacks, getPack, readPackContent, writePack, appendPackLessons } from "./compliance-packs";
export type { CreatePackInput } from "./compliance-packs";
export { listPacks, loadPack } from "./agent/loading/skill/loader";
export type { SkillPack, PackCheck, PackField, DocumentTemplate } from "./agent/loading/skill/loader";

// ── Tool Registry ──
export { TOOL_DEFS, ToolSchemas, getTool, TOP_LEVEL_TOOLS, PACK_DESIGNER_TOOLS } from "./compliance-tools";
export type { ToolDef, ToolName, ToolInput } from "./compliance-tools";

// ── Tool Implementations ──
export { executeComplianceCheck } from "./agent/pipeline/builtins";
export { buildComplianceStepPrompt } from "./orchestration/prompts";
export type { SessionState, PackAuditItem } from "./orchestration/prompts";
export { runScript } from "./agent/pipeline/executors/script-runner";

// ── Export ──
export { generateDocx } from "./agent/present/export/export-docx";

// ── Chat ──
export { complianceChat } from "./orchestration/chat";
export type { ComplianceChatEvent, ComplianceChatParams } from "./orchestration/chat";
export { resolveCitation } from "./orchestration/audit-tools";

// ── Shared Types ──
export type { AgentResponse } from "./agent/shared/types";
export type { IRegulationApi } from "./agent/knowledge/regulation-api";
export type { SeedRegulationRequest, SeedRegulationResponse } from "./agent/knowledge/regulation-types";
