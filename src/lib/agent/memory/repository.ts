import { getDb } from "@/lib/agent/memory/database";
import type { AgentResponse } from "@/lib/agent/types";
import type { Citation } from "@/lib/agent/schemas";

export function getOrCreateSession(sessionId: string, skillName: string): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
  if (!existing) {
    db.prepare("INSERT INTO sessions (id, skill_name, created_at) VALUES (?, ?, ?)").run(
      sessionId,
      skillName,
      Date.now()
    );
  }
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
    response.verdict,
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

export function saveFileContents(sessionId: string, fileContents: string): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET file_contents = ? WHERE id = ?").run(fileContents, sessionId);
}

export function getFileContents(sessionId: string): string {
  const db = getDb();
  const row = db.prepare("SELECT file_contents FROM sessions WHERE id = ?").get(sessionId) as { file_contents: string | null } | undefined;
  return row?.file_contents ?? "";
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

export function deleteSession(sessionId: string): void {
  const db = getDb();
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

export function getAllSessions(): {
  id: string;
  skillName: string;
  title: string;
  verdict: string;
  lastMessage: string;
  roundCount: number;
  timestamp: number;
  starred: boolean;
  confidenceScore?: number;
  confidenceColor?: string;
  needsExpert?: boolean;
}[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        s.id, s.skill_name, s.created_at, s.starred,
        (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY id ASC LIMIT 1) as first_msg,
        (SELECT content FROM messages WHERE session_id = s.id AND role = 'assistant' ORDER BY id DESC LIMIT 1) as last_msg,
        (SELECT verdict FROM responses WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as verdict,
        (SELECT confidence_json FROM responses WHERE session_id = s.id AND confidence_json IS NOT NULL ORDER BY id DESC LIMIT 1) as confidence_json,
        (SELECT COUNT(*) FROM responses WHERE session_id = s.id) as round_count
      FROM sessions s
      ORDER BY s.created_at DESC`
    )
    .all() as {
    id: string;
    skill_name: string;
    created_at: number;
    starred: number;
    first_msg: string | null;
    last_msg: string | null;
    verdict: string | null;
    confidence_json: string | null;
    round_count: number;
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
      } catch { /* ignore corrupt JSON */ }
    }
    return {
      id: r.id,
      skillName: r.skill_name,
      title: (r.first_msg ?? "").slice(0, 60),
      verdict: r.verdict ?? "UNKNOWN",
      lastMessage: (r.last_msg ?? "").slice(0, 100),
      roundCount: r.round_count ?? 0,
      timestamp: r.created_at,
      starred: (r.starred ?? 0) === 1,
      confidenceScore,
      confidenceColor,
      needsExpert,
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
  sourceCitations?: { ref: number; fileId: string; filename: string; extractedText: string; keyExcerpt: string; fileUrl?: string; pageNumber?: number; chunks?: { id: string; text: string; bbox?: { x: number; y: number; width: number; height: number }; wordBoxes?: { x: number; y: number; width: number; height: number }[]; pageNumber?: number }[] }[];
  clauseTexts?: Record<string, string>;
  toolCalls?: { step: number; toolName: string; summary: string; status: string }[];
  reasoningSteps?: { stepNumber: number; title: string; body: string; subStep?: number }[];
  claims?: { statement: string; citationRef: string; sourceRef?: number; chunkRef?: string }[];
  confidence?: { score: number; ocrConfidence: number; dataCompleteness: number; llmMultiplier: number; llmReasoning: string; needsExpert: boolean };
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
    citations: JSON.parse(r.citations_json),
    verdict: r.verdict,
    round: r.round,
    sections: r.sections_json ? JSON.parse(r.sections_json) : undefined,
    sourceCitations: r.source_citations_json ? JSON.parse(r.source_citations_json) : undefined,
    clauseTexts: r.clause_texts_json ? JSON.parse(r.clause_texts_json) : undefined,
    toolCalls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : undefined,
    reasoningSteps: r.reasoning_steps_json ? JSON.parse(r.reasoning_steps_json) : undefined,
    claims: r.claims_json ? JSON.parse(r.claims_json) : undefined,
    confidence: r.confidence_json ? JSON.parse(r.confidence_json) : undefined,
    createdAt: r.created_at,
  }));
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
