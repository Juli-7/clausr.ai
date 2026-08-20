# V2 Compliance Workspace — Architecture

## Repo Boundaries

```
@clausr/engine           ← opensource → clausr.ai
  engine logic, DB, LLM pipeline, extractors, SKILL.md loader

@raipple/clausr          ← proprietary → raipple-saas/apps/clausr/
  UI components, API routes, pack seed data, i18n, store bridge
```

API routes can import `@clausr/engine`. Components **cannot** (they run on
the client). The store bridge (`lib/compliance/store.ts`) wraps engine
functions for convenience, but API routes also call the engine directly
for orchestration functions (pipeline, setup).

---

## Engine — Functions by Origin

### V2-NEW (8 functions, 1 table, 6 types)

Added for the compliance v2 workflow. All in `packages/engine/src/`.

| Function | File | Purpose |
|---|---|---|
| `loadPack()` | `apps/clausr/src/lib/compliance/load-pack.ts` | Load `packs/<name>/meta.json` + `SKILL.md` → build Pack object |
| `ensureComplianceSession` | `repository.ts` | Create row in `compliance_session` table |
| `getComplianceSession` | `repository.ts` | Read session state from SQLite |
| `setComplianceStep/Scope/DocData` | `repository.ts` | Individual field updates |
| `addComplianceDocField` | `repository.ts` | Merge single field into doc_data |
| `addComplianceFile` / `getComplianceFiles` | `repository.ts` | File metadata CRUD |
| `setComplianceAuditRunning/Done` | `repository.ts` | Audit state toggles |
| `clearComplianceAuditResults` | `repository.ts` | Reset results for re-run |
| `setCompliancePackAuditResult` | `repository.ts` | Store per-pack check items |
| `setCompliancePrecheckDone` | `repository.ts` | Mark Step 2 validation done |
| `setComplianceAgentResponse` | `repository.ts` | Store full pipeline output per pack |
| `getAllComplianceSessions` | `repository.ts` | Session listing |
| `setupSkill()` | `loading-orchestrator.ts` | Load SKILL.md → parse checks → generate steps → persist context |
| `processSessionFiles()` | `loading-orchestrator.ts` | Run uploaded files through extractors → store chunks + RAG |

**New engine types**: `SkillPack`, `PackCheck`, `DocumentTemplate`, `DocumentField`, plus existing `ComplianceSessionData`, `ComplianceFile`.

**Table schema** (`compliance_session`):
```
session_id        TEXT PRIMARY KEY → sessions(id)
step              INTEGER DEFAULT 1
selected_pack_ids TEXT DEFAULT '[]'
doc_data          TEXT DEFAULT '{}'
audit_results     TEXT DEFAULT '[]'
audit_running     INTEGER DEFAULT 0
audit_done        INTEGER DEFAULT 0
precheck_done     INTEGER DEFAULT 0
agent_responses   TEXT DEFAULT '{}'
updated_at        INTEGER
```

### V1→V2 Shared (called by both apps)

| Function | Used by V2 in |
|---|---|
| `orchestratePipeline(sessionId, message, revisionFields?)` | Audit SSE route, revision path in chat route |
| `createModel()` | Chat route, audit SSE route (fallback per-check) |
| `hasSessionSetup()` | Chat route, audit SSE route (guard) |
| `extractFileContent()` | Inside `processSessionFiles()` |
| `getDocStore()` / `getFileChunks()` / etc | Inside pipeline execution |
| `AgentResponse`, `Citation`, `SourceCitation`, `Confidence` types | Passed through `agentResponses` JSON |
| `generateDocx()` | Only v1 currently; available for v2 |
| `computeConfidence()` | Inside pipeline (also directly exportable) |

### V1-Only (untouched by v2)

`setupSession()`, `saveContextSnapshot()`, `getContextSnapshots()`,
`toggleStar()`, `toggleShare()`, `searchChunksFts5()`,
`getRecentMemories()`, `saveLessonOverride()`, `getLessonOverrides()`,
`saveUserSkill()`, `deleteUserSkill()`, `listUserSkillNames()`,
`loadUserSkill()`, `evaluate()`, `identifyRevisionTargets()`,
`getRegulationApi()`, all schema types for v1-only requests.

---

## App — File Inventory

### API Routes (`app/api/compliance/`)

13 endpoints across 11 files. Engine calls are **only** in 4 routes:

| Route | Engine Dependencies | Local Dependencies |
|---|---|---|
| `GET packs` | — | `seed.ts` (static data) |
| `GET packs/[id]` | — | `seed.ts` |
| `POST session` | — | `store.ts` |
| `GET/PATCH session/[id]` | `setupSkill` | `store.ts` |
| `POST session/[id]/chat` | `createModel`, `orchestratePipeline`, `setupSkill`, `hasSessionSetup` | `store.ts`, `seed.ts` |
| `PATCH session/[id]/scope` | — | `store.ts` |
| `PATCH session/[id]/documents` | — | `store.ts` |
| `POST session/[id]/files` | — | `store.ts` |
| `POST session/[id]/validation` | `processSessionFiles`, `ComplianceFile` | `store.ts` |
| `POST session/[id]/audit` | — | `store.ts` |
| `GET session/[id]/audit/stream` | `createModel`, `orchestratePipeline`, `setupSkill`, `hasSessionSetup` | `store.ts`, `seed.ts` |
| `GET session/[id]/export/[docType]` | — | `store.ts`, `seed.ts` |
| `GET sessions` | — | `store.ts` |

### Components (`components/compliance/`)

17 new client components. Zero import `@clausr/engine` directly.

| Component | Role | V1 Reuse |
|---|---|---|
| `ComplianceLayout` | Top-level orchestrator: owns chat, step nav, session lifecycle | None |
| `StepPanel` | Routes content by `session.step` (1/2/3) | None |
| `ScopeMarketplace` | Step 1: pack grid + filters | None |
| `PackCard` | Single pack tile | None |
| `PackPreviewDrawer` | Slide-out pack detail | None |
| `ScopeCart` | Selected packs summary | None |
| `ScopeSidebar` | Filters + cart | None |
| `DocumentsPanel` | Step 2: document forms + files + checks | None |
| `DocForm` | Fillable fields for one document type | None |
| `FileList` | Uploaded file display | None |
| `FilePreviewModal` | File preview overlay | None |
| `ReadinessChecks` | Validation check list | None |
| `AuditPanel` | Step 3: start audit, progress, detail routing | None |
| `AuditSidebar` | Per-pack result list | None |
| **`AuditDetail`** | **Wraps v1 `DocumentPanel`** with stored AgentResponse | **`DocumentPanel`** (the only v1 reuse) |
| `ChatSuggestions` | Suggested prompts | None |
| `StepPill` | Step indicator badge | None |

### Local Library (`lib/compliance/`)

| File | What it does |
|---|---|
| `session-builder.ts` | `buildSession(id)` — composes engine's `getComplianceSession` + `getConversationHistory` + `getComplianceFiles` into a single `ComplianceSession` object. **Only composition, no wrapping.** |
| `seed.ts` | Re-exports from `load-pack.ts`. Static `packs`/`allRegs`/`allInds` arrays. |
| `types.ts` | v2-specific types: `Pack`, `AuditResult`, `DocData`, `ComplianceSession`, etc |
| `i18n.ts` | EN/CN translation following v1's `L` object pattern |

---

## Data Flow

```
User clicks button
       ↓
Component (client)           e.g. AuditDetail
  fetch("/api/compliance/...")
       ↓
API Route (server)           e.g. audit/stream/route.ts
  import @clausr/engine
  import @/lib/compliance/store
  import @/lib/compliance/seed
       ↓
Engine                        e.g. orchestratePipeline()
  DB, LLM, extractors, SKILL.md
       ↓
Response (JSON or SSE)
       ↓
Component re-renders
```

Component → `fetch()` → API Route → Engine → response → Component

The only local utility is `buildSession()` in `session-builder.ts`, which
API routes call after engine mutations to recompose the full session
object. No wrapper layer between API routes and engine — API routes call
engine functions directly.

---

## Key Observations

1. **Engine is invisible to UI.** Zero v2 components import `@clausr/engine`. All engine calls go through API routes.
2. **One v1 UI reuse.** Only `AuditDetail` imports v1's `DocumentPanel`. Everything else is new v2 code.
3. **`setupSession` split, not rewritten.** v1's `setupSession` still works. v2 gets `setupSkill` + `processSessionFiles`, which share the same internal phases.
4. **Pipeline is shared.** `orchestratePipeline` is called the same way in v1 (every chat turn) and v2 (Step 3 audit + revisions only).
5. **Separate table.** `compliance_session` is independent from v1's core `sessions` data. No schema conflicts.
6. **No wrapper layer. `store.ts` was removed.** API routes call engine functions directly. The only local utility is `buildSession()` in `session-builder.ts`, which composes multiple engine queries into a single `ComplianceSession` object.
7. **Packs are filesystem-driven.** `apps/clausr/packs/<name>/` contains `meta.json` (card metadata) + `SKILL.md` (checks, documents, regulations). `load-pack.ts` reads them into `Pack` objects. No dependency on engine's `getPackFromSkill()`.