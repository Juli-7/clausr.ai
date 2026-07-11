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
├── compliance-tools.ts            # LLM-callable tool schemas + dispatch
├── compliance-chat.ts             # Single LLM+tool chat entry point
├── compliance-audit-tools.ts      # start_audit workflow engine (see Sub-agent pattern)
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

### Tool classification

Most tools are plain function calls — the LLM invokes them and gets back a result synchronously. `start_audit` is different: it's a **predefined multi-step workflow** that spawns a sub-agent.

| Tool | Mutates | Kind | Purpose |
|---|---|---|---|
| `set_scope` | yes | function | Select compliance packs |
| `update_doc_field` | yes | function | Fill a single document field |
| `batch_update_doc_fields` | yes | function | Fill multiple fields at once |
| `attach_file` | yes | function | Upload + process a file |
| `detach_file` | yes | function | Remove an uploaded file |
| `export_document` | no | function | Generate download URL |
| `go_to_phase` | yes | function | Move workflow phase |
| `list_packs` | no | function | List available packs |
| `read_pack` | no | function | Read pack content for relevance assessment |
| `start_audit` | yes | **workflow** | Run predefined audit pipeline (see below) |
| `poll_audit` | no | function | Check audit status |
| `get_check_detail` | no | function | Read per-check results |

| `get_session_state` | no | function | Full snapshot |
| `get_file_content` | no | function | Read extracted file text |
| `run_validation` | yes | function | Check doc completeness |
| `search_clauses` | no | function | Keyword search in regulations |
| `get_regulation_text` | no | function | Full regulation/clause text |
| `search_files` | no | function | Keyword search in uploaded files |
| `suggest_lesson` | yes | function | Record lesson from findings |

### `start_audit` — the sub-agent workflow

`start_audit` is registered as a tool but internally runs a **three-layer pipeline**:

```
outer LLM (complianceChat, step=3 prompts)
  │
  └─ calls start_audit tool
       │
       ├─ setupPackAudit()                  ← Layer 1: non-LLM
       │    init session → create context → generate steps → persist
       │
       ├─ runPendingChecks()                ← Layer 2: sub-agent
       │    └─ for each pending check:
       │         executeLlmToolStep(check, ctx)
       │           ├─ buildSystemPrompt()   ← its own system prompt (per-check eval)
       │           ├─ buildUserMessage()
       │           ├─ tool: checkCompliance ← its own tool registry
       │           └─ returns {value, verdict, citations}
       │
       └─ outer LLM receives results       ← Layer 3: back to chat LLM
            calls: export_document, search_clauses, suggest_lesson, etc.
```

**Layer 1** is pure DB + context setup. **Layer 2** is a sub-agent: it gets its own system prompt (`buildSystemPrompt`), its own user message per check, and its own limited tool set (`checkCompliance` for numerical evaluation). It never talks to the user. **Layer 3** returns control to the outer LLM, which can call any other tool to present results.

This means the engine has **two LLM call sites** with different roles:

| Call site | Location | Prompt | Role |
|---|---|---|---|
| `complianceChat` | `compliance-chat.ts` | `COMPLIANCE_SYSTEM_PROMPTS[1\|2\|3]` | Conversational orchestrator — talks to user, calls tools (including `start_audit`) |
| `executeLlmToolStep` | `executors/llm-executor.ts` | `buildSystemPrompt()` + `buildUserMessage()` | Structured evaluator — reads documents, produces fixed-format JSON per check |

The two-tier design keeps conversation fluid (outer) while evaluations stay rigid and parseable (inner).

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
