import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "skill-agent.db");

let db: Database.Database | null = null;

/**
 * Replace the default SQLite database with a custom instance.
 * Used by the SaaS version to inject a PostgreSQL-backed adapter.
 */
export function setDb(instance: Database.Database): void {
  db = instance;
}

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  runMigrations(db);
  initSettings(db);

  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
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

    CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(session_id UNINDEXED, file_id UNINDEXED, chunk_idx UNINDEXED, text, tokenize='unicode61');
  `);
}

function runMigrations(db: Database.Database): void {
  try { db.exec("ALTER TABLE sessions ADD COLUMN file_chunks TEXT NOT NULL DEFAULT '[]'"); } catch { }
  try { db.exec("ALTER TABLE sessions ADD COLUMN starred INTEGER NOT NULL DEFAULT 0"); } catch { }
  try { db.exec("ALTER TABLE sessions ADD COLUMN is_setup INTEGER NOT NULL DEFAULT 0"); } catch { }
  try { db.exec("ALTER TABLE responses ADD COLUMN sections_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE responses ADD COLUMN source_citations_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE responses ADD COLUMN clause_texts_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE responses ADD COLUMN tool_calls_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE responses ADD COLUMN reasoning_steps_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE responses ADD COLUMN claims_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE responses ADD COLUMN confidence_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE chunk_store ADD COLUMN word_boxes_json TEXT"); } catch { }
  try { db.exec("ALTER TABLE chunk_store ADD COLUMN page_width REAL"); } catch { }
  try { db.exec("ALTER TABLE chunk_store ADD COLUMN page_height REAL"); } catch { }
  try { db.exec("ALTER TABLE chunk_store ADD COLUMN chunk_html TEXT"); } catch { }
}

function initSettings(db: Database.Database): void {
  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  insertSetting.run("llm_provider", process.env.LLM_PROVIDER?.toLowerCase() ?? "deepseek");
  insertSetting.run("llm_model", process.env.LLM_MODEL ?? "deepseek-v4-flash");
  insertSetting.run("retention_days", process.env.RETENTION_DAYS ?? "90");
  insertSetting.run("retention_max_sessions", process.env.RETENTION_MAX_SESSIONS ?? "0");
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(key, value);
}
