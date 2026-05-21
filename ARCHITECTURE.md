# clausr.ai Architecture

## Segments

### 1. Knowledge Layer
- **Regulation DB** (`src/lib/agent/regulation/`) — reference file loading by condition (old format) or regulation ID (new format); `skill-source.ts` provides `loadReferencesForConditions` and `loadReferencesForRegulationIds`
- **Domain Skills** (`src/lib/agent/skill/`) — SKILL.md loaded via `loader.ts`; new format uses `## Checks` table parsed by `check-parser.ts` to derive regulation IDs and domain schema; old `## Workflow` format still supported

### 2. Input Layer
- **File extraction** (`src/lib/agent/file/`) — OCR, PDF, DOCX with chunk-level positioning
- **Schema validation** — Zod schemas in `src/lib/agent/schemas.ts`
- **Session persistence** (`src/lib/agent/memory/`) — conversation history, context snapshots

### 3. Pipeline (`src/lib/agent/pipeline/`)
- **PipelineContext** (`pipeline-context.ts`) — shared state: skill (incl. `checks`), files, palette, conversation, session store
- **Orchestrator** (`orchestrator-v2.ts`) — step-parsing loop, passes `skill.checks` to `createPipelineContext`
- **Executors** (`executors/`) — `llm-executor.ts` dual-path: `buildDomainSchemaGuide()` for new format (checks → Zod → structured output guide), `buildTemplateOutputGuide()` for old format
- **Builtins** (`builtins.ts`) — reference loading: picks `loadReferencesForRegulationIds` when checks present, falls back to `extractConditions` + `loadReferencesForConditions` for old format
- **Steps** — concept, instruction, conversation, builtin (refs loaded into palette, citation palette built from clauseIndex)

### 4. Output Layer
- **Report assembly** (`src/lib/agent/export/`) — sections, claims, citations
- **.docx export** (`src/lib/export-docx.ts`) — template placeholder replacement: ID-based matching first (`{{R48.6.2}}`), convention-based fallback (`{{vehicle.make}}` → `data.vehicle.make`)

## Key Design Decisions
- Domain schema derived from `## Checks` table at runtime, not separate `domain-schema.json`
- Convention-based template mapping avoids `mapping.json` overhead
- Regulation loading via file I/O (`skill-source.ts`), not mock/DB — `mock-regulations.ts` unused
- Backward-compatible: old `## Workflow`/keyword-based format works via fallback at every layer

## Data Flow
```
SKILL.md → loader.ts → checks[], regulationIds[]
                             ↓
createPipelineContext() → ctx.skill.checks[]
                             ↓
llm-executor: checks present? → buildDomainSchemaGuide() : buildTemplateOutputGuide()
                             ↓
builtins: checks present? → loadReferencesForRegulationIds() : loadReferencesForConditions()
                             ↓
palette built from loaded references' clauseIndex
```

## Pre-existing Issues (not introduced by segmentation work)
- `schemas.test.ts`: 7 of 21 tests fail — `CitationSchema.ref` type mismatch, `dataUrl` pattern reject
