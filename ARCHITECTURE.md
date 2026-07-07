# clausr Engine Architecture

## Entry Point

`packages/engine/src/index.ts` — barrel that defines the public API (~30 runtime exports, ~15 types). The engine is consumed as `@clausr/engine` by an external application (not in this repo). Every export is the contract with that consumer.

```
src/
├── index.ts                       # Barrel — public API
├── client.ts                      # Browser-safe subset (generateDocx, AgentResponse)
├── types-only.ts                  # Client-safe type re-exports
├── db/schema.ts                   # SQLite schema DDL
├── compliance-packs.ts            # Pack search + browse
├── compliance-session.ts          # UI-friendly session state builder
├── compliance-tools.ts            # LLM-callable tool definitions + registries
├── compliance-chat.ts             # Single LLM+tool chat entry point
├── compliance-audit.ts            # (being replaced by tools)
├── skill-generator.ts             # (being replaced by tools)
└── agent/
    ├── shared/                    # Cross-cutting dependencies
    │   ├── schemas.ts             #   Zod schemas
    │   ├── types.ts               #   TS type re-exports from schemas
    │   └── memory/
    │       ├── database.ts        #   SQLite connection lifecycle
    │       └── repository.ts      #   All DB read/write
    ├── knowledge/                 # Regulation data (internal — consumed by tools)
    │   ├── regulation-api.ts      #   IRegulationApi + factory
    │   ├── mock-regulation-api.ts #   Mock implementation
    │   └── regulation-types.ts
    ├── user-info/                 # File extraction (internal — consumed by tools)
    │   ├── extractors/            #   PDF, DOCX, OCR
    │   └── vector-store/          #   IDocStore interface + mock
    ├── loading/                   # Session setup (internal — consumed by tools)
    │   ├── loading-orchestrator.ts
    │   ├── generate-steps.ts
    │   ├── cleanup.ts
    │   ├── phases/
    │   └── skill/
    ├── pipeline/                  # Step execution (internal — consumed by tools)
    │   ├── builtins.ts            #   executeComplianceCheck
    │   ├── executors/             #   llm-executor, script-runner
    │   └── slices/                #   CheckStore, StepMemory, FileRegistry, etc.
    ├── evaluation/                # Evaluation tools (exported as callables)
    │   ├── index.ts               #   evaluate()
    │   ├── confidence.ts          #   computeConfidence()
    │   └── types.ts               #   EvaluationInput, EvaluationResult
    ├── present/                   # Export tools (exported as callables)
    │   ├── export/
    │   │   └── export-docx.ts     #   generateDocx()
    │   └── template-types.ts
    └── llm/                       # LLM provider (internal — consumed by chat)
        ├── factory.ts
        ├── config.ts              #   setLLMConfig, getConfig, setRetentionConfig
        └── deepseek.ts
```

## Data Flow

The engine has a single entry point: `complianceChat`. Tools handle all the work.

```
consumer UI ──→ complianceChat(sessionId, {messages, step, systemPrompt?})
                    │
                    ├── createModel()         ← configured via setLLMConfig
                    ├── register TOOL_DEFS    ← all tools registered
                    ├── streamText({model, system, messages, tools, maxSteps})
                    │     └── onStepFinish → tool calls → mutations → results
                    │
                    └── yields ComplianceChatEvent:
                          text-delta     → streaming response text
                          tool-call      → tool name + args (for UI rendering)
                          tool-result    → tool output (for UI update)
                          finish         → finish reason
                          done           → final response + token usage
                          error          → error message
```

### What each tool does

| Tool | Mutates | Purpose |
|---|---|---|
| `set_scope` | yes | Select compliance packs |
| `update_doc_field` | yes | Fill a single document field |
| `batch_update_doc_fields` | yes | Fill multiple fields at once |
| `attach_file` | yes | Upload + process a file |
| `detach_file` | yes | Remove an uploaded file |
| `export_document` | no | Generate download URL |
| `go_to_phase` | yes | Move workflow phase |
| `search_packs` | no | Browse/filter packs |
| `start_audit` | yes | Begin audit run |
| `poll_audit` | no | Check audit status |
| `get_check_detail` | no | Read per-check results |
| `get_pack_details` | no | Pack definition |
| `recommend_packs` | no | AI-driven pack suggestions |
| `get_session_state` | no | Full snapshot |
| `get_file_content` | no | Read extracted file text |
| `run_validation` | yes | Check doc completeness |
| `search_clauses` | no | Keyword search in regulations |
| `get_regulation_text` | no | Full regulation/clause text |
| `search_files` | no | Keyword search in uploaded files |
| `suggest_lesson` | yes | Record lesson from findings |

### Directly callable exports (for UI buttons outside chat)

```
evaluate({checkResults, ...})        → {confidence, findings, validationErrors}
computeConfidence(input)             → Confidence
executeComplianceCheck({value, ...}) → {status, note}
runScript(path, input, timeout)      → parsed JSON
generateDocx(response, skill)        → Blob
searchPacks({query?, regulation?})   → SkillPack[]
getPack(id)                          → SkillPack | undefined
loadPack(name)                       → SkillPack | undefined
listPacks()                          → string[]
saveSkillToFs(name, content)         → void
buildSession(id)                     → ComplianceSession | undefined
```

## Exports Summary

| Group | Exports |
|---|---|
| **Config** | `setLLMConfig`, `getConfig`, `setRetentionConfig`, `setDb`, `getDb`, `setRegulationApi`, `setDocStore` |
| **Session** | `getOrCreateSession`, `ensureComplianceSession`, `getComplianceSession`, `deleteSession`, `setComplianceComments`, `getComplianceComments`, `buildSession` |
| **Packs** | `searchPacks`, `getPack`, `listPacks`, `loadPack`, `saveSkillToFs` |
| **Tools** | `TOOL_DEFS`, `ToolSchemas`, `getTool`, `executeComplianceCheck`, `runScript` |
| **Chat** | `complianceChat` |
| **Evaluate** | `evaluate`, `computeConfidence` |
| **Export** | `generateDocx` |
| **Types** | `ComplianceSession`, `ValidationCheck`, `SkillPack`, `PackCheck`, `ToolDef`, `ToolName`, `ToolInput`, `EvaluationInput`, `EvaluationResult`, `ReportTemplate`, `TemplateSection`, `TemplateField`, `ComplianceChatEvent`, `ComplianceChatParams`, `AgentResponse`, `IRegulationApi` |

## Core Data Structures

- **`ComplianceSession`** — full session snapshot for UI: packs, doc fields, files, audit results, messages, validation, comments.
- **`ToolDef`** — a registered tool: `{name, description, inputSchema, execute}`. LLM calls via complianceChat; UI calls directly for button actions.
- **`SkillPack`** — a compliance pack: checks, documents, field definitions, regulation references.
- **`AgentResponse`** — the only previous-pipeline type still exported, used by `generateDocx`.

## Design Principles

- **Tool-ized execution.** The LLM decides when to call tools. Consumer UI can also call any tool directly.
- **data at the consumer.** Packs, regulations, and session state are configured by the consumer via setters (`setRegulationApi`, `setDocStore`, `setDb`).
- **Single entry point.** `complianceChat` is the only orchestrator. No separate setup/chat/audit endpoints — the tools handle all phases.
- **`streamText` (not `streamObject`)** for reliable tool calling across providers. JSON output is fence-stripped post-hoc.
