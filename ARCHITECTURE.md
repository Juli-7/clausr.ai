# clausr.ai Architecture

## Segments

### 1. Knowledge Layer
- **Regulation DB** (`src/lib/agent/regulation/`) — structured regulation data with API interface
  - `regulation-types.ts` — types for Regulation, Clause, versioning, API request/response, Zod validation schemas
  - `regulation-api.ts` — `IRegulationApi` interface (`getRegulation`, `getClause`, `listRegulations`, `searchClauses`, `resolveCode`, `invalidateCache`); factory `getRegulationApi()` / `setRegulationApi()` for swapping mock ↔ real
  - `mock-regulation-api.ts` — mock implementation with R48, R112, R83, R154, R13; code alias resolution; clause-level caching; Zod validation on return
  - `skill-source.ts` — skill-specific §6 rule parsing; `loadReferencesForConditions` (old format) / `loadReferencesForRegulationIds` (new format); async variants `getClauseTextAsync` / `loadReferencesForRegulationIdsAsync` prefer API, fall back to file-based `references/` directory
- **Domain Skills** (`src/lib/agent/skill/`) — SKILL.md loaded via `loader.ts`; new format uses `## Checks` table parsed by `check-parser.ts` to derive regulation IDs and domain schema; old `## Workflow` format still supported

### 2. Input Layer
- **File extraction** (`src/lib/agent/file/`) — OCR, PDF, DOCX with chunk-level positioning
- **Schema validation** — Zod schemas in `src/lib/agent/schemas.ts`
- **Session persistence** (`src/lib/agent/memory/`) — conversation history, context snapshots

### 3. Pipeline (`src/lib/agent/pipeline/`)
- **Orchestrator** (`orchestrator-v2.ts`) — coordinator async generator; calls 5 phases in sequence, keeps step execution loop inline for real-time token/tool-result streaming
- **PipelineContext** (`pipeline-context.ts`) — shared state: skill (incl. `checks`), files, palette, conversation, session store
- **Step dispatcher** (`step-executor.ts`) — dispatch by type: `llm`, `llm+tool`, `builtin:*`; retry logic
- **Phase modules** (`phases/`):
  - `init-phase.ts` — load skill, create session, build `PipelineContext`
  - `input-phase.ts` — extract files or restore from saved chunks
  - `execute-phase.ts` — `parseStepsPhase()`: parse SKILL.md §2 Execution Flow
  - `report-phase.ts` — template auto-report with claim extraction + chunk validation retry
  - `finalize-phase.ts` — verdict, confidence, post-validation, response assembly, persist
- **Builtins** (`builtins.ts`) — reference loading: picks `loadReferencesForRegulationIds` when checks present, falls back to `extractConditions` + `loadReferencesForConditions` for old format; compliance check calculator
- **LLM executor** (`executors/llm-executor.ts`) — `streamText` with dual-path output guide: `buildDomainSchemaGuide()` for new format (checks → Zod → structured output guide), `buildTemplateOutputGuide()` for old format

### 4. Output Layer
- **Report assembly** (`src/lib/agent/export/`) — sections, claims, citations
- **.docx export** (`src/lib/export-docx.ts`) — template placeholder replacement: ID-based matching first (`{{R48.6.2}}`), convention-based fallback (`{{vehicle.make}}` → `data.vehicle.make`)

## Key Design Decisions
- Domain schema derived from `## Checks` table at runtime, not separate `domain-schema.json`
- Convention-based template mapping avoids `mapping.json` overhead
- Regulation loading via file I/O (`skill-source.ts`), not mock/DB — `mock-regulations.ts` unused
- Backward-compatible: old `## Workflow`/keyword-based format works via fallback at every layer
- Pipeline decomposed into 5 phases, each in its own module under `phases/`; orchestrator coordinates and handles all streaming/yielding

## Data Flow
```
orchestratePipeline() — async generator, coordinates phases, yields events
│
├─ Phase 1 (init-phase.ts)
│   loadSkill → createPipelineContext → return ctx
│
├─ Phase 2 (input-phase.ts)
│   extractFileContent (or restore from saved chunks) → modify ctx.files
│
├─ Phase 3 — parse & execute
│   ├─ parseStepsPhase (execute-phase.ts): parseSteps from skillmd
│   └─ Step execution loop (inline in orchestrator):
│       for each step: executeStep → yield tokens/tool-results → snapshot
│
├─ Phase 4 (report-phase.ts)
│   template auto-report with claim extraction + chunk validation retry
│   or simple results display (no template)
│
└─ Phase 5 (finalize-phase.ts)
    computeVerdict → computeObjectiveConfidence → postValidate →
    build response → AgentResponseSchema.parse → persist → return AgentResponse
```

## Pipeline Directory Structure
```
pipeline/
├── orchestrate-v2.ts          # coordinator, async generator, yields events
├── pipeline-context.ts         # shared state + factory
├── step-executor.ts            # step dispatch (llm/llm+tool/builtin)
├── builtins.ts                 # built-in step handlers (ref loading, compliance calc)
├── clause-texts.ts             # palette → clause text map
├── post-validate.ts            # post-execution validation (citations, chunks, template)
├── errors.ts                   # PipelineError types + correlation IDs
├── logger.ts                   # pipeline debug logging
├── executors/llm-executor.ts   # LLM step execution (streamText, tool dispatch)
└── phases/
    ├── types.ts                # PipelineEvent union type
    ├── init-phase.ts           # skill loading, session, context creation
    ├── input-phase.ts          # file extraction / restoration
    ├── execute-phase.ts        # step parsing (parseStepsPhase)
    ├── report-phase.ts         # auto report compilation
    └── finalize-phase.ts       # verdict, confidence, validation, response
## Pre-existing Issues (not introduced by segmentation work)
- `schemas.test.ts`: 7 of 21 tests fail — `CitationSchema.ref` type mismatch, `dataUrl` pattern reject
