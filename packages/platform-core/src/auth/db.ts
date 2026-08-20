import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { AUTH_SCHEMA_SQL } from "./schema";
import { USAGE_SCHEMA_SQL } from "../usage/schema";
import { AUDIT_SCHEMA_SQL } from "../audit/schema";
import { SESSION_SCHEMA_SQL, SESSION_SCHEMA_MIGRATIONS, SESSION_INDEX_MIGRATIONS } from "../session/schema";
import { SETTINGS_SCHEMA_SQL } from "../settings/schema";
import { logger } from "../utils/logger";

const AUTH_DB_PATH = process.env.AUTH_DB_PATH ?? path.join(process.cwd(), "data", "auth.db");

let db: Database.Database | null = null;

// Track future schema migrations here.
// Columns in CREATE TABLE IF NOT EXISTS (schema.ts) are bootstrapped on first run.
// Only add entries here for schema changes deployed AFTER tables are already in production.
const MIGRATIONS: { version: number; description: string; sql: string }[] = [];

function runMigrations(database: Database.Database): void {
  database.exec("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, description TEXT, applied_at INTEGER NOT NULL)");
  const applied = new Set(
    (database.prepare("SELECT version FROM _migrations ORDER BY version").all() as { version: number }[])
      .map(r => r.version)
  );
  const now = Math.floor(Date.now() / 1000);
  for (const m of MIGRATIONS) {
    if (!applied.has(m.version)) {
      try {
        database.exec(m.sql);
        database.prepare("INSERT INTO _migrations (version, description, applied_at) VALUES (?, ?, ?)").run(m.version, m.description, now);
        logger.info(`[migration] applied v${m.version}: ${m.description}`);
      } catch (err) {
        logger.error(`[migration] failed v${m.version}: ${m.description}`, err);
        throw err;
      }
    }
  }
}

export function getAuthDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(AUTH_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(AUTH_DB_PATH, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(AUTH_SCHEMA_SQL);
  db.exec(USAGE_SCHEMA_SQL);
  db.exec(AUDIT_SCHEMA_SQL);
  db.exec(SESSION_SCHEMA_SQL);
  db.exec(SETTINGS_SCHEMA_SQL);

  for (const migration of SESSION_SCHEMA_MIGRATIONS) {
    try { db.exec(migration); } catch { /* already applied */ }
  }
  for (const migration of SESSION_INDEX_MIGRATIONS) {
    try { db.exec(migration); } catch { /* already applied */ }
  }

  runMigrations(db);

  return db;
}

export function closeAuthDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export { AUTH_DB_PATH };
