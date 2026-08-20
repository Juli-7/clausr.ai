const SESSION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  skill_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  starred INTEGER NOT NULL DEFAULT 0,
  shared INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_tenant_created ON sessions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_shared ON sessions(user_id, shared, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_shared ON sessions(tenant_id, shared, created_at);
`;

const SESSION_SCHEMA_MIGRATIONS = [
  "ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE sessions ADD COLUMN skill_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE sessions ADD COLUMN summary_data TEXT NOT NULL DEFAULT '{}'",
];

const SESSION_INDEX_MIGRATIONS = [
  "DROP INDEX IF EXISTS idx_sessions_tenant",
  "DROP INDEX IF EXISTS idx_sessions_user",
];

export { SESSION_SCHEMA_SQL, SESSION_SCHEMA_MIGRATIONS, SESSION_INDEX_MIGRATIONS };
