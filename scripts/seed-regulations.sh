#!/usr/bin/env bash
# Re-seed regulations DB from seed data
# Usage: bash scripts/seed-regulations.sh
# Requires: apps/clausr/regulation/regulation-seed.ts (gitignored, copy manually to VPS)
set -euo pipefail

REPO_DIR=/opt/raipple/raipple-saas
cd "$REPO_DIR"

SEED_FILE="apps/clausr/regulation/regulation-seed.ts"
if ! [ -f "$SEED_FILE" ]; then
  echo "[seed-regulations] ERROR: $SEED_FILE not found"
  echo "  Copy regulation-seed.ts to this path, then re-run"
  exit 1
fi

echo "[seed-regulations] Re-seeding regulations DB..."

npx tsx -e '
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.REGULATIONS_DB_PATH ?? path.join(process.cwd(), "data", "regulations.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

import { REGULATION_SEED, flattenNodes } from "./apps/clausr/regulation/regulation-seed";

db.exec("DELETE FROM doc_nodes; DELETE FROM regulation_amendments; DELETE FROM regulation_versions; DELETE FROM code_aliases; DELETE FROM regulations;");

const regStmt = db.prepare(
  "INSERT INTO regulations (id, code, official_code, title, description, jurisdiction, publisher, published_date, status, doc_uri, cross_references, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
const aliasStmt = db.prepare("INSERT INTO code_aliases (alias, code) VALUES (?, ?)");
const verStmt = db.prepare(
  "INSERT INTO regulation_versions (regulation_code, version, effective_date, is_current, changelog) VALUES (?, ?, ?, ?, ?)"
);
const nodeStmt = db.prepare(
  "INSERT INTO doc_nodes (id, regulation_code, version, type, number, title, content, parent_id, sort_order, level, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

const seed = db.transaction(() => {
  for (const entry of REGULATION_SEED) {
    regStmt.run(
      entry.id, entry.code, entry.officialCode ?? null, entry.title, entry.description,
      entry.jurisdiction, entry.publisher ?? null, entry.publishedDate ?? null,
      entry.status ?? "in_force", entry.docUri ?? null,
      JSON.stringify(entry.crossReferences), "{}"
    );
    for (const alias of entry.aliases) {
      aliasStmt.run(alias.toLowerCase(), entry.code);
    }
    aliasStmt.run(entry.code.toLowerCase(), entry.code);
    aliasStmt.run(entry.id.toLowerCase(), entry.code);
    for (const ver of entry.versions) {
      verStmt.run(entry.code, ver.version, ver.effectiveDate, ver.isCurrent ? 1 : 0, ver.changelog ?? "");
    }
    const nodes = flattenNodes(entry);
    for (const n of nodes) {
      nodeStmt.run(n.id, n.regulationCode, n.version, n.type, n.number, n.title, n.content, n.parentId, n.sortOrder, n.level, n.metadata);
    }
  }
});
seed();

const count = db.prepare("SELECT COUNT(*) as c FROM regulations").get();
console.log(`[seed-regulations] Seeded ${JSON.stringify(count)}`);
db.close();
' 2>&1

echo "[seed-regulations] Done"
