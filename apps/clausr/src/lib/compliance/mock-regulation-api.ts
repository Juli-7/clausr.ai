import Database from "better-sqlite3";
import path from "path";
import type { IRegulationApi, SeedRegulationRequest, SeedRegulationResponse } from "@clausr/engine";

const DB_PATH = process.env.REGULATIONS_DB_PATH ?? path.join(process.cwd(), "data", "regulations.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS regulations (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      official_code TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      jurisdiction TEXT NOT NULL,
      publisher TEXT,
      published_date TEXT,
      status TEXT DEFAULT 'in_force',
      replaced_by TEXT,
      doc_uri TEXT,
      cross_references TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}'
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

    CREATE TABLE IF NOT EXISTS doc_nodes (
      id TEXT PRIMARY KEY,
      regulation_code TEXT NOT NULL REFERENCES regulations(code),
      version TEXT,
      type TEXT NOT NULL,
      number TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      parent_id TEXT REFERENCES doc_nodes(id),
      sort_order INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_regulation ON doc_nodes(regulation_code);
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON doc_nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_type ON doc_nodes(regulation_code, type);

    CREATE TABLE IF NOT EXISTS regulation_amendments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regulation_code TEXT NOT NULL REFERENCES regulations(code),
      amendment_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      effective_date TEXT NOT NULL,
      affected_nodes TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT ''
    );
  `);

  return _db;
}

function canonicalFromAlias(db: Database.Database, rawCode: string): string | null {
  const row = db.prepare("SELECT code FROM code_aliases WHERE alias = ?").get(rawCode.toLowerCase()) as { code: string } | undefined;
  return row?.code ?? null;
}

function mapNodeToClause(row: Record<string, unknown>): {
  id: string; number: string; title: string; text: string; parentClauseId?: string;
} {
  return {
    id: row.id as string,
    number: row.number as string,
    title: row.title as string,
    text: row.content as string,
    parentClauseId: (row.parent_id as string) ?? undefined,
  };
}

export class MockRegulationApi implements IRegulationApi {
  async resolveCode(rawCode: string): Promise<string | null> {
    return canonicalFromAlias(getDb(), rawCode);
  }

  async getRegulationMeta(req: { code: string }): Promise<{
    success: boolean;
    data?: { id: string; code: string; title: string; description: string; jurisdiction: string; crossReferences?: string[] };
    error?: string;
  }> {
    try {
      const db = getDb();
      const code = await this.resolveCode(req.code);
      if (!code) return { success: false, error: `Unknown regulation code: ${req.code}` };
      const row = db.prepare("SELECT id, code, title, description, jurisdiction, cross_references FROM regulations WHERE code = ?").get(code) as Record<string, unknown> | undefined;
      if (!row) return { success: false, error: `Regulation ${code} not found` };
      return {
        success: true,
        data: {
          id: row.id as string,
          code: row.code as string,
          title: row.title as string,
          description: row.description as string,
          jurisdiction: row.jurisdiction as string,
          crossReferences: JSON.parse(row.cross_references as string),
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getRegulation(req: { code: string; version?: string }): Promise<{
    success: boolean;
    data?: {
      id: string; code: string; title: string; description: string; jurisdiction: string;
      versions: { version: string; effectiveDate: string; isCurrent: boolean; changelog?: string }[];
      clauses: { id: string; number: string; title: string; text: string; parentClauseId?: string }[];
      crossReferences?: string[]; metadata?: Record<string, string>;
    };
    error?: string;
  }> {
    try {
      const db = getDb();
      const code = await this.resolveCode(req.code);
      if (!code) return { success: false, error: `Unknown regulation code: ${req.code}` };
      const row = db.prepare("SELECT * FROM regulations WHERE code = ?").get(code) as Record<string, unknown> | undefined;
      if (!row) return { success: false, error: `Regulation ${code} not found` };

      const versions = db.prepare("SELECT version, effective_date AS effectiveDate, is_current AS isCurrent, changelog FROM regulation_versions WHERE regulation_code = ? ORDER BY id ASC").all(code) as { version: string; effectiveDate: string; isCurrent: number; changelog: string }[];
      const nodes = db.prepare("SELECT id, number, title, content, parent_id FROM doc_nodes WHERE regulation_code = ? ORDER BY sort_order ASC").all(code) as Record<string, unknown>[];

      if (req.version) {
        const exists = versions.some((v) => v.version === req.version);
        if (!exists) return { success: false, error: `Version ${req.version} not found for regulation ${code}` };
      }

      return {
        success: true,
        data: {
          id: row.id as string,
          code: row.code as string,
          title: row.title as string,
          description: row.description as string,
          jurisdiction: row.jurisdiction as string,
          versions: versions.map((v) => ({ ...v, isCurrent: Boolean(v.isCurrent) })),
          clauses: nodes.map(mapNodeToClause),
          crossReferences: JSON.parse(row.cross_references as string),
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getClause(req: { regulationCode: string; clauseNumber: string; version?: string }): Promise<{
    success: boolean;
    data?: { id: string; number: string; title: string; text: string; parentClauseId?: string };
    regulationCode?: string;
    error?: string;
  }> {
    try {
      const db = getDb();
      const code = await this.resolveCode(req.regulationCode);
      if (!code) return { success: false, error: `Unknown regulation code: ${req.regulationCode}` };
      const row = db.prepare("SELECT id, number, title, content, parent_id FROM doc_nodes WHERE regulation_code = ? AND number = ?").get(code, req.clauseNumber) as Record<string, unknown> | undefined;
      if (!row) return { success: false, error: `Clause ${req.clauseNumber} not found in regulation ${code}` };
      return { success: true, data: mapNodeToClause(row), regulationCode: code };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getClauses(req: { refs: { regulationCode: string; clauseNumber: string; version?: string }[] }): Promise<{
    success: boolean;
    data?: { clause: { id: string; number: string; title: string; text: string; parentClauseId?: string }; regulationCode: string }[];
    error?: string;
  }> {
    try {
      const db = getDb();
      const results: { clause: { id: string; number: string; title: string; text: string; parentClauseId?: string }; regulationCode: string }[] = [];
      for (const ref of req.refs) {
        const code = await this.resolveCode(ref.regulationCode);
        if (!code) continue;
        const row = db.prepare("SELECT id, number, title, content, parent_id FROM doc_nodes WHERE regulation_code = ? AND number = ?").get(code, ref.clauseNumber) as Record<string, unknown> | undefined;
        if (row) {
          results.push({ clause: mapNodeToClause(row), regulationCode: code });
        }
      }
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async listRegulations(req: { jurisdiction?: string; keyword?: string }): Promise<{
    success: boolean;
    data?: {
      id: string; code: string; title: string; description: string; jurisdiction: string;
      versions: { version: string; effectiveDate: string; isCurrent: boolean; changelog?: string }[];
      clauses: { id: string; number: string; title: string; text: string; parentClauseId?: string }[];
      crossReferences?: string[]; metadata?: Record<string, string>;
    }[];
    error?: string;
  }> {
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
      const data = rows.map((r) => {
        const code = r.code as string;
        const versions = db.prepare("SELECT version, effective_date AS effectiveDate, is_current AS isCurrent, changelog FROM regulation_versions WHERE regulation_code = ? ORDER BY id ASC").all(code) as { version: string; effectiveDate: string; isCurrent: number; changelog: string }[];
        const nodes = db.prepare("SELECT id, number, title, content, parent_id FROM doc_nodes WHERE regulation_code = ? ORDER BY sort_order ASC").all(code) as Record<string, unknown>[];
        return {
          id: r.id as string,
          code: r.code as string,
          title: r.title as string,
          description: r.description as string,
          jurisdiction: r.jurisdiction as string,
          versions: versions.map((v) => ({ ...v, isCurrent: Boolean(v.isCurrent) })),
          clauses: nodes.map(mapNodeToClause),
          crossReferences: JSON.parse(r.cross_references as string),
        };
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async searchClauses(req: { regulationCodes?: string[]; keyword: string; version?: string }): Promise<{
    success: boolean;
    data?: { clause: { id: string; number: string; title: string; text: string; parentClauseId?: string }; regulationCode: string }[];
    error?: string;
  }> {
    try {
      const db = getDb();
      const kw = `%${req.keyword}%`;
      let query = "SELECT n.*, n.regulation_code AS regulationCode FROM doc_nodes n WHERE (n.title LIKE ? OR n.content LIKE ? OR n.number LIKE ?)";
      const params: unknown[] = [kw, kw, kw];
      if (req.regulationCodes && req.regulationCodes.length > 0) {
        const codes = (await Promise.all(req.regulationCodes.map((c) => this.resolveCode(c)))).filter(Boolean) as string[];
        if (codes.length > 0) {
          query += ` AND n.regulation_code IN (${codes.map(() => "?").join(",")})`;
          params.push(...codes);
        }
      }
      const rows = db.prepare(query).all(...params) as (Record<string, unknown> & { regulationCode: string })[];
      const data = rows.map((r) => ({
        clause: mapNodeToClause(r),
        regulationCode: r.regulationCode,
      }));
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async seedRegulation(req: SeedRegulationRequest): Promise<SeedRegulationResponse> {
    try {
      const db = getDb();
      const existing = db.prepare("SELECT code FROM regulations WHERE code = ?").get(req.code) as { code: string } | undefined;
      if (existing) return { success: false, error: `Regulation "${req.code}" already exists` };

      const tx = db.transaction(() => {
        const id = req.code.toLowerCase().replace(/[^a-z0-9]/g, "-");
        db.prepare(
          "INSERT INTO regulations (id, code, official_code, title, description, jurisdiction, publisher, published_date, cross_references, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          id, req.code, null, req.title, req.description, req.jurisdiction,
          null, null, JSON.stringify(req.crossReferences ?? []), JSON.stringify(req.metadata ?? {})
        );

        db.prepare("INSERT OR IGNORE INTO code_aliases (alias, code) VALUES (?, ?)").run(req.code.toLowerCase(), req.code);
        db.prepare("INSERT OR IGNORE INTO code_aliases (alias, code) VALUES (?, ?)").run(id, req.code);

        if (req.versions) {
          const verStmt = db.prepare(
            "INSERT INTO regulation_versions (regulation_code, version, effective_date, is_current, changelog) VALUES (?, ?, ?, ?, ?)"
          );
          for (const v of req.versions) {
            verStmt.run(req.code, v.version, v.effectiveDate, v.isCurrent ? 1 : 0, v.changelog ?? "");
          }
        }

        // Build a map from clause number to generated ID, then insert nodes
        const clauseIds = new Map<string, string>();
        for (const c of req.clauses) {
          const cid = `${req.code}_${c.number}`.replace(/\s+/g, "_");
          clauseIds.set(c.number, cid);
        }

        const nodeStmt = db.prepare(
          "INSERT INTO doc_nodes (id, regulation_code, version, type, number, title, content, parent_id, sort_order, level, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );

        for (let i = 0; i < req.clauses.length; i++) {
          const c = req.clauses[i]!;
          const cid = clauseIds.get(c.number)!;
          const parentId = c.parentNumber ? (clauseIds.get(c.parentNumber) ?? null) : null;
          const level = c.parentNumber ? (c.number.split(".").length) : 1;
          nodeStmt.run(
            cid, req.code, null, "clause", c.number, c.title, c.text,
            parentId, i, level, "{}"
          );
        }
      });

      tx();
      return { success: true, code: req.code, clauseCount: req.clauses.length };
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
