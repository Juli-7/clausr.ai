# Tool Categories for LLM-Driven Apps

## 8 General Categories

### 1. Read — fetch existing state/data
- Idempotent, no side effects
- Returns current values, status, or metadata
- *e.g. get record, get status, get config*

### 2. Write — create or update state
- Mutates structured data
- Single-field or batch
- *e.g. update field, save record, set preference*

### 3. Search — find across a corpus
- Vector, full-text, or structured query
- Returns ranked results
- *e.g. search docs, find records, query index*

### 4. File — handle binary/text content
- Read, extract, upload, or generate documents
- Bridges unstructured ↔ structured boundaries
- *e.g. read file, extract text, export doc, attach file*

### 5. Execute — trigger long-running or async work
- Returns a job ID or streams progress
- May be synchronous but has side effects outside structured data
- *e.g. run audit, start build, send email*

### 6. Navigate — control app flow / phase / step
- Changes mode, screen, or workflow stage
- Often a thin wrapper over setting a state flag
- *e.g. go to step, switch mode, set scope*

### 7. Learn — persist knowledge for future improvement
- Feeds back into system behavior over time
- Human-in-the-loop signal
- *e.g. suggest lesson, save feedback, log insight*

### 8. Admin — manage schema / config / structure
- Restricted to power users
- Creates or modifies the shape of data, not data itself
- *e.g. create table, define field, publish template*

## Mapping Our 27 Tools

| Category | Tools |
|---|---|
| **Read** | `get_file_content`, `get_regulation_text`, `read_pack`, `list_packs` |
| **Write** | `batch_update_doc_fields`, `set_scope`, `go_to_phase`, `save_test_plan`, `update_test_plan`, `detach_file`, `seed_regulation` |
| **Search** | `search_clauses`, `search_files` |
| **File** | `attach_file`, `extract_file_content`, `export_document` |
| **Execute** | `run_pending_checks`, `retry_check`, `setup_pack_audit`, `prepare_for_audit`, `run_validation` |
| **Navigate** | (absorbed by `set_scope`/`go_to_phase` — both Write really) |
| **Learn** | `suggest_lesson` |
| **Admin** | `create_pack`, `manage_field`, `manage_document_template`, `manage_check`, `publish_pack` |

## Typical Adoption Curve

Most apps start with **Read + Write + Search** as the core triad, then add **File + Execute** for richer interaction, and **Learn + Admin** as optional layers as the system matures. **Navigate** often collapses into Write (setting a phase field).

## Tool Design Principle

One tool per **independent decision** the LLM would make.

Decisions that should always happen together → merge into one tool. Decisions the LLM might interleave with other work or skip entirely → keep separate.

Examples:
- `setup_pack_audit` / `run_pending_checks` / `retry_check` — LLM may set up 3 packs, run the easiest one first, inspect results, retry individual checks. **Keep separate.**
- `manage_field` / `manage_document_template` / `manage_check` — LLM may add a field, then a check referencing it, then another field. **Keep separate.**
- `batch_update_doc_fields` / `attach_file` / `detach_file` — LLM may fill fields first, attach files after. **Keep separate.**

Avoid names that expose implementation: no "batch", "prepare", or database verbs (add/update/remove). The tool name should match what the user would say in conversation: `search_files`, not `FTS5_query_chunks`.

If the LLM needs to understand storage internals (chunks, embeddings, table names) to use a tool correctly, the tool is too low-level. Wrap it behind a semantic boundary.

## Architecture Layering: Tools/APIs vs Persistence

The border is **invocation**: persistence is called *by* tools/apis; it never calls them back.

**Persistence** = pure data access. No imports from tools, api, orchestration, or infra. Only exports functions like `getComplianceSession(id)`, `searchChunksFts5(query)`.

```
persistence/session-store.ts
  export function getComplianceSession(id) → reads SQLite, returns object
  export function addComplianceDocField(id, field, value) → writes SQLite
```

**Tools** = wraps persistence for the LLM. Adds schema validation via Zod, error handling, response formatting. Never exports a raw DB function — only the execute handler.

```
tools/documents.ts
  execute: (sessionId, input) => {
    parse input via Zod schema
    call persistence.addComplianceDocField(sessionId, field, value)
    return { docData: ... }
  }
```

**APIs** = wraps persistence for the browser. Adds auth, rate limiting, HTTP headers. Same pattern as tools but for HTTP verbs.

```
api/session/route.ts
  GET: requireAuth → persistence.getComplianceSession(id) → Response.json(...)
```

### The hard test for where something belongs

*If we swapped the storage engine, does this file change?*

- **Yes** → it's persistence (SQLite → Postgres rewrite)
- **No** → it's tools/API (contract with LLM/browser stays same)

By this test: `search_clauses` implementation lives in persistence, but its tool wrapper with Zod schema lives in tools. Even if the tool is 3 lines of glue, those 3 lines survive a storage swap. The underlying FTS5 query in persistence does not.

## Architecture Chart

```
                    ┌─────────────────────────────────────┐
                    │              foundation/             │
                    │  bootstrap · seed data · build conf  │
                    │        docs · i18n · pack defs       │
                    └─────────────────────────────────────┘

              ┌─────────────────┐     ┌─────────────────┐
              │       ui/       │     │  orchestration/  │
              │ React components│     │  chat loop ·     │
              │                 │     │  audit runner ·   │
              │                 │     │  prompts ·        │
              │                 │     │  tool catalog     │
              │                 │     ├─────────────────┤
              │                 │     │     model/       │
              │                 │     │ LLM factory ·    │
              │                 │     │ provider config  │
              └────────┬────────┘     └────────┬────────┘
                       │                       │
              ┌────────▼────────┐     ┌────────▼────────┐
              │      api/       │     │     tools/       │
              │  REST endpoints │     │  27 LLM-callable │
              │  (Next.js)      │     │  functions + lib │
              └────────┬────────┘     └────────┬────────┘
                       │                       │
                       └──────────┬────────────┘
                                  │
                       ┌──────────▼──────────┐
                       │    persistence/      │
                       │  session · pack ·    │
                       │  regulation · file · │
                       │  chunk stores +      │
                       │  domain models       │
                       └──────────┬──────────┘
                                  │
                       ┌──────────▼──────────┐
                       │  DBs + Filesystem    │
                       │  SQLite · Disk · FTS5│
                       └─────────────────────┘
```

### Dual-interface rule: when a tool also needs an API

**One write API per consumer.** If the browser writes independently of the LLM, expose a dedicated API. If the browser only reads what the LLM wrote, one GET session endpoint suffices.

| Pattern | Example | Tool | API |
|---|---|---|---|
| LLM decides, browser renders result | `set_scope`, `batch_update_doc_fields` | ✅ | ❌ (browser reads via GET session) |
| Browser decides independently + LLM may also decide | `create_pack` (expert UI), `list_packs` (pre-load catalog) | ✅ | ✅ |
| Browser renders read-only data | citation badges, report download | ❌ | ✅ |
| Browser writes, LLM never needs to | comments, audit overrides, pack delete | ❌ | ✅ |

Session-level writes (`set_scope`, `batch_update_doc_fields`, `attach_file`) all flow through one GET API (`GET /session/[id]`) which returns the full state. No dedicated write API needed. Dual-interface only triggers when the browser initiates the write independently of the LLM, not just when it renders the result.

### Layer rules

- **Persistence** never imports tools, api, or orchestration — only domain models and DB drivers.
- **Tools** wrap persistence for the LLM. Add Zod validation, error handling, response shape. Never export raw DB functions.
- **APIs** wrap persistence for the browser. Add auth, rate limits, HTTP headers. Same pattern as tools but for HTTP verbs.
- **Orchestration** is the top-level chat loop and the per-check audit sub-orchestrator. Owns prompts and the tool catalog — these are the LLM's operating environment, injected into every call.
- **Model** is the raw LLM provider abstraction that orchestration calls.
- **Foundation** is everything the runtime needs to exist but doesn't participate in request/response cycles.
