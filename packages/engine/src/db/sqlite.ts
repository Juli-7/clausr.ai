import Database from "better-sqlite3";
import type { EngineDb } from "./interface";

export function createSqliteDb(dbPath: string): EngineDb {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const engineDb: EngineDb = {
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return db.prepare(sql).all(...(params ?? [])) as T[];
    },
    async get<T>(sql: string, params?: unknown[]): Promise<T | null> {
      return (db.prepare(sql).get(...(params ?? [])) as T | undefined) ?? null;
    },
    async run(sql, params) {
      db.prepare(sql).run(...(params ?? []));
    },
    async exec(sql) {
      db.exec(sql);
    },
    async transaction(fn) {
      const result = db.transaction(() => {
        const maybePromise = fn();
        if (maybePromise instanceof Promise) {
          throw new Error("SQLite transactions do not support async operations");
        }
        return maybePromise;
      })();
      return result;
    },
  };

  return engineDb;
}
