import { getDb } from "../../shared/memory/database";
import type { AgentResponse } from "../../shared/types";
import type { Citation } from "../../shared/schemas";
import type { ParsedCheck } from "../../loading/skill/check-parser";
import type { ExecutableStep } from "../../pipeline/types";
import type { UploadedFileEntry } from "../../pipeline/slices/file-registry";

const EMBEDDING_MODEL = "text-embedding-3-small";

export async function getEmbedding(text: string): Promise<Float32Array | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const truncated = text.length > 8000 ? text.slice(0, 8000) : text;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: truncated, model: EMBEDDING_MODEL }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return new Float32Array(data.data[0].embedding);
  } catch {
    return null;
  }
}

export async function getEmbeddings(texts: string[]): Promise<(Float32Array | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || texts.length === 0) return texts.map(() => null);

  const batchSize = 20;
  const results: (Float32Array | null)[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) =>
      t.length > 8000 ? t.slice(0, 8000) : t
    );
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: batch, model: EMBEDDING_MODEL }),
      });
      if (!res.ok) {
        results.push(...batch.map(() => null));
        continue;
      }
      const data = await res.json();
      const sorted = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
      results.push(...sorted.map((d: { embedding: number[] }) => new Float32Array(d.embedding)));
    } catch {
      results.push(...batch.map(() => null));
    }
  }
  return results;
}

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
  chunks: { id: string; text: string; html?: string; pageNumber?: number; bbox?: unknown; wordBoxes?: unknown; pageWidth?: number; pageHeight?: number }[],
  embeddings?: (Float32Array | null)[]
): string[] {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO chunk_store (id, session_id, file_id, text, chunk_html, page_number, bbox_json, word_boxes_json, page_width, page_height, ocr_confidence, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const ids: string[] = [];
  const insert = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const id = `${sessionId}_${fileId}_${i}`;
      ids.push(id);
      const emb = embeddings?.[i];
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
        emb instanceof Float32Array ? Buffer.from(emb.buffer) : null,
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

export function deleteChunksBySession(sessionId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chunk_store WHERE session_id = ?").run(sessionId);
  try { db.prepare("DELETE FROM chunk_fts WHERE session_id = ?").run(sessionId); } catch { /* no FTS5 */ }
}

export function deleteChunksByFile(sessionId: string, fileId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM chunk_store WHERE session_id = ? AND file_id = ?").run(sessionId, fileId);
  try { db.prepare("DELETE FROM chunk_fts WHERE session_id = ? AND file_id = ?").run(sessionId, fileId); } catch { /* no FTS5 */ }
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

export function searchChunksVec(
  sessionId: string,
  queryEmbedding: Float32Array,
  limit = 10
): { fileId: string; text: string; distance: number }[] {
  const db = getDb();
  try {
    const buf = Buffer.from(queryEmbedding.buffer);
    const rows = db
      .prepare(
        `SELECT file_id, text, vec_distance_cos(embedding, ?) as distance
         FROM chunk_store
         WHERE embedding IS NOT NULL AND session_id = ?
         ORDER BY distance
         LIMIT ?`
      )
      .all(buf, sessionId, limit) as { file_id: string; text: string; distance: number }[];
    return rows.map((r) => ({ fileId: r.file_id, text: r.text, distance: r.distance }));
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

export function addAssistantMessage(sessionId: string, content: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)"
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

export function addToolMessage(sessionId: string, content: string): void {
  getDb()
    .prepare("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'tool', ?, ?)")
    .run(sessionId, content, Date.now());
}

export function getConversationHistory(
  sessionId: string
): { role: "user" | "assistant" | "tool"; content: string }[] {
  const db = getDb();
  return db
    .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId) as { role: "user" | "assistant" | "tool"; content: string }[];
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
  const incoming: { fileId: string; filename: string }[] = JSON.parse(chunksJson);
  const existing: { fileId: string; filename: string }[] = JSON.parse(getFileChunks(sessionId));
  const incomingIds = new Set(incoming.map((f) => f.fileId));
  const merged = [...existing.filter((f) => !incomingIds.has(f.fileId)), ...incoming];
  db.prepare("UPDATE sessions SET file_chunks = ? WHERE id = ?").run(JSON.stringify(merged), sessionId);
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

// ── Compliance Session (v2 workflow state) ──

export interface DocFieldValue {
  value: string;
  sourceCitation?: string[];
  citationRef?: string[];
}

export interface TestPlanEntry {
  checkId: string;
  status: "pending" | "planned" | "submitted" | "pass" | "fail";
  standardProcedure?: string;
  adaptedProcedure?: string;
  resultSummary?: string;
}

export interface ComplianceSessionData {
  id: string;
  step: 1 | 2 | 3;
  selectedPackIds: string[];
  docData: Record<string, DocFieldValue>;
  auditResults: { packId: string; items: { name: string; desc: string; status: string; statusLabel: string; checks: { name: string; pass: boolean }[] }[] }[];
  auditRunning: boolean;
  auditDone: boolean;
  precheckDone: boolean;
  agentResponses: Record<string, string>;
  validationChecks: { id: string; title: string; status: string; note: string }[];
  validationScore: number;
  packStates: Record<string, unknown>;
  documentsFinalized: boolean;
  comments: string;
  toolCalls: { tool: string; result: unknown }[];
  testPlans: TestPlanEntry[];
}

export function getComplianceSession(sessionId: string): ComplianceSessionData | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM compliance_session WHERE session_id = ?").get(sessionId) as {
    session_id: string;
    step: number;
    selected_pack_ids: string;
    doc_data: string;
    audit_results: string;
    audit_running: number;
    audit_done: number;
    precheck_done: number;
    agent_responses: string;
    comments: string;
    validation_checks: string;
    validation_score: number;
    pack_states: string;
    documents_finalized: number;
    tool_calls: string;
  } | undefined;
  if (!row) return null;
  return {
    id: row.session_id,
    step: (row.step as 1 | 2 | 3),
    selectedPackIds: safeJsonParse(row.selected_pack_ids, []),
    docData: safeJsonParse(row.doc_data, {}),
    auditResults: safeJsonParse(row.audit_results, []),
    auditRunning: row.audit_running === 1,
    auditDone: row.audit_done === 1,
    precheckDone: row.precheck_done === 1,
    agentResponses: safeJsonParse(row.agent_responses, {}),
    validationChecks: safeJsonParse(row.validation_checks, []),
    validationScore: row.validation_score ?? 0,
    packStates: safeJsonParse(row.pack_states, {}),
    documentsFinalized: row.documents_finalized === 1,
    comments: row.comments ?? "[]",
    toolCalls: safeJsonParse(row.tool_calls, []),
    testPlans: safeJsonParse((row as any).test_plans, []),
  };
}

export function ensureComplianceSession(sessionId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO compliance_session (session_id, step, selected_pack_ids, doc_data, audit_results, audit_running, audit_done, precheck_done, pack_states, tool_calls, updated_at)
     VALUES (?, 1, '[]', '{}', '[]', 0, 0, 0, '{}', '[]', ?)`
  ).run(sessionId, Date.now());
}

export function setComplianceTestPlans(sessionId: string, testPlans: TestPlanEntry[]): void {
  getDb().prepare("UPDATE compliance_session SET test_plans = ?, updated_at = ? WHERE session_id = ?")
    .run(JSON.stringify(testPlans), Date.now(), sessionId);
}

export function getComplianceTestPlans(sessionId: string): TestPlanEntry[] {
  const session = getComplianceSession(sessionId);
  return session?.testPlans ?? [];
}

export function updateComplianceTestPlan(sessionId: string, checkId: string, update: { status?: TestPlanEntry["status"]; standardProcedure?: string; adaptedProcedure?: string; resultSummary?: string }): void {
  const plans = getComplianceTestPlans(sessionId);
  const idx = plans.findIndex((p) => p.checkId === checkId);
  if (idx >= 0) {
    const existing = plans[idx]!;
    plans[idx] = { checkId, status: update.status ?? existing.status, standardProcedure: update.standardProcedure ?? existing.standardProcedure, adaptedProcedure: update.adaptedProcedure ?? existing.adaptedProcedure, resultSummary: update.resultSummary ?? existing.resultSummary };
  } else {
    plans.push({ checkId, status: update.status ?? "pending", standardProcedure: update.standardProcedure, adaptedProcedure: update.adaptedProcedure, resultSummary: update.resultSummary });
  }
  setComplianceTestPlans(sessionId, plans);
}

export function setComplianceStep(sessionId: string, step: 1 | 2 | 3): void {
  getDb().prepare("UPDATE compliance_session SET step = ?, updated_at = ? WHERE session_id = ?").run(step, Date.now(), sessionId);
}

export function setComplianceScope(sessionId: string, packIds: string[]): void {
  getDb().prepare("UPDATE compliance_session SET selected_pack_ids = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(packIds), Date.now(), sessionId);
}

export function setComplianceDocData(sessionId: string, docData: Record<string, DocFieldValue>): void {
  getDb().prepare("UPDATE compliance_session SET doc_data = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(docData), Date.now(), sessionId);
}

export function addComplianceDocField(sessionId: string, field: string, value: DocFieldValue): void {
  const db = getDb();
  const session = getComplianceSession(sessionId);
  if (!session) return;
  const docData = { ...session.docData, [field]: value };
  setComplianceDocData(sessionId, docData);
}

export type ComplianceFile = { name: string; size: string; time: string; _generated?: boolean; docType?: string };

export function addComplianceFile(sessionId: string, file: ComplianceFile): void {
  const db = getDb();
  const session = getComplianceSession(sessionId);
  if (!session) return;
  const existing = safeJsonParse(getSessionFiles(sessionId), []) as ComplianceFile[];
  const idx = existing.findIndex((f) => f.name === file.name);
  if (idx >= 0) {
    existing[idx] = file;
  } else {
    existing.push(file);
  }
  saveSessionFiles(sessionId, JSON.stringify(existing));
}

export function getComplianceFiles(sessionId: string): ComplianceFile[] {
  return safeJsonParse(getSessionFiles(sessionId), []);
}

export function removeComplianceFile(sessionId: string, fileName: string): void {
  const files = getComplianceFiles(sessionId);
  const filtered = files.filter((f) => f.name !== fileName);
  saveSessionFiles(sessionId, JSON.stringify(filtered));
}

export function setComplianceAuditRunning(sessionId: string, running: boolean): void {
  const db = getDb();
  db.prepare("UPDATE compliance_session SET audit_running = ?, updated_at = ? WHERE session_id = ?").run(running ? 1 : 0, Date.now(), sessionId);
}

export function setComplianceAuditDone(sessionId: string, done: boolean): void {
  const db = getDb();
  db.prepare("UPDATE compliance_session SET audit_done = ?, updated_at = ? WHERE session_id = ?").run(done ? 1 : 0, Date.now(), sessionId);
}

export function clearComplianceAuditResults(sessionId: string): void {
  const db = getDb();
  db.prepare("UPDATE compliance_session SET audit_results = '[]', audit_done = 0, updated_at = ? WHERE session_id = ?").run(Date.now(), sessionId);
}

export function setCompliancePackAuditResult(
  sessionId: string,
  packId: string,
  items: { name: string; desc: string; status: string; statusLabel: string; checks: { name: string; pass: boolean }[] }[]
): void {
  const db = getDb();
  const session = getComplianceSession(sessionId);
  if (!session) return;
  const results = session.auditResults.filter((r) => r.packId !== packId);
  results.push({ packId, items });
  db.prepare("UPDATE compliance_session SET audit_results = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(results), Date.now(), sessionId);
}

export function setComplianceValidation(sessionId: string, checks: { id: string; title: string; status: string; note: string }[], score: number): void {
  getDb().prepare("UPDATE compliance_session SET validation_checks = ?, validation_score = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(checks), score, Date.now(), sessionId);
}

export function setComplianceDocumentsFinalized(sessionId: string, finalized: boolean): void {
  getDb().prepare("UPDATE compliance_session SET documents_finalized = ?, updated_at = ? WHERE session_id = ?").run(finalized ? 1 : 0, Date.now(), sessionId);
}

export function setComplianceComments(sessionId: string, commentsJson: string): void {
  getDb().prepare("UPDATE compliance_session SET comments = ?, updated_at = ? WHERE session_id = ?").run(commentsJson, Date.now(), sessionId);
}

export function getComplianceComments(sessionId: string): string {
  const row = getDb().prepare("SELECT comments FROM compliance_session WHERE session_id = ?").get(sessionId) as { comments: string } | undefined;
  return row?.comments ?? "[]";
}

export function setComplianceAgentResponse(sessionId: string, packId: string, responseJson: string): void {
  const db = getDb();
  const session = getComplianceSession(sessionId);
  if (!session) return;
  const responses = { ...session.agentResponses, [packId]: responseJson };
  db.prepare("UPDATE compliance_session SET agent_responses = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(responses), Date.now(), sessionId);
}

export function setCompliancePackStates(sessionId: string, packStates: Record<string, unknown>): void {
  getDb().prepare("UPDATE compliance_session SET pack_states = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(packStates), Date.now(), sessionId);
}

export function getCompliancePackStates(sessionId: string): Record<string, unknown> {
  const session = getComplianceSession(sessionId);
  return session?.packStates ?? {};
}

export function setComplianceToolCalls(sessionId: string, toolCallsData: { tool: string; result: unknown }[]): void {
  getDb().prepare("UPDATE compliance_session SET tool_calls = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(toolCallsData), Date.now(), sessionId);
}

export function getComplianceToolCalls(sessionId: string): { tool: string; result: unknown }[] {
  const db = getDb();
  const row = db.prepare("SELECT tool_calls FROM compliance_session WHERE session_id = ?").get(sessionId) as { tool_calls: string } | undefined;
  if (!row) return [];
  try { return JSON.parse(row.tool_calls); } catch { return []; }
}


