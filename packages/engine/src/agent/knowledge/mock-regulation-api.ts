import Database from "better-sqlite3";
import path from "path";
import type {
  Regulation,
  Clause,
  GetRegulationRequest,
  GetRegulationResponse,
  GetClauseRequest,
  GetClauseResponse,
  ListRegulationsRequest,
  ListRegulationsResponse,
  SearchClausesRequest,
  SearchClausesResponse,
} from "./regulation-types";
import type { IRegulationApi } from "./regulation-api";

let _db: Database.Database | null = null;
let _seedData: RegulationSeed[] | null = null;

const REG_DB_PATH = process.env.KB_DB_PATH ?? path.join(process.cwd(), "data", "kb.sqlite");

export function setRegulationSeedData(data: RegulationSeed[]): void {
  _seedData = data;
  // If DB is already open and empty, seed it immediately
  if (_db) {
    const count = _db.prepare("SELECT COUNT(*) as c FROM regulations").get() as { c: number };
    if (count.c === 0) {
      seedRegulations(_db, data);
    }
  }
}

export function getRegulationDb(): Database.Database {
  return getDb();
}

function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(REG_DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS regulations (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      jurisdiction TEXT NOT NULL,
      cross_references TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS code_aliases (
      alias TEXT PRIMARY KEY,
      code TEXT NOT NULL REFERENCES regulations(code)
    );

    CREATE TABLE IF NOT EXISTS regulation_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regulation_code TEXT NOT NULL REFERENCES regulations(code),
      version TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      changelog TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS clauses (
      id TEXT PRIMARY KEY,
      regulation_code TEXT NOT NULL REFERENCES regulations(code),
      number TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      parent_clause_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clauses_regulation ON clauses(regulation_code);
    CREATE INDEX IF NOT EXISTS idx_versions_regulation ON regulation_versions(regulation_code);
  `);

  // Auto-seed if data has been registered
  if (_seedData) {
    const count = _db.prepare("SELECT COUNT(*) as c FROM regulations").get() as { c: number };
    if (count.c === 0) {
      seedRegulations(_db, _seedData);
    }
  }

  return _db;
}

export interface RegulationSeed {
  id: string;
  code: string;
  title: string;
  description: string;
  jurisdiction: string;
  crossReferences: string[];
  aliases: string[];
  versions: { version: string; effectiveDate: string; isCurrent: boolean; changelog: string }[];
  clauses: { id: string; number: string; title: string; text: string; parentClauseId?: string | null }[];
}

export function seedRegulations(db: Database.Database, regulations: RegulationSeed[]): void {
  const regStmt = db.prepare(
    "INSERT OR IGNORE INTO regulations (id, code, title, description, jurisdiction, cross_references) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const aliasStmt = db.prepare("INSERT OR IGNORE INTO code_aliases (alias, code) VALUES (?, ?)");
  const verStmt = db.prepare(
    "INSERT OR IGNORE INTO regulation_versions (regulation_code, version, effective_date, is_current, changelog) VALUES (?, ?, ?, ?, ?)"
  );
  const clauseStmt = db.prepare(
    "INSERT OR IGNORE INTO clauses (id, regulation_code, number, title, text, parent_clause_id) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const seed = db.transaction(() => {
    for (const reg of regulations) {
      regStmt.run(reg.id, reg.code, reg.title, reg.description, reg.jurisdiction, JSON.stringify(reg.crossReferences));
      for (const alias of reg.aliases) {
        aliasStmt.run(alias, reg.code);
      }
      for (const ver of reg.versions) {
        verStmt.run(reg.code, ver.version, ver.effectiveDate, ver.isCurrent ? 1 : 0, ver.changelog);
      }
      for (const clause of reg.clauses) {
        clauseStmt.run(clause.id, reg.code, clause.number, clause.title, clause.text, clause.parentClauseId ?? null);
      }
    }
  });
  seed();
}

function rowToRegulation(row: Record<string, unknown>, db: Database.Database): Regulation {
  const code = row.code as string;
  const versions = db.prepare("SELECT version, effective_date AS effectiveDate, is_current AS isCurrent, changelog FROM regulation_versions WHERE regulation_code = ? ORDER BY id ASC").all(code) as Regulation["versions"];
  const clauses = db.prepare("SELECT id, number, title, text, parent_clause_id AS parentClauseId FROM clauses WHERE regulation_code = ? ORDER BY number ASC").all(code) as Clause[];
  return {
    id: row.id as string,
    code,
    title: row.title as string,
    description: row.description as string,
    jurisdiction: row.jurisdiction as string,
    versions: versions.map((v) => ({ ...v, isCurrent: Boolean(v.isCurrent) })),
    clauses,
    crossReferences: JSON.parse(row.cross_references as string),
  };
}

export class MockRegulationApi implements IRegulationApi {
  resolveCode(rawCode: string): string | null {
    const db = getDb();
    const row = db.prepare("SELECT code FROM code_aliases WHERE alias = ?").get(rawCode) as { code: string } | undefined;
    return row?.code ?? null;
  }

  async getRegulation(req: GetRegulationRequest): Promise<GetRegulationResponse> {
    try {
      const code = this.resolveCode(req.code);
      if (!code) return { success: false, error: `Unknown regulation code: ${req.code}` };

      const db = getDb();
      const row = db.prepare("SELECT * FROM regulations WHERE code = ?").get(code) as Record<string, unknown> | undefined;
      if (!row) return { success: false, error: `Regulation ${code} not found` };

      const regulation = rowToRegulation(row, db);

      if (req.version) {
        const exists = regulation.versions.some((v) => v.version === req.version);
        if (!exists) return { success: false, error: `Version ${req.version} not found for regulation ${code}` };
      }

      return { success: true, data: regulation };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getClause(req: GetClauseRequest): Promise<GetClauseResponse> {
    try {
      const code = this.resolveCode(req.regulationCode);
      if (!code) return { success: false, error: `Unknown regulation code: ${req.regulationCode}` };

      const db = getDb();
      const row = db.prepare("SELECT id, number, title, text, parent_clause_id AS parentClauseId FROM clauses WHERE regulation_code = ? AND number = ?").get(code, req.clauseNumber) as Clause | undefined;
      if (!row) return { success: false, error: `Clause ${req.clauseNumber} not found in regulation ${code}` };

      return { success: true, data: row, regulationCode: code };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async listRegulations(req: ListRegulationsRequest): Promise<ListRegulationsResponse> {
    try {
      const db = getDb();
      let query = "SELECT * FROM regulations WHERE 1=1";
      const params: unknown[] = [];

      if (req.jurisdiction) {
        query += " AND jurisdiction = ?";
        params.push(req.jurisdiction);
      }

      if (req.keyword) {
        query += " AND (title LIKE ? OR description LIKE ? OR code LIKE ?)";
        const kw = `%${req.keyword}%`;
        params.push(kw, kw, kw);
      }

      const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
      const data = rows.map((r) => rowToRegulation(r, db));
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async searchClauses(req: SearchClausesRequest): Promise<SearchClausesResponse> {
    try {
      const db = getDb();
      const kw = `%${req.keyword}%`;

      let query = "SELECT c.*, c.regulation_code AS regulationCode FROM clauses c WHERE (c.title LIKE ? OR c.text LIKE ? OR c.number LIKE ?)";
      const params: unknown[] = [kw, kw, kw];

      if (req.regulationCodes && req.regulationCodes.length > 0) {
        const codes = req.regulationCodes.map((c) => this.resolveCode(c)).filter(Boolean) as string[];
        if (codes.length > 0) {
          query += ` AND c.regulation_code IN (${codes.map(() => "?").join(",")})`;
          params.push(...codes);
        }
      }

      const rows = db.prepare(query).all(...params) as (Clause & { regulationCode: string })[];
      const data = rows.map((r) => ({ clause: { id: r.id, number: r.number, title: r.title, text: r.text, parentClauseId: r.parentClauseId } as Clause, regulationCode: r.regulationCode }));
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  invalidateCache(): void {
    if (_db) {
      _db.close();
      _db = null;
    }
  }
}
