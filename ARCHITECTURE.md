# clausr Engine Architecture

## Entry Point

`packages/engine/src/index.ts` — barrel that defines the public API. The engine is consumed as `@clausr/engine` by an external application (not in this repo). Every export is the contract with that consumer.

```
src/
├── index.ts                       # Barrel — public API (~200 exports)
├── client.ts                      # Thin client wrapper for external consumers
├── types-only.ts                  # Type-only re-exports (no runtime code)
├── db/schema.ts                   # SQLite schema DDL
├── compliance-packs.ts            # Compliance pack search/get/list
├── compliance-session.ts          # UI-friendly compliance session builder
├── compliance-tools.ts            # LLM-callable tool definitions
├── compliance-chat.ts             # Multi-step tool loop for compliance chat
├── compliance-audit.ts            # Async pack-by-pack audit pipeline
├── skill-generator.ts             # LLM-based SKILL.md generation
└── agent/
    ├── shared/                    # Cross-cutting dependencies
    │   ├── schemas.ts             #   Zod schemas (ChatRequest, AgentResponse, etc.)
    │   ├── types.ts               #   TypeScript type re-exports from schemas
    │   └── memory/
    │       ├── database.ts        #   SQLite connection lifecycle
    │       └── repository.ts      #   All DB read/write (session, chunks, messages, skills)
    ├── knowledge/                 # Regulation data
    │   ├── regulation-api.ts      #   IRegulationApi interface + get/set factory
    │   ├── mock-regulation-api.ts #   Mock implementation (R48, R112, R83, R154, R13)
    │   └── regulation-types.ts    #   Regulation/Clause types
    ├── user-info/                 # File extraction
    │   ├── extractors/            #   PDF (pdfjs-dist), DOCX (mammoth), OCR (tesseract)
    │   └── vector-store/          #   IDocStore interface + mock implementation
    ├── loading/                   # One-time session setup
    │   ├── loading-orchestrator.ts #   setupSession() coordinator
    │   ├── generate-steps.ts      #   ParsedCheck[] → ExecutableStep[]
    │   ├── cleanup.ts             #   Session pruning
    │   ├── phases/
    │   │   ├── init-phase.ts      #   Skill loading, session creation
    │   │   └── input-phase.ts     #   File processing during setup
    │   └── skill/
    │       ├── loader.ts          #   SKILL.md loading + parsing
    │       └── check-parser.ts    #   ## Checks → ParsedCheck[]
    ├── pipeline/                  # Per-turn step execution
    │   ├── orchestrator-v2.ts     #   Async generator — coordinates one turn
    │   ├── pipeline-context.ts    #   Shared state factory + DB restore
    │   ├── builtins.ts            #   Reference loading + compliance check tool
    │   ├── errors.ts              #   PipelineError hierarchy + correlation IDs
    │   ├── logger.ts              #   Pipeline debug logging
    │   ├── revision-phase.ts      #   Step revision targeting
    │   ├── types.ts               #   ExecutableStep, StepResult, PipelineEvent
    │   ├── prompts/index.ts       #   All LLM system prompts
    │   ├── executors/
    │   │   ├── llm-executor.ts    #   streamText-based LLM step executor
    │   │   └── script-runner.ts   #   Python subprocess execution
    │   └── slices/                # Pipeline-owned state stores
    │       ├── check-store.ts     #   CheckResult[], compiled citations
    │       ├── step-memory.ts     #   Step outputs by number
    │       ├── file-registry.ts   #   Uploaded files + chunk metadata
    │       ├── palette-store.ts   #   Regulation clauses + citation palette
    │       └── report-assembler.ts#   Report sections + content assembly
    ├── evaluation/                # Post-execution evaluation
    │   ├── index.ts               #   evaluate() entry point
    │   ├── confidence.ts          #   Confidence scoring (OCR, PDF, LLM multipliers)
    │   ├── summary.ts             #   Findings builder from check results
    │   ├── validate.ts            #   Citation/chunk consistency validation
    │   └── types.ts               #   Evaluation input/output types
    ├── present/                   # Response assembly
    │   ├── phases/
    │   │   └── finalize-phase.ts  #   Verdict + AgentResponse building
    │   ├── export/
    │   │   └── export-docx.ts     #   .docx template filling
    │   └── template-types.ts      #   Report template types
    └── llm/                       # LLM provider abstraction
        ├── factory.ts             #   createModel() — Anthropic/OpenAI/DeepSeek
        ├── config.ts              #   Provider + retention config management
        └── deepseek.ts            #   DeepSeek provider adapter
```

## Data Flow

### Setup (once per session)

```
setupSession({skillName?, sessionId, files?, message?})
  ├── initSession()            → load SKILL.md, parse ##Checks, create DB session
  ├── inputPhase()             → extract files (pdfjs/mammoth/OCR)
  ├── skillGenPhase()          → (optional) LLM-generate SKILL.md from user message
  ├── generateStepsFromChecks()→ ParsedCheck[] → ExecutableStep[]
  └── saveSessionSetup()       → persist skill + steps + file metadata to DB
```

### Chat (per turn — async generator yielding PipelineEvent for SSE)

```
orchestratePipeline(sessionId, message, revisionFields?)
  ├── restoreContext()         → load PipelineContext + ExecutableStep[] from DB
  ├── docStore.getFiles()      → populate ctx.files with chunk data
  ├── loadRegulationSummaries()→ populate ctx.palette with regulation clauses
  ├── initPipelineTurn()       → log message, restore previous turn data
  ├── identifyRevisionTargets()→ map revision field names → step numbers
  ├── [loop per step]
  │     executeStepWithRetry()
  │       └── executeLlmToolStep()
  │             ├── buildContextSummary (file chunks, palette, prior results)
  │             ├── streamText({model, system prompt, tools, maxSteps})
  │             │     └── onStepFinish → parse JSON → CheckResult
  │             ├── ctx.checks.addResults()
  │             └── ctx.steps.write(stepNumber, output)
  └── finalizePhase()
        ├── evaluate()         → confidence score + findings + validation
        ├── build AgentResponse (content, citations, sections, verdict)
        └── persist to DB
```

## Key Exports by Layer

| Barrel group | Key exports | Purpose |
|---|---|---|
| **Repository** | `getOrCreateSession`, `addUserMessage`, `addAssistantResponse`, `getConversationHistory`, `saveContextSnapshot`, `searchChunksFts5`, `saveSessionSetup`, `loadSessionSetup` | All DB operations |
| **Schemas** | `AgentResponseSchema`, `ChatRequestSchema`, `ConfidenceSchema`, `parseChunkRef` | Zod validation + chunk ref parsing |
| **Pipeline** | `orchestratePipeline` | Per-turn LLM execution loop |
| **Loading** | `setupSession`, `setupSkill`, `processSessionFiles` | One-time session initialization |
| **Knowledge** | `getRegulationApi`, `setRegulationApi`, `seedRegulations` | Regulation data source (mock/real) |
| **Extractors** | `extractFileContent` | PDF/DOCX/image → text + chunks |
| **Evaluation** | `evaluate`, `computeConfidence` | Post-execution scoring |
| **Presentation** | `generateDocx` | .docx template filling |
| **LLM** | `createModel`, `setLLMConfig` | LLM provider + configuration |
| **Compliance** | `complianceChat`, `runComplianceAudit`, `searchPacks`, `TOOL_DEFS` | Compliance-specific tool loops |
| **Skill Gen** | `generateSkill` | LLM-based SKILL.md generation |

## Core Data Structures

- **`PipelineContext`** — in-memory carrier for all session state on each turn. Owns 4 slices: `CheckStore` (verdicts), `StepMemory` (LLM outputs), `FileRegistry` (uploaded file chunks), `PaletteStore` (regulation clauses).
- **`ExecutableStep`** — a single evaluation step derived from one `## Checks` row. Carries `number`, `title`, `type` (llm+tool, builtin), `instructions`, `field` reference.
- **`CheckResult`** — per-field evaluation outcome: `{field, type, finding, verdict, citationRef[], sourceCitation[]}`.
- **`AgentResponse`** — final output to the consumer: `{content, reasoning, citations, verdict, confidence, sections, ...}`.

## Constraints

- **Setup runs once per session.** Pipeline restores from DB on each turn — `setupSession()` must be called before `orchestratePipeline()`.
- **LLM calls use `streamText`** (not `streamObject`) for reliable tool calling across providers. JSON output is fence-stripped and parsed post-hoc.
- **Skills are self-describing.** Domain schema is derived from the `## Checks` table at runtime, not a separate config file.
