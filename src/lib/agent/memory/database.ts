import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "skill-agent.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      file_contents TEXT NOT NULL DEFAULT ''
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
  `);

  // Migrate: add file_contents column if upgrading from older schema
  try { db.exec("ALTER TABLE sessions ADD COLUMN file_contents TEXT NOT NULL DEFAULT ''"); } catch { /* column exists */ }
  // Migrate: add starred column
  try { db.exec("ALTER TABLE sessions ADD COLUMN starred INTEGER NOT NULL DEFAULT 0"); } catch { /* column exists */ }
  // Migrate: add response metadata columns
  try { db.exec("ALTER TABLE responses ADD COLUMN sections_json TEXT"); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE responses ADD COLUMN source_citations_json TEXT"); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE responses ADD COLUMN clause_texts_json TEXT"); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE responses ADD COLUMN tool_calls_json TEXT"); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE responses ADD COLUMN reasoning_steps_json TEXT"); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE responses ADD COLUMN claims_json TEXT"); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE sessions ADD COLUMN file_chunks TEXT NOT NULL DEFAULT '[]'"); } catch { /* column exists */ }
  try { db.exec("ALTER TABLE responses ADD COLUMN confidence_json TEXT"); } catch { /* column exists */ }
  // Index for context snapshots
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_snapshots_session ON context_snapshots(session_id)"); } catch { /* index exists */ }
  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  insertSetting.run("llm_provider", process.env.LLM_PROVIDER?.toLowerCase() ?? "deepseek");
  insertSetting.run("llm_model", process.env.LLM_MODEL ?? "deepseek-v4-flash");
  insertSetting.run("retention_days", process.env.RETENTION_DAYS ?? "90");
  insertSetting.run("retention_max_sessions", process.env.RETENTION_MAX_SESSIONS ?? "0");

  return db;
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
