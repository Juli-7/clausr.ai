export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  file_chunks TEXT NOT NULL DEFAULT '[]',
  starred INTEGER NOT NULL DEFAULT 0,
  is_setup INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  content TEXT NOT NULL,
  reasoning TEXT NOT NULL DEFAULT '',
  citations_json TEXT NOT NULL DEFAULT '[]',
  verdict TEXT NOT NULL DEFAULT 'UNKNOWN',
  round INTEGER NOT NULL,
  sections_json TEXT,
  source_citations_json TEXT,
  clause_texts_json TEXT,
  tool_calls_json TEXT,
  reasoning_steps_json TEXT,
  claims_json TEXT,
  confidence_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  step_number INTEGER NOT NULL,
  step_title TEXT NOT NULL,
  step_type TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_message TEXT NOT NULL,
  context_summary TEXT NOT NULL,
  skillmd TEXT NOT NULL,
  template_json TEXT,
  loaded_references TEXT NOT NULL,
  uploaded_files_json TEXT NOT NULL,
  step_outputs_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_setup (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  skillmd TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  scripts_json TEXT,
  regulation_ids_json TEXT,
  steps_json TEXT NOT NULL,
  file_registry_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunk_store (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  text TEXT NOT NULL,
  page_number INTEGER,
  bbox_json TEXT,
  word_boxes_json TEXT,
  page_width REAL,
  page_height REAL,
  ocr_confidence REAL,
  chunk_html TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_session ON context_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_session ON responses(session_id);
CREATE INDEX IF NOT EXISTS idx_chunk_store_session ON chunk_store(session_id);
CREATE INDEX IF NOT EXISTS idx_chunk_store_file ON chunk_store(session_id, file_id);
`;

export const SETTINGS_INIT_SQL = `
INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
`;
