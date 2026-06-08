import { getDb } from "../../shared/memory/database";
import type { AgentResponse } from "../../shared/types";
import type { Citation } from "../../shared/schemas";
import type { ParsedCheck } from "../../loading/skill/check-parser";
import type { ExecutableStep } from "../../pipeline/types";
import type { UploadedFileEntry } from "../../pipeline/slices/file-registry";

function safeJsonParse<T>(json: string, fallback?: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return (fallback ?? undefined) as T;
  }
}

export function getOrCreateSession(sessionId: string, skillName: string, tenantId?: string, userId?: string, userEmail?: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO sessions (id, skill_name, tenant_id, user_id, user_email, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(sessionId, skillName, tenantId ?? "", userId ?? "", userEmail ?? "", Date.now());
}

// ── Chunk Store ──

export function saveChunks(
  sessionId: string,
  fileId: string,
  chunks: { id: string; text: string; html?: string; pageNumber?: number; bbox?: unknown; wordBoxes?: unknown; pageWidth?: number; pageHeight?: number }[]
): string[] {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO chunk_store (id, session_id, file_id, text, chunk_html, page_number, bbox_json, word_boxes_json, page_width, page_height, ocr_confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const ids: string[] = [];
  const insert = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const id = `${sessionId}_${fileId}_${i}`;
      ids.push(id);
      stmt.run(
        id,
        sessionId,
        fileId,
        chunks[i]!.text,
        chunks[i]!.html ?? null,
        chunks[i]!.pageNumber ?? null,
        chunks[i]!.bbox ? JSON.stringify(chunks[i]!.bbox) : null,
        chunks[i]!.wordBoxes ? JSON.stringify(chunks[i]!.wordBoxes) : null,
        chunks[i]!.pageWidth ?? null,
        chunks[i]!.pageHeight ?? null,
        null,
        Date.now()
      );
      indexChunkFts5(sessionId, fileId, i + 1, chunks[i]!.text);
    }
  });
  insert();
  return ids;
}

interface StoredChunkRow {
  id: string;
  fileId: string;
  text: string;
  chunkHtml?: string | null;
  pageNumber?: number;
  bboxJson?: string | null;
  wordBoxesJson?: string | null;
  pageWidth?: number | null;
  pageHeight?: number | null;
}

export interface StoredChunk {
  id: string;
  fileId: string;
  text: string;
  html?: string;
  pageNumber?: number;
  bbox?: unknown;
  wordBoxes?: unknown;
  pageWidth?: number;
  pageHeight?: number;
}

function hydrateStoredChunk(row: StoredChunkRow): StoredChunk {
  return {
    id: row.id,
    fileId: row.fileId,
    text: row.text,
    html: row.chunkHtml ?? undefined,
    pageNumber: row.pageNumber ?? undefined,
    bbox: row.bboxJson ? safeJsonParse(row.bboxJson) : undefined,
    wordBoxes: row.wordBoxesJson ? safeJsonParse(row.wordBoxesJson) : undefined,
    pageWidth: row.pageWidth ?? undefined,
    pageHeight: row.pageHeight ?? undefined,
  };
}

export function getChunksByIds(ids: string[]): StoredChunk[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, file_id as fileId, text, chunk_html as chunkHtml, page_number as pageNumber, bbox_json as bboxJson, word_boxes_json as wordBoxesJson, page_width as pageWidth, page_height as pageHeight FROM chunk_store WHERE id IN (${placeholders})`
    )
    .all(...ids) as StoredChunkRow[];
  return rows.map(hydrateStoredChunk);
}

export function getChunksBySession(sessionId: string): StoredChunk[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, file_id as fileId, text, chunk_html as chunkHtml, page_number as pageNumber, bbox_json as bboxJson, word_boxes_json as wordBoxesJson, page_width as pageWidth, page_height as pageHeight FROM chunk_store WHERE session_id = ?")
    .all(sessionId) as StoredChunkRow[];
  return rows.map(hydrateStoredChunk);
}

export function deleteChunksBySession(sessionId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chunk_store WHERE session_id = ?").run(sessionId);
  try { db.prepare("DELETE FROM chunk_fts WHERE session_id = ?").run(sessionId); } catch { /* no FTS5 */ }
}

export interface Fts5Result {
  fileId: string;
  chunkIdx: number;
  text: string;
  rank: number;
}

/**
 * Search chunks using FTS5 full-text search.
 * Returns up to `limit` chunks ranked by relevance, ordered by rank ascending.
 * Falls back to empty array if FTS5 is unavailable.
 */
export function searchChunksFts5(
  sessionId: string,
  query: string,
  limit = 10
): Fts5Result[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT file_id, chunk_idx, text, rank
         FROM chunk_fts
         WHERE chunk_fts MATCH ? AND session_id = ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, sessionId, limit) as { file_id: string; chunk_idx: number; text: string; rank: number }[];
    return rows.map((r) => ({ fileId: r.file_id, chunkIdx: r.chunk_idx, text: r.text, rank: r.rank }));
  } catch {
    return [];
  }
}

export function indexChunkFts5(
  sessionId: string,
  fileId: string,
  chunkIdx: number,
  text: string
): void {
  try {
    getDb()
      .prepare("INSERT INTO chunk_fts (session_id, file_id, chunk_idx, text) VALUES (?, ?, ?, ?)")
      .run(sessionId, fileId, chunkIdx, text);
  } catch { /* no FTS5 — silently skip */ }
}

export function addUserMessage(sessionId: string, content: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'user', ?, ?)"
  ).run(sessionId, content, Date.now());
}

export function addAssistantResponse(sessionId: string, response: AgentResponse): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)"
  ).run(sessionId, response.content, Date.now());

  db.prepare(
    `INSERT INTO responses (session_id, content, reasoning, citations_json, verdict, round, sections_json, source_citations_json, clause_texts_json, tool_calls_json, reasoning_steps_json, claims_json, confidence_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    response.content,
    response.reasoning,
    JSON.stringify(response.citations),
    response.verdict ?? "",
    response.round,
    response.sections ? JSON.stringify(response.sections) : null,
    response.sourceCitations ? JSON.stringify(response.sourceCitations) : null,
    response.clauseTexts ? JSON.stringify(response.clauseTexts) : null,
    response.toolCalls ? JSON.stringify(response.toolCalls) : null,
    response.reasoningSteps ? JSON.stringify(response.reasoningSteps) : null,
    response.claims ? JSON.stringify(response.claims) : null,
    response.confidence ? JSON.stringify(response.confidence) : null,
    Date.now()
  );
}

export function getConversationHistory(
  sessionId: string
): { role: "user" | "assistant"; content: string }[] {
  const db = getDb();
  return db
    .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId) as { role: "user" | "assistant"; content: string }[];
}

export function getResponseCount(sessionId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM responses WHERE session_id = ?")
    .get(sessionId) as { count: number };
  return row?.count ?? 0;
}

export function saveFileChunks(sessionId: string, chunksJson: string): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET file_chunks = ? WHERE id = ?").run(chunksJson, sessionId);
}

export function getFileChunks(sessionId: string): string {
  const db = getDb();
  const row = db.prepare("SELECT file_chunks FROM sessions WHERE id = ?").get(sessionId) as { file_chunks: string } | undefined;
  return row?.file_chunks ?? "[]";
}

export function saveSessionFiles(sessionId: string, filesJson: string): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET session_files = ? WHERE id = ?").run(filesJson, sessionId);
}

export function getSessionFiles(sessionId: string): string {
  const db = getDb();
  const row = db.prepare("SELECT session_files FROM sessions WHERE id = ?").get(sessionId) as { session_files: string } | undefined;
  return row?.session_files ?? "[]";
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chunk_store WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM context_snapshots WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM responses WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function getRecentMemories(skillName: string, limit = 5): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT content FROM messages
       WHERE role = 'assistant'
       AND session_id IN (SELECT id FROM sessions WHERE skill_name = ?)
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(skillName, limit) as { content: string }[];
  return rows.map((r) => r.content.slice(0, 120));
}

export function getSessionMeta(sessionId: string): { skillName: string } | null {
  const db = getDb();
  const row = db.prepare("SELECT skill_name FROM sessions WHERE id = ?").get(sessionId) as { skill_name: string } | undefined;
  return row ? { skillName: row.skill_name } : null;
}

export function getAllSessions(tenantId?: string, userId?: string): {
  id: string;
  skillName: string;
  verdict: string;
  timestamp: number;
  starred: boolean;
  shared: boolean;
  userEmail: string;
  confidenceScore?: number;
  confidenceColor?: string;
  needsExpert?: boolean;
}[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        s.id, s.skill_name, s.created_at, s.starred, s.shared, s.user_email,
        (SELECT verdict FROM responses WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as verdict,
        (SELECT confidence_json FROM responses WHERE session_id = s.id AND confidence_json IS NOT NULL ORDER BY id DESC LIMIT 1) as confidence_json
      FROM sessions s
      ${
        tenantId && userId
          ? "WHERE s.tenant_id = ? AND (s.user_id = ? OR s.shared = 1)"
          : tenantId
            ? "WHERE s.tenant_id = ?"
            : ""
      }
      ORDER BY s.created_at DESC`
    )
    .all(...(tenantId && userId ? [tenantId, userId] : tenantId ? [tenantId] : [])) as {
    id: string;
    skill_name: string;
    created_at: number;
    starred: number;
    shared: number;
    user_email: string;
    verdict: string | null;
    confidence_json: string | null;
  }[];

  return rows.map((r) => {
    let confidenceScore: number | undefined;
    let confidenceColor: string | undefined;
    let needsExpert: boolean | undefined;
    if (r.confidence_json) {
      try {
        const c = JSON.parse(r.confidence_json);
        confidenceScore = c.score;
        needsExpert = c.needsExpert;
        if (c.score >= 99) confidenceColor = "#1a7f37";
        else if (c.score >= 80) confidenceColor = "#3fb950";
        else if (c.score >= 50) confidenceColor = "#d29922";
        else confidenceColor = "#f85149";
      } catch {
          console.warn("[repository] corrupt confidence_json in response", r.id);
        }
    }
    return {
      id: r.id,
      skillName: r.skill_name,
      verdict: r.verdict ?? "UNKNOWN",
      timestamp: r.created_at,
      starred: (r.starred ?? 0) === 1,
      shared: (r.shared ?? 0) === 1,
      userEmail: r.user_email ?? "",
      confidenceScore,
      confidenceColor,
    };
  });
}

export function getResponsesForSession(sessionId: string): {
  content: string;
  reasoning: string;
  citations: Citation[];
  verdict: string;
  round: number;
  sections?: Record<string, Record<string, string> | string>;
  sourceCitations?: { ref: number; fileId: string; filename: string; extractedText: string; keyExcerpt: string; fileUrl?: string; pageNumber?: number; chunks?: { id: string; text: string; bbox?: { x: number; y: number; width: number; height: number }; wordBoxes?: { x: number; y: number; width: number; height: number }[]; pageNumber?: number; pageWidth?: number; pageHeight?: number }[] }[];
  clauseTexts?: Record<string, string>;
  toolCalls?: { step: number; toolName: string; summary: string; status: string }[];
  reasoningSteps?: { stepNumber: number; title: string; body: string; subStep?: number }[];
  claims?: { statement: string; citationRef: string; sourceCitation?: string }[];
  confidence?: { score: number; ocrConfidence: number; dataCompleteness?: number; llmMultiplier: number; llmReasoning: string; needsExpert: boolean };
  createdAt: number;
}[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT content, reasoning, citations_json, verdict, round, sections_json, source_citations_json, clause_texts_json, tool_calls_json, reasoning_steps_json, claims_json, confidence_json, created_at FROM responses WHERE session_id = ? ORDER BY id ASC"
    )
    .all(sessionId) as {
    content: string;
    reasoning: string;
    citations_json: string;
    verdict: string;
    round: number;
    sections_json: string | null;
    source_citations_json: string | null;
    clause_texts_json: string | null;
    tool_calls_json: string | null;
    reasoning_steps_json: string | null;
    claims_json: string | null;
    confidence_json: string | null;
    created_at: number;
  }[];
  return rows.map((r) => ({
    content: r.content,
    reasoning: r.reasoning,
    citations: safeJsonParse(r.citations_json, []),
    verdict: r.verdict,
    round: r.round,
    sections: r.sections_json ? safeJsonParse(r.sections_json) : undefined,
    sourceCitations: r.source_citations_json ? safeJsonParse(r.source_citations_json) : undefined,
    clauseTexts: r.clause_texts_json ? safeJsonParse(r.clause_texts_json) : undefined,
    toolCalls: r.tool_calls_json ? safeJsonParse(r.tool_calls_json) : undefined,
    reasoningSteps: r.reasoning_steps_json ? safeJsonParse(r.reasoning_steps_json) : undefined,
    claims: r.claims_json ? safeJsonParse(r.claims_json) : undefined,
    confidence: r.confidence_json ? safeJsonParse(r.confidence_json) : undefined,
    createdAt: r.created_at,
  }));
}

// ── Session Setup ──

export interface SessionSetupData {
  skillName: string;
  skillmd: string;
  checks: ParsedCheck[];
  scripts: { name: string; path: string; desc: string; params: string }[];
  regulationIds: string[];
  steps: ExecutableStep[];
  fileRegistry: UploadedFileEntry[];
}

export function saveSessionSetup(sessionId: string, data: SessionSetupData): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO session_setup
     (session_id, skill_name, skillmd, checks_json, scripts_json, regulation_ids_json,
      steps_json, file_registry_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    data.skillName,
    data.skillmd,
    JSON.stringify(data.checks),
    JSON.stringify(data.scripts),
    JSON.stringify(data.regulationIds),
    JSON.stringify(data.steps),
    JSON.stringify(data.fileRegistry),
    Date.now()
  );
  db.prepare("UPDATE sessions SET is_setup = 1 WHERE id = ?").run(sessionId);
}

export function loadSessionSetup(sessionId: string): SessionSetupData | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM session_setup WHERE session_id = ?").get(sessionId) as {
    skill_name: string;
    skillmd: string;
    checks_json: string;
    scripts_json: string | null;
    regulation_ids_json: string | null;
    steps_json: string;
    file_registry_json: string;
  } | undefined;
  if (!row) return null;
  return {
    skillName: row.skill_name,
    skillmd: row.skillmd,
    checks: safeJsonParse(row.checks_json, []),
    scripts: safeJsonParse(row.scripts_json ?? "[]", []),
    regulationIds: safeJsonParse(row.regulation_ids_json ?? "[]", []),
    steps: safeJsonParse(row.steps_json, []),
    fileRegistry: safeJsonParse(row.file_registry_json, []),
  };
}

export function hasSessionSetup(sessionId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 as exists_flag FROM session_setup WHERE session_id = ?").get(sessionId) as { exists_flag: number } | undefined;
  return !!row;
}

// ── Context Snapshots ──

export interface ContextSnapshot {
  sessionId: string;
  turnNumber: number;
  stepNumber: number;
  stepTitle: string;
  stepType: string;
  systemPrompt: string;
  userMessage: string;
  contextSummary: string;
  skillmd: string;
  templateJson: string | null;
  loadedReferences: string;
  uploadedFilesJson: string;
  stepOutputsJson: string;
}

export function saveContextSnapshot(snapshot: ContextSnapshot): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO context_snapshots (session_id, turn_number, step_number, step_title, step_type, system_prompt, user_message, context_summary, skillmd, template_json, loaded_references, uploaded_files_json, step_outputs_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    snapshot.sessionId,
    snapshot.turnNumber,
    snapshot.stepNumber,
    snapshot.stepTitle,
    snapshot.stepType,
    snapshot.systemPrompt,
    snapshot.userMessage,
    snapshot.contextSummary,
    snapshot.skillmd,
    snapshot.templateJson,
    snapshot.loadedReferences,
    snapshot.uploadedFilesJson,
    snapshot.stepOutputsJson,
    Date.now()
  );
}

export function getContextSnapshots(sessionId: string): ContextSnapshot[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM context_snapshots WHERE session_id = ? ORDER BY id ASC"
    )
    .all(sessionId) as {
      session_id: string;
      turn_number: number;
      step_number: number;
      step_title: string;
      step_type: string;
      system_prompt: string;
      user_message: string;
      context_summary: string;
      skillmd: string;
      template_json: string | null;
      loaded_references: string;
      uploaded_files_json: string;
      step_outputs_json: string;
      created_at: number;
    }[];
  return rows.map((r) => ({
    sessionId: r.session_id,
    turnNumber: r.turn_number,
    stepNumber: r.step_number,
    stepTitle: r.step_title,
    stepType: r.step_type,
    systemPrompt: r.system_prompt,
    userMessage: r.user_message,
    contextSummary: r.context_summary,
    skillmd: r.skillmd,
    templateJson: r.template_json,
    loadedReferences: r.loaded_references,
    uploadedFilesJson: r.uploaded_files_json,
    stepOutputsJson: r.step_outputs_json,
  }));
}

// ── Starring ──

export function toggleStar(sessionId: string, starred: boolean): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET starred = ? WHERE id = ?").run(starred ? 1 : 0, sessionId);
}

export function toggleShare(sessionId: string, shared: boolean): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET shared = ? WHERE id = ?").run(shared ? 1 : 0, sessionId);
}

// ── Lesson Overrides ──

export function saveLessonOverride(skillId: string, lessonText: string, tenantId?: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO lesson_overrides (skill_id, tenant_id, lesson_text, created_at) VALUES (?, ?, ?, ?)"
  ).run(skillId, tenantId ?? "", lessonText, Date.now());
}

export function getLessonOverrides(skillId: string, tenantId?: string): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT lesson_text FROM lesson_overrides
       WHERE skill_id = ? AND (tenant_id = ? OR tenant_id = '')
       ORDER BY created_at ASC`
    )
    .all(skillId, tenantId ?? "") as { lesson_text: string }[];
  return rows.map((r) => r.lesson_text);
}

// ── User-Created Skills ──

export interface UserSkillRow {
  name: string;
  description: string;
  skillmd: string;
  checksJson: string;
  regulationIdsJson: string;
  redline: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export function saveUserSkill(params: {
  name: string;
  description: string;
  skillmd: string;
  checks: { field: string; type: { kind: string; values?: string[] }; description?: string; clause?: string; constraint?: string; dependsOn?: string; sample?: string; attention?: string }[];
  regulationIds: string[];
  redline?: string;
  tenantId?: string;
  createdBy?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO user_skills (name, description, skillmd, checks_json, regulation_ids_json, redline, tenant_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM user_skills WHERE name = ?), ?), ?)`
  ).run(
    params.name,
    params.description,
    params.skillmd,
    JSON.stringify(params.checks),
    JSON.stringify(params.regulationIds),
    params.redline ?? "",
    params.tenantId ?? "",
    params.createdBy ?? "",
    params.name,
    Date.now(),
    Date.now(),
  );
}

export function deleteUserSkill(name: string): void {
  getDb().prepare("DELETE FROM user_skills WHERE name = ?").run(name);
}

export function listUserSkillNames(): string[] {
  const rows = getDb()
    .prepare("SELECT name FROM user_skills ORDER BY updated_at DESC")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function listUserSkillNamesByTenant(tenantId: string): string[] {
  const rows = getDb()
    .prepare("SELECT name FROM user_skills WHERE tenant_id = ? ORDER BY updated_at DESC")
    .all(tenantId) as { name: string }[];
  return rows.map((r) => r.name);
}

export function loadUserSkill(name: string): UserSkillRow | null {
  const row = getDb()
    .prepare("SELECT * FROM user_skills WHERE name = ?")
    .get(name) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    name: row.name as string,
    description: row.description as string,
    skillmd: row.skillmd as string,
    checksJson: row.checks_json as string,
    regulationIdsJson: row.regulation_ids_json as string,
    redline: (row.redline as string) ?? "",
    createdBy: row.created_by as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}
