# v2reg: Regulation Query Redesign

## Goal

Move from pre-loading entire regulations from KB.sqlite to LLM-driven clause queries, using pack.json check clauses as the entry point.

## Key Decisions

1. **pack.json is the entry** — extract unique clause refs from checks' `clause` fields, not from `regulation_ids` → whole-regulation loads
2. **LLM queries during chat (step 1)** — LLM calls `get_clause`/`search_clauses` tools to fetch full clause text on demand
3. **Step 3 audit enforces completeness** — `run_pending_checks` / `compileCitations` validates citation refs have been resolved; rejects unqueried clauses
4. **Structured DB stays** — SQLite with exact-match lookups; no vector/embedding layer
5. **Swappable backend** — `IRegulationApi` interface already abstracts the DB; third-party replacement only needs `resolveCode()` changed to async + remove `getRegulationDb()` leak. See `regulation-api.ts:15-17`.
6. **raipple-saas / third-party KB** — The regulation database will live in a closed-source backend (raipple-saas or a third-party provider), exposed as an HTTP API. `clausr.ai` is open-source and talks to it through the `IRegulationApi` interface. The local `mock-regulation-api.ts` + `KB.sqlite` is for development only; production will use an HTTP-based implementation. The interface is the same either way.

### Design notes

- **Pipeline tools: `get_clause` only, no `search_clauses`** — `search_clauses` is for exploration in compliance chat. In pipeline context, the LLM already knows which clauses it needs from pack.json checks. Including it wastes prompt tokens.
- **Tool-call round budget** — Each `get_clause` is one round trip. A check citing 5 clauses needs 5 rounds + 1 round for the result. Consider a batch `get_clauses` tool accepting multiple refs to stay within `maxSteps`.
- **`regulation_ids` → metadata only** — After migration, `regulation_ids` is purely for display. No longer drives DB queries. Optionally add validation: if a check's clause (e.g. `R48.6.2`) references a regulation not in `regulation_ids`, warn.
- **`resolveCode()` must be async** — Currently synchronous, which blocks for a remote DB. Change to `Promise<string | null>` now to avoid a breaking change later.

## Changes

### 1. `builtins.ts` — `loadRegulationSummaries()`

**Current:** Loads full regulations via `api.getRegulation()` → all clauses → builds summaries → pre-loads clause texts for checks.

**New:**
- Collect unique clause refs from `ctx.skill.checks[].clause`
- Query only those clauses via `api.getClause()` (batched or individual)
- Build `RegulationSummary[]` with only the requested clauses in `clauseIndex`
- **Do NOT** pre-load full clause texts into palette (no more Tier 2 preloading)
- Load regulation metadata (title, description) — may still need a lightweight `api.getRegulationMeta()` or derive from clause data

**Why:** Shifts full-text loading from startup to on-demand (LLM tool calls).

### 2. `llm-executor.ts` — Add clause query tools to all LLM turns

**Current:** Step 1 tools only include `checkCompliance` (numerical check).

**New:** Add `get_clause` and `search_clauses` tools (from `compliance-tools.ts` or equivalent) to the tool set passed to `streamText` on every LLM call — step 1 (chat), step 2 (drafting), step 3 (audit), and any intermediate turns.

**Prompt change:** In `formatRegulationSection()`, tell LLM it has tools to retrieve full clause text and must use them before citing. This goes in the system prompt, not per-step.

### 3. `llm-executor.ts` — `resolveCitations()`

**Current:** If LLM returns empty `citationRef`, falls back to palette entry or check clause.

**New:** If `citationRef` references a clause not in the palette, trigger `api.getClause()` directly (lazy fetch) instead of relying on pre-loaded data. Keep the palette as cache.

### 4. `palette-store.ts` — `resolveMissingRefs()`

Already works for lazy resolution. No major changes needed — it already calls `api.getClause()`. Confirm it's used by step 3 audit.

### 5. Step 3 audit — enforce resolution

In `compileCitations()` or `finalizePhase()`:
- Check all `citationRef` values across all check results
- If any ref is not in palette (i.e., LLM cited a clause it never queried), flag or auto-resolve before finalizing
- This is the safety net against hallucinated citations

### 6. `mock-regulation-api.ts` — `batchGetClauses()` (optional)

If step 3 needs to resolve many refs at once, add:
```ts
async getClauses(refs: { regulationCode: string; clauseNumber: string }[]): Promise<...>
```
Wraps multiple `getClause()` calls in a transaction for efficiency. Not strictly required but nice to have.

### 7. `regulation-api.ts` — `getRegulationMeta()` (optional)

If loading full `Regulation` objects (with all clauses + versions) just for metadata is wasteful, add a lightweight method:
```ts
async getRegulationMeta(code: string): Promise<{ title: string; description: string; jurisdiction: string } | null>
```
Simpler queries the `regulations` table without joining `clauses` or `regulation_versions`.

### 8. Tests — update mocks

- `e2e-pipeline.test.ts` and `pipeline.test.ts` currently pre-populate palette entries directly
- Tests need to simulate LLM tool calls fetching clause text
- Step 3 audit tests should verify that unqueried refs are caught

## Data Flow

```
pack.json checks[].clause
  └─ builtins.ts: loadRegulationSummaries()
       └─ api.getClause() for each unique ref
       └─ builds summaries (number + title only, no text)
       └─ stores in palette (summaries, no clause texts)

Any LLM turn (llm-executor.ts)
  └─ LLM receives summaries in prompt
  └─ LLM calls get_clause / search_clauses tools at any point
       └─ api.getClause() → clause text returned to LLM
       └─ LLM incorporates into its response
  └─ LLM outputs CheckResult with citationRef

Step 3 audit (finalizePhase)
  └─ compileCitations() or equivalent
  └─ validates all citationRefs are in palette
  └─ if missing → auto-resolve via api.getClause() or reject
  └─ finalize outputs
```

## Migration Order

1. `mock-regulation-api.ts` — add `getRegulationMeta()` (lightweight metadata query)
2. `builtins.ts` — rewrite `loadRegulationSummaries()` to query only check clauses
3. `llm-executor.ts` — add clause query tools to step 1 tool set
4. `llm-executor.ts` — update prompt to describe tool usage
5. `llm-executor.ts` — update `resolveCitations()` for lazy fetch
6. Step 3 audit — enforce citation resolution
7. `mock-regulation-api.ts` — optional `batchGetClauses()`
8. Tests — update for new flow
