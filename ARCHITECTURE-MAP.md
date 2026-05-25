# clausr.ai — Function-Level Architecture Map

## Segment Boundaries & Decoupling Interfaces

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 1: KNOWLEDGE LAYER                                 │
│                                                                                      │
│  knowledge/regulation-api.ts      knowledge/mock-regulation-api.ts                   │
│  ┌──────────────────────┐         ┌──────────────────────────────────────┐           │
│  │ IRegulationApi       │         │ MockRegulationApi (class)            │           │
│  │ getRegulationApi()   │────────►│  .getRegulation(req)                 │           │
│  │ setRegulationApi()   │         │  .getClause(req)                     │           │
│  └──────────────────────┘         │  .listRegulations(req)               │           │
│                                   │  .searchClauses(req)                 │           │
│  knowledge/regulation-types.ts    │  .resolveCode(rawCode)               │           │
│  ┌──────────────────────┐         │  .invalidateCache()                  │           │
│  │ Clause, Regulation   │         └──────────────────────────────────────┘           │
│  │ Zod schemas          │                                                           │
│  └──────────────────────┘                                                           │
│                                                                                      │
│  CONSIDERS FROM: nothing (passive data source)                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    SEGMENT 2: SESSION INPUT LAYER (EXTRACTION + STORAGE)               │
│                                                                                      │
│  user-info/extractors/ (real — OCR/pdf.js/mammoth)      user-info/vector-store/      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     ┌───────────────────────┐    │
│  │ OCR (Tesser) │ │ PDF (pdfjs)  │ │ DOCX (mamm- │     │ IDocStore interface    │    │
│  │ extractImage │ │ extractPdf   │ │ oth)         │     │ (processFile = real,   │    │
│  │ Text()       │ │ Text()       │ │ extractDocx  │     │  getFiles = mock vecDB │    │
│  └──────────────┘ └──────────────┘ │ Text()       │     │  retrieval — returns   │    │
│                                    └──────────────┘     │  ALL chunks today)     │    │
│  Clausr.ai MUST do extraction + chunking itself because: └──────────┬────────────┘    │
│   • Bounding boxes (spatial coords) are needed for UI highlighting  │                 │
│   • OCR confidence feeds into evaluation layer's confidence formula  │                 │
│   • Chunk IDs must be deterministic for LLM citation refs [S1.c3]   │                 │
│   • Page numbers needed for source display                           │                 │
│                                                                      │                 │
│  ┌────────────────────────────────────────────────────────────────────┘                 │
│  │                                                                                      │
│  ├─ MockDocStore (class) — wraps extractors + raw file disk persistence                 │
│  │  .processFile(file, sessionId)                                                       │
│  │    → saveRawFile() to data/uploads/{sessionId}/{filename}  (NEW — raw file on disk)  │
│  │    → extractFileContent() → chunk → saveChunks() → saveFileChunks()                  │
│  │    → return { extractedText }                                                        │
│  │  .getFiles(sessionId)                                                                │
│  │    → reads file_chunks + chunk_store → returns ALL ProcessedFile[]                   │
│  │    → dataUrl constructed as /api/files/{sessionId}/{filename} URL                    │
│  │    (MOCK behavior — real vecDB will embed query and return top-k chunks)             │
│  └──────────────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 3: LOADING LAYER (ONCE PER SESSION)                │
│                                                                                      │
│  loading/loading-orchestrator.ts — TOP-LEVEL ORCHESTRATOR                            │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │ setupSession({skillName?, sessionId, files?, message?})                        │  │
│  │  1. initSession()       → load SKILL.md OR prepare auto placeholder            │  │
│  │  2. createPipelineContext() → in-memory carrier for ALL session state:         │  │
│  │                               CheckStore(verdicts), StepMemory(outputs),       │  │
│  │                               FileRegistry(chunks/x), PaletteStore(regs/refs), │  │
│  │                               ReportAssembler(sections)                        │  │
│  │  3. inputPhase()         → calls docStore.processFile() (vector-store layer)     │  │
│  │     (returns extractedText[]; no ctx.files population)                           │  │
│  │  4. skillGenPhase(ctx, message, fileTexts) → if auto, generate SKILL.md        │  │
│  │     as param (no longer reads from ctx.files)                                   │  │
│  │  5. generateStepsFromChecks() → ExecutableStep[] 1:1 from ##Checks              │  │
│  │  6. saveSessionSetup()   → persist skill + steps + file metadata to              │  │
│  │     session_setup table (palette is empty — pipeline loads regs)                 │  │
│  │                                                                                  │  │
│  │  OUTPUT READY: ExecutableStep[], skill metadata,                                  │  │
│  │  file metadata (empty FileRegistry), docStore has chunk data                     │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  loading/phases/init-phase.ts        ┌── SKILL SOURCE (parallel branches) ──┐        │
│  ┌─────────────────────────────┐     │                                      │        │
│  │ initSession(name?, sid)     │     │ loading/skill/loader.ts              │        │
│  │  → EITHER loadSkill(id)    │──┬──►│ loadSkill(id)      ← pre-existing   │        │
│  │    OR placeholder for auto │  │   │   matter(SKILL.md) → frontmatter     │        │
│  │  → getOrCreateSession()    │  │   └────────────────────────────────────┘         │
│  │                            │  │   loading/extractors/skill-generator.ts           │
│  │ initPipelineTurn(ctx, sid, │  └──►│ generateSkill()    ← auto (LLM-gen) │        │
│  │  msg, cid) — per turn     │      │   streamText() → matter() → checks   │        │
│  │  → addUserMessage + restore│      └──────────────────────────────────────┘        │
│  │    previous step outputs   │                                                     │
│  └─────────────────────────────┘    loading/skill/check-parser.ts                    │
│                                      ┌──────────────────────────────────────┐        │
│  loading/generate-steps.ts           │ parseChecks(skillmd)                 │        │
│  ┌──────────────────────┐            │ extractRegulationIds(checks)         │        │
│  │ generateStepsFrom-   │            └──────────────────────────────────────┘        │
│  │  Checks(checks)      │            loading/phases/input-phase.ts                    │
│  │ buildFieldInstruc-   │            ┌──────────────────────────────────────┐        │
│  │  tions(c)            │            │ inputPhase(ctx, {files, sessionId}) │        │
│  └──────────────────────┘            │  → calls docStore.processFile()      │        │
│                                      │    (vector-store: extract + chunk   │        │
│  pipeline/revision-phase.ts           │     + store, return extractedText)  │        │
│  ┌──────────────────────────────┐                                                    │
│  │ identifyRevisionTargets(field│                                                    │
│  │  s, checks)                  │                                                    │
│  │  → maps checkbox fields→step │                                                    │
│  │    nums (PIPELINE runtime)   │                                                    │
│  └──────────────────────────────┘                                                    │
│                                                                                      │
│  PROVIDES: session_setup persistence — PipelineContext (FileRegistry has metadata    │
│    only, no chunks; PaletteStore empty — pipeline loads regs; StepMemory with        │
│    step definitions), plus ExecutableStep[]                                           │
│  CONSIDERS FROM: Session Input (processFile), Shared (DB persistence)               │
│  CONSUMED BY: POST /api/setup → setupSession()                                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 4: PIPELINE (PER TURN)                              │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  orchestrator-v2.ts (ENTRY POINT — async generator, yields PipelineEvent)   │    │
│  │  orchestratePipeline(sessionId, message, revisionFields?)                   │    │
│  │    ├─► restoreContext(sessionId)  — load ctx + steps from session_setup DB   │    │
│  │    ├─► docStore.getFiles(sessionId) → ctx.files.loadFiles() — populate      │    │
│  │    │    chunks from doc store (mock: all chunks; real vecDB: per-step)       │    │
│  │    ├─► initPipelineTurn()         — addUserMessage + restore previous turns   │    │
│  │    ├─► identifyRevisionTargets()  — map field names → step numbers (user-driven)
│  │    ├─► [loop] executeStepWithRetry — execute each step (llm+tool, retry 1x)  │    │
│  │    │      └─► executeLlmToolStep() — core LLM+tool executor                  │    │
│  │    └─► finalizePhase()             — evaluate + assemble + persist          │    │
│  │                                                                            │    │
│  │  Key patterns in step loop:                                                │    │
│  │   • Skip steps with existing output unless revision target                 │    │
│  │   • Clear-before-execute: remove old CheckResult, restore on failure       │    │
│  │   • Save context snapshot after each step                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│         │               │              │               │              │              │
│         ▼               ▼              ▼               ▼              ▼              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────────┐  │
│  │ builtins.ts │ │ errors.ts   │ │ logger.ts   │ │ types.ts    │ │ pipeline-     │  │
│  │ loadRefer-  │ │ PipelineErr │ │ logPipeline │ │ PipelineEv- │ │ context.ts    │──│──┐
│  │ ences()     │ │ format...   │ │ truncate()  │ │ ent,        │ │ createPipe-   │  │  │
│  │ .execute-   │ └─────────────┘ └─────────────┘ │ Executable- │ │ lineContext() │  │  │
│  │  Compliance │                                  │ Step,       │ │ restoreCtx()  │  │  │
│  │  Check()    │                                  │ StepResult  │ └───────────────┘  │  │
│  └─────────────┘                                  └─────────────┘                    │  │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │ executors/llm-executor.ts                                                     │  │  │
│  │ executeLlmToolStep(step, ctx, previousError?) — LLM+tool executor with retry  │  │  │
│  │ buildDomainSchemaGuide(checks), buildContextSummary(ctx), buildCitationGuide()│  │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │  │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │ executors/script-runner.ts                                                     │  │  │
│  │ runScript(scriptPath, input, timeoutMs) — spawns python3 subprocess            │  │  │
│  │   → used for compliance-check scripts defined in SKILL.md                      │  │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │  │
│  ┌──────────────────────────────────────────────────────────────────────────────┐    │  │
│  │ pipeline/slices/ (5 owned stores)                                            │◄───┘  │
│  │ CheckStore — CheckResult[], claims, compiled citations                       │       │
│  │ StepMemory — step outputs keyed by step number                               │       │
│  │ FileRegistry — uploaded files + chunks                                       │       │
│  │ PaletteStore — regulation clauses + citation palette                         │       │
│  │ ReportAssembler — report sections + verdict                                  │       │
│  └──────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                      │
│  PROVIDES: StepResult[], streamed PipelineEvents                                      │
│  CONSIDERS FROM: Pipeline slices (via restoreContext), session_setup (DB),              │
│    Session Input (getFiles for chunks), Knowledge (loadReferences for regs)         │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 5: EVALUATION LAYER                                │
│                                                                                      │
│  evaluation/index.ts                                                    │
│  ┌────────────────────────────────────┐                                              │
│  │ evaluate(input)                    │                                              │
│  │  → main entry, calls sub-modules   │                                              │
│  └──────────────┬─────────────────────┘                                              │
│                 │                                                                      │
│                 ▼                                                                      │
│                 │                                                                      │
│  evaluation/summary.ts          evaluation/confidence.ts                               │
│  ┌──────────────────────┐      ┌──────────────────────────────────────┐              │
│  │ buildFindings(checks)│      │ computeConfidence(input)             │              │
│  │  → failed-checks map  │      │  → OCR penalty + PDF + LLM mult.   │              │
│  └──────────────────────┘      └──────────────────────────────────────┘              │
│                                                                                      │
│  evaluation/validate.ts                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐           │
│  │ validate({claims, citations, sourceCitations, ...})                   │           │
│  │  → citation/chunk consistency, source palette lookup, word overlap   │           │
│  └──────────────────────────────────────────────────────────────────────┘           │
│                                                                                      │
│  PROVIDES: EvaluationResult {confidence, findings, validationErrors, reason}          │
│  CONSIDERS FROM: Pipeline (CheckStore, PipelineContext types)                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 6: PRESENT LAYER                                   │
│                                                                                      │
│  present/phases/finalize-phase.ts    present/export/export-docx.ts                    │
│  ┌─────────────────────────────────────────┐  ┌──────────────────────────────────┐   │
│  │ finalizePhase(ctx, steps, sessionId)    │  │ generateDocx(response, skill)    │   │
│  │  → runs evaluate()                      │  │  ├─ fillTemplateDocx()           │   │
│  │  → computes verdict + confidence        │  │  ├─ buildPlaceholderMap()        │   │
│  │  → builds AgentResponse                 │  │  ├─ normalizeConsecutiveRuns()   │   │
│  │  → validates with AgentResponseSchema   │  │  ├─ escapeXml()                  │   │
│  │  → persists to DB                       │  │  ├─ stripMarkdown()              │   │
│  │  → returns {response, validation        │  │  └─ buildFallbackDocx()          │   │
│  │       Errors, confidence}               │  └──────────────────────────────────┘   │
│  └─────────────────────────────────────────┘                                         │
│  │ formatContent(stepOutputs, checks, ..)                                            │
│  │  → assembles step narratives + citation badges into markdown                     │
│                                                                                      │
│  PROVIDES: AgentResponse, .docx Blob                                                  │
│  CONSIDERS FROM: Pipeline (step output), Evaluation (verdict/confidence)               │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 7: API ROUTES (Next.js App Router)                  │
│                                                                                      │
│  POST /api/setup —— once-per-session loading entry point (files, skill gen)          │
│  POST /api/chat —— per-turn SSE streaming pipeline entry point                       │
│  GET  /api/settings —— read LLM provider, model, retention config                    │
│  POST /api/settings —— persist LLM provider, model, retention                        │
│  GET  /api/sessions —— list all sessions                                              │
│  GET  /api/sessions/[id] —— conversation history + responses                         │
│  DELETE /api/sessions/[id] —— delete session cascade                                  │
│  POST /api/sessions/[id]/star —— toggle starred flag                                  │
│  GET  /api/skills —— list all skills with metadata                                   │
│  GET  /api/skills/[name]/template —— download skill .docx template                   │
│  POST /api/skills/[name]/template —— upload skill .docx template                     │
│  GET  /api/scripts?skillId= —— list scripts for a skill                               │
│  POST /api/scripts/[name] —— execute a named script for a skill                      │
│  GET  /api/files/[sessionId]/[filename] —— serve uploaded file                       │
│  POST /api/agent/evolution-confirm —— confirm/dismiss evolution lesson               │
│                                                                                      │
│  PROVIDES: HTTP responses; consumes Pipeline (chat), Shared (repository)              │
│  CONSIDERS FROM: Pipeline (orchestratePipeline), Shared (DB queries via repository)  │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SHARED (cross-layer)                                        │
│                                                                                      │
│  shared/memory/                     shared/schemas.ts                                 │
│  ┌──────────────────────────────┐  ┌─────────────────────────────────────┐           │
│  │ database.ts                   │  │ Zod schemas:                        │           │
│  │  getDb(), getSetting()        │  │ ChatRequestSchema                  │           │
│  │  setSetting()                 │  │ AgentResponseSchema                │           │
│  ├──────────────────────────────┤  │ CitationSchema, ConfidenceSchema     │           │
│  │ repository.ts                 │  │ ComplianceCheckSchema, ClaimSchema  │           │
│  │  getOrCreateSession()         │  │ ToolCallRecordSchema                │           │
│  │  addUserMessage()             │  │ ReasoningStepSchema, LessonSchema   │           │
│  │  addAssistantResponse()       │  │ ValidationErrorSchema               │           │
│  │  saveFileChunks()             │  │ ReferenceMapSchema                  │           │
│  │  deleteSession() / getAll...  │  │ parseChunkRef()                     │           │
│  │  saveSessionSetup / load...   │  └─────────────────────────────────────┘           │
│  │  saveContextSnapshot()        │                                                   │
│  │  toggleStar()                 │  shared/types.ts                                   │
│  └──────────────────────────────┘  ┌─────────────────────────────────────┐           │
│                                    │ Re-exports all types                │           │
│  (Layer-owned slices moved to      │ from schemas.ts                     │           │
│   pipeline/slices/ — CheckStore,   └─────────────────────────────────────┘           │
│   StepMemory, FileRegistry,                                                           │
│   PaletteStore, ReportAssembler,   llm/factory.ts (at src/lib/agent/llm/)            │
│   cleanup → loading/, template-    ┌─────────────────────────────────────┐           │
│   types → present/, turn-types     │ createModel() — creates Language-   │           │
│   → src/types/)                    │ Model from DB settings or env vars  │           │
│                                    └─────────────────────────────────────┘           │
│  CONSUMED BY: Loading (repository), Pipeline (repository),                            │
│    Evaluation (schemas/types), Present (schemas/repository), API Routes               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Function Call Flow (End-to-End)

The agent is split into two phases: **Setup** (once per session) and **Chat** (per turn).

### Phase 1: Setup — POST /api/setup

```
HTTP POST /api/setup
  │
  ├─ SetupRequestSchema.safeParse(req.body)   ← validates sessionId, skillName?, files?, message?
  │
  └─ setupSession({skillName?, sessionId, files?, message?})
       │  [loads everything, persists to session_setup DB]
       │
       ├─ generateCorrelationId()                                       → corr-{ts}-{n}
       │
       ├─ initSession(skillName, sessionId)
       │    ├─ loadSkill(skillName)              ◄── loading/skill/loader.ts
       │    │    ├─ matter(SKILL.md)              → frontmatter + body
       │    │    ├─ parseChecks(skillmd)          ◄── loading/skill/check-parser.ts
       │    │    │    └─ parseFieldType(raw)      → CheckFieldType
       │    │    ├─ extractRegulationIds(checks)  → ["R48", "R112", ...]
       │    │    ├─ discover scripts/             → [{name, path, desc}]
       │    │    │    └─ getScriptDescription()   → Python docstring
       │    │    └─ load template.json (optional) → ReportTemplate
        │    ├─ getOrCreateSession(sessionId, skillName)  ◄── shared/memory/repository.ts
        │    └─ [skill loaded into memory — no context created yet]
       │
       ├─ createPipelineContext(name, skillmd, checks, sessionId, cid)
       │    ├─ new CheckStore()
       │    ├─ new StepMemory()
       │    ├─ new FileRegistry()
       │    ├─ new PaletteStore()
       │    └─ new ReportAssembler()
       │
       ├─═══════════════════════════════════════════════════════════════
       │  LOADING — INPUT + SKILL GEN
       │════════════════════════════════════════════════════════════════
       │
        ├─ inputPhase(ctx, {files, sessionId})
        │    └─ docStore.processFile(file, sessionId)  ◄── user-info/vector-store/mock-store.ts
        │         └─ extractFileContent(file)           ◄── user-info extractors
        │              ├─ image/*  → Tesseract OCR
        │              ├─ .pdf     → pdfjs-dist (or render+OCR fallback)
        │              └─ .docx    → mammoth → splitParagraphs()
        │    └─ returns extractedTexts[] for auto-skill
        │       (no ctx.files population — chunks stored in doc store)
        │
        ├─ skillGenPhase(ctx, message, fileTexts)   (only if isAutoSkill)
        │    └─ generateSkill(message, fileTexts)  ◄── loading/extractors/skill-generator.ts
        │         ├─ streamText({model, system: SKILL_GENERATION_PROMPT, messages})
        │         ├─ matter(fullText) → frontmatter + body
        │         ├─ parseChecks(skillmd)
        │         └─ extractRegulationIds(checks)
        │
        ├─═══════════════════════════════════════════════════════════════
        │  LOADING — STEPS
        │════════════════════════════════════════════════════════════════
        │
        ├─ generateStepsFromChecks(ctx.skill.checks)  ◄── loading/generate-steps.ts
        │    └─ Steps 1..N: llm+tool (one per check field, with field instructions)
        │
        └─ saveSessionSetup(sessionId, {skillName, skillmd, checks, scripts,
                regulationIds, steps, paletteReferences, paletteCitations, fileRegistry})
             └─ INSERT into session_setup table (skill + steps + file metadata)
                (palette + file chunks loaded by pipeline layer on each turn)
```

### Phase 2: Chat — POST /api/chat (per turn)

```
HTTP POST /api/chat
  │
  ├─ ChatRequestSchema.safeParse(req.body)   ← validates message, sessionId, revisionFields?
  │
  ├─ hasSessionSetup(sessionId) → 400 if not set up yet
  │
  └─ orchestratePipeline(sessionId, message, revisionFields?)
       │  [async generator — yields PipelineEvent to client via SSE]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  RESTORE — Load session from DB
       │════════════════════════════════════════════════════════════════
       │
        ├─ restoreContext(sessionId)  ◄── pipeline/pipeline-context.ts
        │    ├─ loadSessionSetup(sessionId)      ◄── shared/memory/repository.ts
        │    ├─ PipelineContext.fromJSON(ctxJson) → reconstructed 5 slices
        │    ├─ ExecutableStep[].fromJSON(stepsJson)
        │    └─ Returns {ctx, steps, correlationId}
        │
        ├─ docStore.getFiles(sessionId)           ◄── user-info/vector-store/mock-store.ts
        │    └─ read file metadata + chunk texts from DB
        │    └─ ctx.files.loadFiles(ProcessedFile[])  ← populate chunks
        │
        ├─ loadReferences(ctx)                   ◄── pipeline/builtins.ts
        │    ├─ extract regulationIds from ctx.skill.checks
        │    ├─ loadRegulations(ids) via getRegulationApi()
        │    │    api.resolveCode(id) → api.getRegulation({code})
        │    └─ ctx.palette.loadCitationPalette(palette)  ← populate citations
        │
        ├─ initPipelineTurn(ctx, sessionId, message, correlationId)
        │    ├─ addUserMessage(sessionId, message)        ◄── shared/memory/repository.ts
        │    ├─ restore previous step outputs from DB (file chunks, snapshots)
        │    ├─ getResponsesForSession(sessionId)  → ctx.previousTurns[]
        │    └─ [ctx is now fully loaded with chunks + citations + previous turn data]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PIPELINE — REVISION + STEP EXECUTION LOOP
       │════════════════════════════════════════════════════════════════
       │
       ├─ identifyRevisionTargets(revisionFields, checks)  ◄── pipeline/revision-phase.ts
       │    └─ maps field names (from UI checkboxes) to step numbers for targeted re-execution
       │
       ├─ ┌─ for each step in steps:
       │  │    │
       │  │    ├─ SKIP if step has output AND is not a revision target (reuse)
       │  │    │
       │  │    ├─ CLEAR check results for this step's field (save for restore)
       │  │    │
       │  │    ├─ executeStepWithRetry(step, ctx, maxRetries=1)  [orchestrator-v2]
       │  │    │    └─ [retry loop] ──► executeLlmToolStep(step, ctx, previousError)
       │  │    │              ├─ buildContextSummary(ctx)
       │  │    │              │    ├─ ctx.files.buildContextSummary()
       │  │    │              │    ├─ ctx.steps.latest()
       │  │    │              │    ├─ ctx.palette.formatContextSummary()
       │  │    │              │    ├─ ctx.checks.getResults()
       │  │    │              │    ├─ buildDomainSchemaGuide(ctx.skill.checks)
       │  │    │              │    └─ ctx.palette.formatSourceSummary(sourcePalette)
       │  │    │              ├─ buildCitationGuide(ctx)
       │  │    │              ├─ createModel()  ◄── llm/factory.ts (at src/lib/agent/llm/)
       │  │    │              ├─ Register tools from skill.scripts:
       │  │    │              │    ├─ "compliance-check" → executeComplianceCheck()
       │  │    │              │    │    └─ eval operator (>=, <=, >, <, range)
       │  │    │              │    └─ other scripts → runScript(script.path, input)
       │  │    │              │         └─ execFile("python3", [path]) → JSON.parse(stdout)
       │  │    │              ├─ streamText({model, system, messages, tools, onStepFinish})
       │  │    │              │    └─ onStepFinish(event):
       │  │    │              │         ├─ for each toolResult:
       │  │    │              │         │    ├─ merge → CheckResult[]
       │  │    │              │         │    ├─ ctx.checks.addResults(results)
       │  │    │              │         │    └─ ctx.steps.setRaw("toolCalls", records)
       │  │    │              │         └─ validate tool was called (else retry)
       │  │    │              ├─ findCitationRef(ctx, result)
       │  │    │              │    └─ lookup in ctx.palette.getCitationPalette()
       │  │    │              └─ storeOutput(ctx, step.number, fullText)
       │  │    │                   └─ ctx.steps.write(stepNumber, parsed-or-raw)
       │  │    │
       │  │    ├─ [on failure] RestORE saved check results for field
       │  │    │    └─ yield {type: "error", ...}
       │  │    │
       │  │    ├─ [on success]
       │  │    │    ├─ yield {type: "token", text, stepNumber}  for each streamedToken
       │  │    │    ├─ yield {type: "tool-result", stepNumber, results}
        │  │    │    ├─ if ctx.checks.getResults().length > 0:
        │  │    │    │    ├─ ctx.checks.compileCitations(citationPalette, sourcePalette)
        │  │    │    │    │    └─ lookup + deduplicate + sort
        │  │    │    │    └─ ctx.checks.supplementFromContent(fullContent, ...)
        │  │    │    │         └─ backfill [R...] / [SN] markers from narrative
        │  │    │    └─ saveContextSnapshot({sessionId, turnNumber, stepNumber, ...})
       │  │    │         └─ saves full context state for debugging
       │  │
       │  └─ [after all steps]
       │
        ├─═══════════════════════════════════════════════════════════════
        │  EVALUATION + PRESENT — EVALUATE + FINALIZE
       │════════════════════════════════════════════════════════════════
       │
       └─ finalizePhase(ctx, steps, sessionId)  ◄── present/phases/finalize-phase.ts
            │
            ├─ evaluate({checkResults, citationPalette, sourcePalette,
            │    files, steps, skill})
            │    ├─ buildFindings(checkResults)    ◄── evaluation/summary.ts
            │    │    └─ map per check (FAIL only): "field → finding → VERDICT [citation]"
             │    ├─ computeConfidence(input)       ◄── evaluation/confidence.ts
             │    │    ├─ avgOcr = average of file ocrConfidence
             │    │    ├─ ocrPenalty = (1 - avgOcr/100) * 30
             │    │    ├─ pdfPenalty from extractorUsed (pdfjs-dist=5, tesseract/fallback=10)
             │    │    ├─ validationPenalty = (validationErrors.length) * 5
             │    │    ├─ baseScore = max(0, 100 - ocrPenalty - pdfPenalty - validationPenalty)
             │    │    ├─ llmMultiplier from step outputs (clamped 0.5-1.0)
             │    │    └─ finalScore = round(baseScore * llmMultiplier * 10) / 10
             │    │         → Confidence{score, ocrConfidence, llmMultiplier, needsExpert}
            │    └─ validate({claims, citations, sourceCitations, ...})
            │         ◄── evaluation/validate.ts
            │         ├─ [for each claim] validate citation refs in palette
            │         ├─ [for each chunk ref] ~25% word overlap check
            │         ├─ content markers match compiled citations
            │         └─ auto-supplement missing citations from sourcePalette
            │
            ├─ verdict = ctx.checks.getResults().some(c => c.verdict === "FAIL") ? "FAIL" : "PASS"
            │
            ├─ Build responseData:
            │    ├─ content = formatContent(stepOutputs, checks, results, palette)
            │    │    └─ per-check: narrative stripped of JSON + [R...] markers,
            │    │       citation badges injected (<cite> tags)
            │    ├─ reasoning = concatenated step bodies
            │    ├─ citations = ctx.checks.getCitations()
            │    ├─ sourceCitations = ctx.checks.getSourceCitations()
            │    ├─ sections = {findings: result.findings}
            │    ├─ toolCalls = ctx.steps.getRaw("toolCalls")
            │    ├─ reasoningSteps = result.reasoningSteps
            │    ├─ claims = ctx.checks.getClaims()
            │    ├─ clauseTexts = citation lookup map for popovers
            │    ├─ confidence
            │    └─ validationErrors
            │
            ├─ agentResponse = AgentResponseSchema.parse(responseData)
            ├─ addAssistantResponse(sessionId, agentResponse)  ◄── shared/memory/repository.ts
            │
            └─ return {response: agentResponse, validationErrors, confidence}
                 │
                 └─ yield {type: "done", response: agentResponse}
```

---

## Segment Decoupling Summary

| Segment | Provides To | Interface (Types + Functions) | Consumes From |
|---------|------------|-------------------------------|---------------|
| **1. Knowledge** | Pipeline | `IRegulationApi`, `getRegulationApi()` | — |
| **2. Session Input** | Loading, Pipeline | `IDocStore.processFile()` (real extraction + raw file storage), `IDocStore.getFiles()` (mock vecDB retrieval — returns all chunks), extractors + chunkers (real) | Shared (chunk_store DB) |
| **3. Loading** | Pipeline (via session_setup DB) | `setupSession()`, `initSession()`, `inputPhase()`, `skillGenPhase()`, `generateStepsFromChecks()`, `saveSessionSetup()`, `SkillLoader`, `ParsedCheck[]`, `ExecutableStep[]` | Session Input (processFile), Shared (repository) |
| **4. Pipeline** | Evaluation, Present | `orchestratePipeline(sessionId, msg, revisionFields?)`, `restoreContext()`, `initPipelineTurn()`, `StepResult`, `PipelineEvent` (streaming) | Shared (repository), session_setup DB, Session Input (getFiles), Knowledge (loadReferences) |
| **5. Evaluation** | Present | `evaluate()`, `EvaluationResult` | Pipeline (CheckStore), Shared (schemas) |
| **6. Present** | External | `finalizePhase()` → `AgentResponse`, `generateDocx()` → `.docx Blob` | Pipeline, Evaluation, Shared (schemas/repository) |
| **7. API Routes** | HTTP clients | 14 route handlers; consumes Pipeline + Shared | Pipeline, Shared (repository/schemas) |

### Key Decoupling Points

1. **Knowledge ↔ Pipeline**: `PipelineContext.skill` carries loaded skill metadata. `IRegulationApi` is swappable (mock ↔ real).

2. **Session Input ↔ Loading/Pipeline**: `IDocStore` is swappable (mock ↔ real vecDB), but only for the `getFiles()` retrieval part. Extraction + chunking + raw file storage (`processFile`) is always clausr.ai's responsibility — the extractors are real production code, not mock stand-ins. The mock vecDB returns all chunks; the real vecDB will embed a query and return top-k chunk IDs.

3. **Loading ↔ Pipeline**: Loading runs once per session (via `POST /api/setup`) and persists skill + steps to `session_setup`. Pipeline restores from DB, then independently loads chunks from the doc store and regulation clauses from the Knowledge API before executing steps.

5. **Pipeline internal**: 5 pipeline-owned slices (`CheckStore`, `StepMemory`, `FileRegistry`, `PaletteStore`, `ReportAssembler` under `pipeline/slices/`) hold all state. Pipeline orchestrator coordinates execution loop with: skip-reuse, clear-before-execute, context-snapshot patterns.

6. **Pipeline ↔ Evaluation ↔ Present**: Pipeline runs steps and fills CheckStore. Present calls Evaluation to get confidence + findings + validation, then assembles `AgentResponse`.

7. **API Routes ↔ Loading + Pipeline**: `/api/setup` calls `setupSession()` (loading layer). `/api/chat` calls `orchestratePipeline()` (pipeline layer) wrapped in SSE `ReadableStream`. All other routes are thin wrappers over `shared/memory/repository.ts` or `loading/skill/loader.ts`.

8. **Shared**: `schemas.ts` + `types.ts` + `memory/database.ts` + `memory/repository.ts` — the genuinely cross-layer core. Layer-owned state (5 slices) lives in `pipeline/slices/`.

---

## The Journey — Functions in Execution Order

This section traces the complete function call chain from user input to final output, organized by layer. Each function is annotated with its module path. Functions that exist but are not called in this main journey are listed at the end.

---

### 1. Session Input Layer — Extraction + Chunking + Raw File Storage (with mock vecDB retrieval)

Extraction and chunking are always done by clausr.ai (for bounding boxes, OCR confidence, deterministic chunk IDs). The `IDocStore.getFiles()` is the only mock vector-DB seam — today it returns all chunks; a real vecDB would embed and return top-k.

```
  SETUP (loading layer calls):
    docStore.processFile(file, sessionId)
      ├─ saveRawFile(sessionId, filename, dataUrl)  ◄── NEW: decode base64 → disk
      │    data/uploads/{sessionId}/{filename}
      ├─ extractFileContent(file)     ◄── user-info extractors (OCR/PDF/DOCX)
      │    dispatches by MIME:
      │    ├─ image → Tesseract OCR → groupWordsIntoLines() → TextChunk[]
      │    ├─ .pdf  → pdfjs-dist → groupItemsIntoLines() → linesToChunks()
      │    │         or render+OCR fallback (scanned PDFs)
      │    └─ .docx → mammoth → stripHtml() → splitParagraphs()
      ├─ saveChunks(sessionId, fileId, chunks)  ◄── chunk_store DB table
      ├─ saveFileChunks(file metadata)           ◄── sessions.file_chunks
      └─ return { extractedText }                ◄── full text for auto-skill

  PIPELINE (orchestrator calls) — MOCK vecDB RETRIEVAL:
    docStore.getFiles(sessionId)
      ├─ read file metadata + chunk texts from DB
      └─ return ProcessedFile[] with ALL chunks
         (real vecDB: embed query → search → top-k chunk IDs)

  Raw files stored at: data/uploads/{sessionId}/{filename}
  Served via: GET /api/files/{sessionId}/{filename}
```

---

### 2. Loading Layer — Once-Per-Session Prep

Entry: `POST /api/setup` → `setupSession(params)` in `loading/loading-orchestrator.ts`

#### Step 2a — Skill: Load OR Generate (parallel branches)

```
initSession(skillName?, sessionId)        [loading/phases/init-phase.ts]
  │
  ├─ [pre-existing skill]  loadSkill(skillId)         [loading/skill/loader.ts]
  │                           matter(SKILL.md) → frontmatter + body
  │                           parseChecks(skillmd) → ParsedCheck[]
  │                             parseFieldType(raw) → CheckFieldType
  │                           extractRegulationIds(checks) → ["R48", ...]
  │                           discover scripts/ → [{name, path, desc}]
  │                           load template.json (optional) → ReportTemplate
  │
  └─ [auto-skill]          placeholder (no skillmd yet)
       (generated after file extraction)
```

If no `skillName` was sent, `isAutoSkill = true` and the skill is generated later via:

```
skillGenPhase(ctx, message)                 [loading/phases/skill-gen-phase.ts]
  └─ generateSkill(message, fileTexts)      [loading/extractors/skill-generator.ts]
       streamText({model, system: SKILL_GENERATION_PROMPT, messages})
       matter(fullText) → skillmd + frontmatter
       parseChecks() + extractRegulationIds()
```

Both branches produce the same output shape: `{name, skillmd, checks, scripts, regulationIds}`.

#### Step 2b — PipelineContext: the in-memory carrier

```
createPipelineContext(name, skillmd, sessionId, cid, checks, scripts, regulationIds)
  └── pipeline/pipeline-context.ts
      initializes 5 empty slices:
        CheckStore     — holds CheckResult[] (verdicts per field)
        StepMemory     — holds step outputs (narratives + tool results)
        FileRegistry   — holds uploaded files + their chunks
        PaletteStore   — holds regulation clauses + citation palette
        ReportAssembler— holds report sections (used by present layer)
```

`PipelineContext` is the **sole data carrier** between layers. Loading populates its slices, serializes them to `session_setup` DB. Pipeline restores them via `restoreContext()` on every turn.

#### Step 2c — File Extraction

```
inputPhase(ctx, {files, sessionId})          [loading/phases/input-phase.ts]
  └─ for each file:
       store.processFile(file, sessionId)    ◄── vector-store (extract + chunk + store)
         → returns { extractedText }
       extractedTexts.push(extractedText)
  └─ return string[] extractedTexts

  (No ctx.files population during loading — chunks are stored in doc store.)

  skillGenPhase(ctx, message, fileTexts)     [loading/phases/skill-gen-phase.ts]
    └─ (fileTexts is a param, no longer reads from ctx.files)
```

#### Step 2d — Build Steps

```
generateStepsFromChecks(checks)              [loading/generate-steps.ts]
  └─ buildFieldInstructions(c) per check     → ExecutableStep[] (1:1 llm+tool per ##Check)
```

(No regulation loading during setup — pipeline layer handles that before step execution.)

#### End of Loading — Everything Ready

After `saveSessionSetup()` persists to DB, data is split across stores:

| Asset | Where it lives | Loaded by pipeline via |
|---|---|---|
| Steps + skill metadata + scripts + checks | `session_setup` table (serialized JSON) | `restoreContext()` / `loadSessionSetup()` |
| File metadata (empty at setup — populated later) | `session_setup.file_registry_json` | `FileRegistry.fromJSON()` |
| Source file chunks | `chunk_store` DB table | `docStore.getFiles(sessionId)` |
| Regulation clauses | Knowledge API (mock SQLite / real regulation DB) | `loadReferences(ctx)` (calls `getRegulationApi()`) |

The pipeline restores skill + steps from `session_setup`, then loads file chunks from `chunk_store` and regulation clauses from the Knowledge API before executing steps. Palette references and citations are stored as empty arrays at setup — the pipeline populates them.

---

### 3. Pipeline Layer — Per-Turn Execution

Entry: `POST /api/chat` → `orchestratePipeline(sessionId, message, revisionFields?)` in `pipeline/orchestrator-v2.ts`

#### Step 3a — Restore + Initialize Turn + Populate Data

```
restoreContext(sessionId, correlationId)      [pipeline/pipeline-context.ts]
  ├─ loadSessionSetup(sessionId)  (from session_setup DB)
  ├─ PipelineContext.fromJSON() → reconstruct 5 slices
  │    (FileRegistry + PaletteStore both empty)
  └─ deserialize steps

docStore.getFiles(sessionId)                  [user-info/vector-store/mock-store.ts]
  ├─ read file metadata + chunk texts from DB
  └─ ctx.files.loadFiles(ProcessedFile[])     ← populate chunks

loadReferences(ctx)                           [pipeline/builtins.ts]
  ├─ extract regulationIds from ctx.skill.checks
  ├─ loadRegulations(ids) via getRegulationApi()
  │    api.resolveCode(id) → api.getRegulation({code})
  └─ ctx.palette.loadCitationPalette(palette) → populate citations

initPipelineTurn(ctx, sessionId, message, correlationId)  [loading/phases/init-phase.ts]
  ├─ addUserMessage(sessionId, message)
  ├─ pruneOldSessions()
  ├─ getResponsesForSession(sessionId) → ctx.previousTurns[]
  └─ restore previous step outputs + CheckResults from last response
```

#### Step 3b — Revision Identification (follow-up turns only)

```
identifyRevisionTargets(revisionFields, checks)  → Set<stepNumber>
  └── pipeline/revision-phase.ts
      maps checkbox field names (from UI) to step indices (user-driven — no LLM guessing)
```

#### Step 3c — Step Execution Loop

For each step (skip if already has output and not a revision target):

```
executeStepWithRetry(step, ctx, maxRetries=1)   [pipeline/orchestrator-v2.ts]
  └─ retry loop → executeLlmToolStep(step, ctx, previousError?)
                   [pipeline/executors/llm-executor.ts]

       ├─ buildContextSummary(ctx)
       │    ├─ ctx.files.buildContextSummary()       — file chunks summary
       │    ├─ ctx.steps.latest()                     — previous step output
       │    ├─ ctx.palette.formatContextSummary()     — regulation citations
       │    ├─ ctx.checks.getResults()                — prior check results
       │    ├─ buildDomainSchemaGuide(ctx.skill.checks) — expected field schema
       │    └─ ctx.palette.formatSourceSummary(sourcePalette) — source chunks
       │
       ├─ buildCitationGuide(ctx)
       │    (instructions for [R48.5.11] and [S1.c3] markers)
       │
        ├─ createModel()                              [llm/factory.ts]
       │    (reads provider/model from DB or env)
       │
       ├─ Register tools:
       │    ├─ "checkCompliance" → executeComplianceCheck(input)  [pipeline/builtins.ts]
       │    │    for each check: numerical comparison (>=, <=, >, <, range) → pass/fail
       │    └─ [custom scripts] → runScript(script.path, input)   [pipeline/executors/script-runner.ts]
       │                           execFile("python3", [path]) → JSON.parse(stdout)
       │
       ├─ streamText({model, system, messages, tools, onStepFinish})
       │    onStepFinish:
       │      └─ merge tool results: pass/fail + clause → CheckResult[]
       │         ctx.checks.addResults(results)
       │         ctx.steps.setRaw("toolCalls", records)
       │
       ├─ extractCheckResultsFromText(fullText, checks, stepNumber)
       │    CheckFieldEntrySchema.safeParse()   ← Zod validation of LLM JSON output
       │    verdict = data.verdict === "FAIL" ? "FAIL" : "PASS"   ← SOLE verdict source
       │
       ├─ Merge tool + narrative CheckResults into CheckStore
       │    ctx.checks.compileCitations(citationPalette, sourcePalette)
       │    ctx.checks.supplementFromContent(fullContent, citationPalette, sourcePalette)
       │    ← backfill [R...] / [SN] markers found in narrative but not in check results
       │
       ├─ storeOutput(ctx, step.number, fullText)
       │
       └─ saveContextSnapshot({sessionId, turnNumber, stepNumber, ...})
```

Every check field gets its verdict from exactly one place: step execution. Numerical checks through the tool → CheckResult path. Qualitative checks through the LLM's JSON schema → CheckResult path. Both converge to the same `CheckResult[]` structure.

---

### 4. Evaluation Layer — After All Steps

```
finalizePhase(ctx, steps, sessionId) calls:

evaluate({checkResults, citationPalette, sourcePalette, files, stepOutputs,
           stepTitles, claims, citations, sourceCitations, checks, toolCalls})
  └── evaluation/index.ts

       ├─ computeConfidence(input)                   [evaluation/confidence.ts]
       │    formula: baseScore = max(0, 100 - ocrPenalty - pdfPenalty - validationPenalty)
       │    ocrPenalty = (1 - avgOcr/100) * 30
       │    pdfPenalty: pdfjs-dist=5, tesseract/fallback=10
       │    validationPenalty = (validationErrors.length) * 5
       │    llmMultiplier from step outputs (clamped 0.5-1.0)
       │    finalScore = round(baseScore * llmMultiplier * 10) / 10
       │    needsExpert = finalScore < 50
       │
       ├─ buildFindings(checkResults)                [evaluation/summary.ts]
       │    FAIL-only: field → "finding → VERDICT [citation]"
       │
       └─ validate({claims, citations, ...})          [evaluation/validate.ts]
            ├─ citation refs exist in citationPalette?
            ├─ validateClaimChunks(claims, sourcePalette)
            │    ~25% word overlap check
            └─ auto-supplement missing citations from sourcePalette
```

---

### 5. Present Layer — Response Assembly

Back in `finalizePhase`, after `evaluate()` returns:

```
verdict = ctx.checks.getResults().some(c => c.verdict === "FAIL") ? "FAIL" : "PASS"

formatContent(stepOutputs, checks, checkResults, citationPalette)
  └── present/phases/finalize-phase.ts
      per-step: strip ```json blocks, strip [R48.5.11] markers,
                inject <cite> badges with regulation/clause data
      → single markdown string

AgentResponseSchema.parse(responseData)   ← Zod validation of full response shape
addAssistantResponse(sessionId, agentResponse)   ← persist to DB

yield {type: "done", response}
```

Optionally (user-initiated):
```
generateDocx(response, skillName?)        [present/export/export-docx.ts]
  ├─ fillTemplateDocx(response, skillName)    — replaces {placeholders} in .docx XML
  └─ buildFallbackDocx(response, skillName?)  — builds from scratch via docx library
```

---

### Functions NOT in the Journey

#### API Route Handlers (thin wrappers, not part of core flow)

| Route | Module |
|-------|--------|
| `GET /api/sessions` | `api/sessions/route.ts` |
| `GET/DELETE /api/sessions/[id]` | `api/sessions/[id]/route.ts` |
| `POST /api/sessions/[id]/star` | `api/sessions/[id]/star/route.ts` |
| `GET/POST /api/settings` | `api/settings/route.ts` |
| `GET /api/skills` | `api/skills/route.ts` |
| `GET/POST /api/skills/[name]/template` | `api/skills/[name]/template/route.ts` |
| `GET /api/scripts` | `api/scripts/route.ts` |
| `POST /api/scripts/[name]` | `api/scripts/[name]/route.ts` |
| `GET /api/files/[sessionId]/[filename]` | `api/files/[sessionId]/[filename]/route.ts` |
| `POST /api/agent/evolution-confirm` | `api/agent/evolution-confirm/route.ts` |

#### Mock Layers (development stand-ins)

| Function | Module |
|----------|--------|
| `MockRegulationApi` (class + all methods) | `knowledge/mock-regulation-api.ts` |
| `getRegulationApi()` / `setRegulationApi()` | `knowledge/regulation-api.ts` |
| `MockDocStore` (class + all methods) | `user-info/vector-store/mock-store.ts` |
| `getDocStore()` / `setDocStore()` | `user-info/vector-store/index.ts` |

#### Shared/Repository Utilities (called internally, not in main flow)

| Function | Module |
|----------|--------|
| `getDb()` / `getSetting()` / `setSetting()` | `shared/memory/database.ts` |
| `getConversationHistory()` / `getChunksBySession()` / `getFileChunks()` | `shared/memory/repository.ts` |
| `deleteSession()` / `removeUploadDir()` | `shared/memory/repository.ts` / `loading/cleanup.ts` |
| `isValidSessionId()` | `loading/cleanup.ts` |
| `hasSessionSetup()` (gate in `/api/chat`) | `shared/memory/repository.ts` |
| `saveContextSnapshot()` / `getContextSnapshots()` | `shared/memory/repository.ts` |
| `toggleStar()` | `shared/memory/repository.ts` |

#### Internal Helpers (called inside journey functions, not independently)

| Function | Module |
|----------|--------|
| `getScriptDescription()` | `loading/skill/loader.ts` |
| `parseFieldType(raw)` | `loading/skill/check-parser.ts` |
| `mergeWordBoxes()` | `user-info/extractors/index.ts` |
| `getTesseractWorker()` / `collectWords()` / `toWordBox()` | `user-info/extractors/ocr.ts` (internal to MockDocStore) |
| `groupWordsIntoLines()` / `groupItemsIntoLines()` | `ocr.ts` / `pdf-extract.ts` (internal to MockDocStore) |
| `itemToWordBox()` / `linesToChunks()` | `pdf-extract.ts` (internal to MockDocStore) |
| `stripHtml()` / `splitParagraphs()` | `docx-extract.ts` (internal to MockDocStore) |
| `storeOutput()` / `resolveCitationRef()` / `deriveRegulation()` | `pipeline/executors/llm-executor.ts` |
| `averageOcrConfidence()` | `evaluation/confidence.ts` |
| `validateClaimChunks()` | `evaluation/validate.ts` |
| `buildPlaceholderMap()` / `normalizeConsecutiveRuns()` / `escapeXml()` / `stripMarkdown()` | `present/export/export-docx.ts` |
| `formatPipelineError()` / `generateCorrelationId()` | `pipeline/errors.ts` |
| `truncate()` / `logPipeline()` / `logInfo()` / `logError()` | `pipeline/logger.ts` |
| `parseChunkRef()` | `shared/schemas.ts` |
| `restoreStepOutput()` (internal to `initPipelineTurn`) | `loading/phases/init-phase.ts` |
| All `.toJSON()` / `.fromJSON()` on slices | serialization helpers |
| All `CheckStore` internals (`supplementFromContent`, `buildCitationsFromClaims`, `computeVerdict`) | `pipeline/slices/check-store.ts` |
| All `ReportAssembler` methods | `pipeline/slices/report-assembler.ts` |
| All Zod schemas | `shared/schemas.ts` |
| All type re-exports | `shared/types.ts` |

---

## Complete Function Reference

### SEGMENT 1 — Knowledge Layer (`src/lib/agent/knowledge/`)

#### `knowledge/regulation-api.ts`
| Function | Description |
|----------|-------------|
| `getRegulationApi()` | Singleton factory — lazily instantiates and returns the current `IRegulationApi` implementation (defaults to `MockRegulationApi`). |
| `setRegulationApi(api)` | Injects a custom `IRegulationApi` implementation. Used for swapping mock ↔ real regulation backends. |

#### `knowledge/mock-regulation-api.ts`
| Function | Description |
|----------|-------------|
| `MockRegulationApi` (class) | Implements `IRegulationApi` with hardcoded UN vehicle regulations and in-memory SQLite caches. |
| `.getRegulation(req)` | Resolves code alias, looks up regulation, validates with `RegulationSchema.safeParse()`. |
| `.getClause(req)` | Resolves code, looks up a single clause by `"code:number"` composite key. |
| `.listRegulations(req)` | Filters cached regulations by jurisdiction and/or keyword. |
| `.searchClauses(req)` | Searches clause title/text/number across regulations for a keyword match. |
| `.resolveCode(rawCode)` | Normalizes `"R48"`, `"UN-R48"`, `"UNR48"` → canonical code via `CODE_ALIASES`. |
| `.invalidateCache()` | Clears regulation and clause caches, re-populates from mock data. |

#### `knowledge/regulation-types.ts`
| Type / Schema | Description |
|--------------|-------------|
| `Clause`, `RegulationVersion`, `Regulation` (interfaces) | Data shapes for regulations. |
| `RegulationSchema`, `ClauseSchema` (Zod) | Runtime validators. |
| `ValidatedRegulation`, `ValidatedClause` (types) | Inferred types. |

---

### SEGMENT 2 — Session Input Layer (`src/lib/agent/user-info/`)

The session input layer handles everything before semantic search: extraction, chunking, raw file storage. The `extractors/` are the **real** extraction engine (clausr.ai owns these — they're not mock code). The `vector-store/` sub-directory wraps them into the `IDocStore` interface and provides mock vecDB retrieval in `getFiles()`.

#### `user-info/extractors/index.ts`
| Function | Description |
|----------|-------------|
| `extractFileContent(file)` | Main dispatcher. Routes to OCR, PDF, or DOCX extractor based on MIME type and extension. Returns `ExtractionResult`. |
| `mergeWordBoxes(boxes)` | Computes bounding box enclosing all input word boxes. |
| `ExtractionResult` | `{text, chunks, pageCount?, ocrConfidence?, extractorUsed?}` |
| `TextChunk` | `{id, text, bbox?, wordBoxes?, pageNumber?}` |
| `WordBox` | `{x, y, width, height}` |

#### `user-info/extractors/ocr.ts`
| Function | Description |
|----------|-------------|
| `extractImageText(dataUrl)` | OCR via Tesseract.js. Returns `{text, chunks, ocrConfidence, extractorUsed}`. |
| `getTesseractWorker()` | Lazy singleton Tesseract worker initialization. |
| `collectWords(page)` | Flattens Tesseract page blocks/paragraphs/lines/words into flat array. |
| `toWordBox(b)` | Converts Tesseract bbox to internal `WordBox` format. |
| `groupWordsIntoLines(words)` | Groups words into lines by Y-coordinate proximity. |

#### `user-info/extractors/pdf-extract.ts`
| Function | Description |
|----------|-------------|
| `extractPdfText(dataUrl)` | Two-path PDF extraction: Path A uses pdfjs-dist; Path B renders + OCR for scanned PDFs. |
| `itemToWordBox(item)` | Converts PDF text item's transform matrix to `WordBox`. |
| `groupItemsIntoLines(items)` | Groups PDF text items into lines by Y-coordinate proximity. |
| `linesToChunks(lines, pageNumber)` | Converts lines to `TextChunk[]` with bounding boxes. |

#### `user-info/extractors/docx-extract.ts`
| Function | Description |
|----------|-------------|
| `extractDocxText(dataUrl)` | Uses mammoth to convert DOCX to HTML, strips to plain text. Returns paragraph-level chunks. |
| `stripHtml(html)` | Removes HTML tags and decodes HTML entities. |
| `splitParagraphs(html)` | Splits HTML by `</p>` tags and strips each paragraph. |

#### `user-info/vector-store/types.ts`
| Type / Interface | Description |
|-----------------|-------------|
| `IDocStore` | Interface: `processFile(file, sessionId) → {extractedText}` (real extraction), `getFiles(sessionId) → ProcessedFile[]` (mock: returns all; real: embed query → top-k). |
| `ProcessedFile` | `{fileId, filename, extractedText, chunks, dataUrl?, pageCount?, ocrConfidence?, extractorUsed?}` |
| `ChunkInfo` | `{id, text, pageNumber?}` |

#### `user-info/vector-store/index.ts`
| Function | Description |
|----------|-------------|
| `getDocStore()` | Singleton factory — lazily instantiates and returns the current `IDocStore` implementation (defaults to `MockDocStore`). |
| `setDocStore(store)` | Injects a custom `IDocStore` implementation for swapping mock ↔ real vecDB backends. |

#### `user-info/vector-store/mock-store.ts`
| Function | Description |
|----------|-------------|
| `MockDocStore` (class) | Implements `IDocStore`. Runs real extraction + chunking (`processFile`), saves raw files to disk. Mock vecDB retrieval (`getFiles` — returns all chunks today; future: embed query → top-k). |
| `saveRawFile(sessionId, filename, dataUrl)` | Decodes base64 dataUrl and writes to `data/uploads/{sessionId}/{filename}`. Called by `processFile()`. |
| `.processFile(file, sessionId)` | Deletes existing chunks for session, saves raw file to disk, calls `extractFileContent()`, saves chunks to `chunk_store` DB, stores file metadata in `sessions.file_chunks`. Returns `{extractedText}`. |
| `.getFiles(sessionId)` | Reads file metadata from `sessions.file_chunks`, fetches chunk texts from `chunk_store` via `getChunksByIds()`. Returns `ProcessedFile[]` with all chunks. `dataUrl` is constructed as the serving URL `/api/files/{sessionId}/{filename}`. |

---

### SEGMENT 3 — Loading Layer (`src/lib/agent/loading/`)

#### `loading/skill/loader.ts`
| Function | Description |
|----------|-------------|
| `loadSkill(skillId)` | Reads `skills/<skillId>/SKILL.md`, parses frontmatter with `gray-matter`, discovers `.py` scripts, parses `## Checks` table, loads optional `template.json`. Returns `SkillLoader`. |
| `listSkills()` | Lists subdirectories under `skills/` that contain a `SKILL.md`. |
| `getScriptDescription(filePath, filename)` | Extracts first `"""..."""` docstring from a Python script. |

#### `loading/skill/check-parser.ts`
| Function | Description |
|----------|-------------|
| `parseChecks(skillmd)` | Extracts `## Checks` table from SKILL.md, parses rows with regex, converts type strings to `CheckFieldType`. Returns `ParsedCheck[]` or empty array. |
| `extractRegulationIds(checks)` | Extracts unique regulation IDs from `clause` column via regex `/R(\d+)/`. |
| `parseFieldType(raw)` | Converts type string to `CheckFieldType`. |

#### `loading/extractors/skill-generator.ts`
| Function | Description |
|----------|-------------|
| `generateSkill(message, fileTexts)` | Calls LLM to generate a SKILL.md from user request + uploaded file contents. Parses result with `gray-matter`, extracts frontmatter + Checks. Returns `SkillLoader`. |

#### `loading/loading-orchestrator.ts`
| Function | Description |
|----------|-------------|
| `setupSession({skillName?, sessionId, files?, message?})` | **Once-per-session orchestrator.** Runs `initSession()`, `createPipelineContext()`, `inputPhase()`, `skillGenPhase()` (if auto), `generateStepsFromChecks()`, then `saveSessionSetup()`. Pipeline layer handles regulation + chunk loading. |

#### `loading/generate-steps.ts`
| Function | Description |
|----------|-------------|
| `generateStepsFromChecks(checks)` | Maps `ParsedCheck[]` to `ExecutableStep[]` (1:1, `llm+tool` type). Each step includes field-specific instructions via `buildFieldInstructions()`. |
| `buildFieldInstructions(c)` | Builds LLM instructions for a step: type/kind, constraint, clause, depends_on, sample JSON output format. |

#### `loading/phases/init-phase.ts`
| Function | Description |
|----------|-------------|
| `initSession(skillName?, sessionId)` | **Once-per-session.** Loads skill (or sets auto-skill flag), gets/creates session. Returns `{skill, isAutoSkill}`. (Correlation ID generated by orchestrator — does NOT create context.) |
| `initPipelineTurn(ctx, sessionId, message, correlationId)` | **Per-turn.** Adds user message to DB, restores previous step outputs from DB (file chunks, snapshots), loads previous turns. Used by pipeline on every POST /api/chat. |

#### `loading/phases/input-phase.ts`
| Function | Description |
|----------|-------------|
| `inputPhase(ctx, {files, sessionId})` | If files present: calls `docStore.processFile()` for each file (vector-store layer handles extraction + chunking + persistence). Returns `string[]` of extracted texts for auto-skill. Does NOT populate `ctx.files`. |

#### `loading/phases/skill-gen-phase.ts`
| Function | Description |
|----------|-------------|
| `skillGenPhase(ctx, message, fileTexts)` | Calls `generateSkill()` with user message + file texts (passed as param, no longer reads from ctx.files). Replaces `ctx.skill` with the auto-generated skill. |

*(revision-phase.ts moved to `pipeline/revision-phase.ts`)*
---

### SEGMENT 4 — Pipeline (`src/lib/agent/pipeline/`)

#### `pipeline/orchestrator-v2.ts`
| Function | Description |
|----------|-------------|
| `orchestratePipeline(sessionId, message, revisionFields?)` | **Top-level entry point (per turn).** Async generator: restoreContext → **docStore.getFiles()** (populate ctx.files with chunks) → initPipelineTurn → revision → step-exec → finalize. Yields `PipelineEvent` for SSE streaming. State comes from `session_setup` DB + doc store. |
| `executeStepWithRetry(step, ctx, maxRetries, revisionUserMessage?)` | Wraps `executeLlmToolStep()` with retry loop (default 1 retry). Passes `revisionUserMessage` as `revisionContext` when step is being revised. Returns `StepResult`. |

#### `pipeline/pipeline-context.ts`
| Function / Type | Description |
|-----------------|-------------|
| `createPipelineContext(name, skillmd, checks, sessionId, cid?, scripts?)` | Factory. Creates `PipelineContext` with all 5 slices. Used during loading phase. |
| `restoreContext(sessionId)` | **Factory for per-turn use.** Loads session setup from DB via `loadSessionSetup()`, calls `PipelineContext.fromJSON()` to reconstruct 5 slices, deserializes steps. Called as first step in `orchestratePipeline()`. |
| `PipelineContext` | Core context: `skill` metadata, `sessionId`, `correlationId`, slices (`checks`, `steps`, `files`, `palette`, `report`), `previousTurns[]`, `uploadedFiles[]`. |
| `.toJSON()` / `PipelineContext.fromJSON()` | Serialize/deserialize the full context (including all 5 slices) for DB persistence. |
| `CheckResult` | `{name, type, finding, verdict, citationRef, sourceCitation, toolCallId?, toolResult?}` |
| `CitationPaletteEntry` | `{id, regulation, clause, text}` |
| `SourcePaletteEntry` | `{id, fileId, filename, extractedText, keyExcerpt, chunks?, ...}` |

#### `pipeline/builtins.ts`
| Function | Description |
|----------|-------------|
| `loadReferences(ctx)` | Loads regulation data into palette by extracting IDs from checks, fetching via API. Builds `CitationPaletteEntry[]`. Called by pipeline orchestrator (not loading layer). |
| `executeComplianceCheck(input)` | Evaluates numerical checks against operators (`>=`, `<=`, `>`, `<`, `range`). Returns pass/fail results. Called as a registered tool handler. |

#### `pipeline/revision-phase.ts`
| Function | Description |
|----------|-------------|
| `identifyRevisionTargets(revisionFields, checks)` | Maps explicit field names from UI checkboxes to step numbers (1-indexed from checks order). Used for targeted re-execution. Sync only — no LLM guessing. |

#### `pipeline/executors/llm-executor.ts`
| Function | Description |
|----------|-------------|
| `executeLlmToolStep(step, ctx, previousError?, revisionContext?)` | Runs an `llm+tool` step. Registers tools (compliance-check, scripts), streams LLM, processes tool results, stores output. Optional `revisionContext` enables revision-aware execution: excludes other CheckResults from context, uses user feedback as FTS5 query, injects revision context into user message. |
| `buildDomainSchemaGuide(checks)` | Builds schema guide string from `ParsedCheck[]` for LLM prompts. |
| `buildContextSummary(ctx, excludeCheckResults?)` | Builds composite context string: file summary, latest step output, citation summary, check results (skipped when `excludeCheckResults=true`), domain schema guide, source summary, previous turns. |
| `buildCitationGuide(ctx)` | Builds citation format instructions for LLM (`[R48.5.11]` and `[SN]` markers). |

#### `pipeline/executors/script-runner.ts`
| Function | Description |
|----------|-------------|
| `runScript(scriptPath, input, timeoutMs?)` | Spawns `python3` subprocess with JSON stdin, collects stdout/stderr. Returns `ScriptResult{stdout, stderr, success}`. 30s default timeout. |

#### `pipeline/types.ts`
| Type | Description |
|------|-------------|
| `PipelineEvent` | Discriminated union: `status`, `token`, `tool-result`, `done`, `error`. |
| `ExecutableStep` | Step metadata: `number`, `title`, `type: "llm+tool"`, `instructions`, `temperature?`. |
| `StepResult` | Step output: `success`, `error?`, `errorCode?`, `streamedTokens?`, `toolResults?`, `contextSnapshot?`. |

#### `pipeline/errors.ts`
| Function | Description |
|----------|-------------|
| `PipelineError` (class) | Base error with `code`, `details`, `correlationId`. |
| `StepFailedError` (class) | Extends `PipelineError` with `stepNumber`, `stepType`. |
| `SkillLoadError` (class) | Extends `PipelineError` with `skillName`. |
| `generateCorrelationId()` | Generates `corr-{timestamp}-{base36-counter}`. |
| `formatPipelineError(err, fallbackCid?)` | Formats error with code and correlation ID. |

#### `pipeline/logger.ts`
| Function | Description |
|----------|-------------|
| `logPipeline(msg)` | Timestamped log to stderr + `data/pipeline-debug.log`. |
| `truncate(text, max?)` | Truncates string for log display. |
| `logInfo(msg)` | Info line to stderr with `[clausr]` prefix. |
| `logError(tag, err)` | Error line to stderr with prefix. |

#### `pipeline/slices/check-store.ts`
| Function | Description |
|----------|-------------|
| `CheckStore` (class) | Manages check results, claims, and compiled citations. |
| `.addCheck(result)` / `.addResults(results)` | Add `CheckResult`s. |
| `.removeResultsForField(field)` | Remove results for a specific field (clear-before-execute). |
| `.getResults()` | Get all check results. |
| `.addClaims(claims)` / `.getClaims()` | Set/get claims array. |
| `.compileCitations(citationPalette, sourcePalette)` | Build `Citation[]` from check results. |
| `.computeVerdict()` | `FAIL` if any check has `verdict === "FAIL"`, else `PASS`. |
| `.supplementFromContent(content, ...)` | Scan for `[R...]` markers, backfill missing citations. |

#### `pipeline/slices/step-memory.ts`
| Function | Description |
|----------|-------------|
| `StepMemory` (class) | In-memory store for step outputs. |
| `.write(stepNumber, value)` / `.read(stepNumber)` | Store/read step output. |
| `.latest()` | Most recent step output. |
| `.entries()` | All entries as record. |

#### `pipeline/slices/file-registry.ts`
| Function | Description |
|----------|-------------|
| `FileRegistry` (class) | Manages uploaded files for the session. |
| `.addFile(file)` / `.getFiles()` | Register/retrieve files. |
| `.getSourcePalette()` | Convert files to `SourcePaletteEntry[]`. |
| `.buildContextSummary()` | Build LLM context string with chunk annotations. |
| `.toJSON()` / `FileRegistry.fromJSON()` | Serialize/deserialize. |

#### `pipeline/slices/palette-store.ts`
| Function | Description |
|----------|-------------|
| `PaletteStore` (class) | Manages regulation references + citation palette. |
| `.loadReferences(refs)` / `.getReferences()` | Set/get regulation texts. |
| `.loadCitationPalette(entries)` / `.getCitationPalette()` | Set/get citation palette. |
| `.formatContextSummary()` | Format citations for LLM context. |
| `.toJSON()` / `PaletteStore.fromJSON()` | Serialize/deserialize. |

#### `pipeline/slices/report-assembler.ts`
| Function | Description |
|----------|-------------|
| `ReportAssembler` (class) | Assembles report sections + verdict. |
| `.setContent(sections)` / `.getContent()` | Set/get formatted report. |
| `.getAllContentFlat()` | Flat string for citation scanning. |
| `.setVerdict(v)` / `.getVerdict()` | Set/get PASS/FAIL verdict. |

---

### SEGMENT 5 — Evaluation Layer (`src/lib/agent/evaluation/`)

#### `evaluation/index.ts`
| Function | Description |
|----------|-------------|
| `evaluate(input)` | Main entry. Computes confidence, builds findings (FAIL-only map), validates consistency. Returns `{confidence, findings, validationErrors, citations, sourceCitations, claims, reason, reasoningSteps}`. |

#### `evaluation/confidence.ts`
| Function | Description |
|----------|-------------|
| `computeConfidence(input)` | Computes score: base 100 − OCR penalty − PDF penalty, multiplied by LLM confidence multiplier from step outputs. Returns `Confidence{score, ocrConfidence, dataCompleteness, llmMultiplier, llmReasoning, needsExpert}`. |

#### `evaluation/summary.ts`
| Function | Description |
|----------|-------------|
| `buildFindings(checkResults)` | Converts FAIL check results to findings map: `field → "finding → VERDICT [sourceCitation]"`. PASS checks omitted. |

#### `evaluation/validate.ts`
| Function | Description |
|----------|-------------|
| `validate({claims, citations, sourceCitations, ...})` | Validates citation/chunk consistency, marker presence in report content, claim-chunk word overlap (~25%). Auto-supplements missing citations from palette. Returns `ValidationError[]`. |
| `validateClaimChunks(claims, sourcePalette)` | Validates each claim's chunkRef exists and has ~25% word overlap. |

#### `evaluation/types.ts`
| Type | Description |
|------|-------------|
| `EvaluationInput` | Input shape: checkResults, citationPalette, sourcePalette, files, stepOutputs, stepTitles, claims, citations, sourceCitations, checks, toolCalls. |
| `EvaluationResult` | Output shape: confidence, findings, validationErrors, citations, sourceCitations, claims, reason, reasoningSteps. |

---

### SEGMENT 6 — Present Layer (`src/lib/agent/present/`)

#### `present/phases/finalize-phase.ts`
| Function | Description |
|----------|-------------|
| `finalizePhase(ctx, steps, sessionId)` | Runs evaluation (`evaluate()`), computes verdict, builds `AgentResponseData`, validates with `AgentResponseSchema`, persists to DB. Returns `{response, validationErrors, confidence}`. |
| `formatContent(stepOutputs, checks, checkResults, citationPalette)` | Per-check: prepends `### field_name` header, strips JSON + `[R...]` markers from narrative, injects `<cite>` badges. Produces sectioned markdown for frontend parsing. |

#### `present/export/export-docx.ts`
| Function | Description |
|----------|-------------|
| `generateDocx(response, skillName?)` | **Main entry.** Tries template-filling first; falls back to building `.docx` from scratch. Returns `Blob`. |
| `fillTemplateDocx(response, skillName)` | Fetches skill's `.docx` template, replaces `{placeholders}` in XML, re-zips. |
| `buildPlaceholderMap(response)` | Maps `{field}` → values from `response.sections`. Primary by ID; fallback by dot-path. |
| `normalizeConsecutiveRuns(xml)` | Merges split `<w:r>` XML runs that split placeholders across runs. |
| `escapeXml(s)` | Escapes `&`, `<`, `>`, `"` for safe XML. |
| `stripMarkdown(md)` | Removes markdown characters. |
| `buildFallbackDocx(response, skillName?)` | Builds `.docx` from scratch using the `docx` library. |

#### `present/template-types.ts`
| Type | Description |
|------|-------------|
| `ReportTemplate` | `{name, sections: TemplateSection[]}` — template for .docx export. |
| `TemplateSection` | `{id, title, type (fields\|markdown\|table\|verdict), fields?, columns?}`. |
| `TemplateField` | `{id, label, type (text\|number\|select), options?}`. |

---

### SEGMENT 7 — API Routes (`src/app/api/`)

#### `api/setup/route.ts`
| Route | Description |
|-------|-------------|
| `POST /api/setup` | Validates body with `SetupRequestSchema`, calls `setupSession()` (loading orchestrator). Returns `{sessionId, skillName, correlationId}`. Runs once per session before first chat. |

#### `api/chat/route.ts`
| Route | Description |
|-------|-------------|
| `POST /api/chat` | Validates body with `ChatRequestSchema`, checks `hasSessionSetup()` gate, wraps `orchestratePipeline()` async generator in SSE `ReadableStream`. Yields `PipelineEvent` as SSE data frames. Returns `text/event-stream`. |

#### `api/sessions/route.ts`
| Route | Description |
|-------|-------------|
| `GET /api/sessions` | Returns all sessions via `getAllSessions()`. |

#### `api/sessions/[id]/route.ts`
| Route | Description |
|-------|-------------|
| `GET /api/sessions/[id]` | Returns conversation history + responses for a session. 404 if not found. |
| `DELETE /api/sessions/[id]` | Cascade-deletes session and all related records. |

#### `api/sessions/[id]/star/route.ts`
| Route | Description |
|-------|-------------|
| `POST /api/sessions/[id]/star` | Toggles `starred` flag on session via `toggleStar(id, starred)`. |

#### `api/settings/route.ts`
| Route | Description |
|-------|-------------|
| `GET /api/settings` | Returns `provider`, `model`, `retentionDays`, `retentionMaxSessions` from DB settings. |
| `POST /api/settings` | Persists LLM provider, model, retention settings. Validates values. |

#### `api/skills/route.ts`
| Route | Description |
|-------|-------------|
| `GET /api/skills` | Lists all skills with full metadata via `listSkills()` + `loadSkill()`. |

#### `api/skills/[name]/template/route.ts`
| Route | Description |
|-------|-------------|
| `GET /api/skills/[name]/template` | Returns the skill's `assets/template.docx` as `.docx` binary. 404 if not found. |
| `POST /api/skills/[name]/template` | Uploads a base64-encoded `.docx` and saves as `assets/template.docx`. |

#### `api/scripts/route.ts`
| Route | Description |
|-------|-------------|
| `GET /api/scripts?skillId=<id>` | Lists all Python scripts for a given skill via `loadSkill(id).scripts`. |

#### `api/scripts/[name]/route.ts`
| Route | Description |
|-------|-------------|
| `POST /api/scripts/[name]` | Executes a named script for a given skill. Validates input with `ComplianceCheckSchema`, calls `runScript()`. |

#### `api/files/[sessionId]/[filename]/route.ts`
| Route | Description |
|-------|-------------|
| `GET /api/files/[sessionId]/[filename]` | Serves uploaded file from `data/uploads/{sessionId}/{filename}` with path traversal protection and MIME type detection. |

#### `api/agent/evolution-confirm/route.ts`
| Route | Description |
|-------|-------------|
| `POST /api/agent/evolution-confirm` | Confirms or dismisses a proposed lesson. If confirmed, appends to SKILL.md under `## Lessons Learnt`. Inserts message record. |

---

### SHARED — Core Types & Persistence (`src/lib/agent/shared/`)

The shared layer contains only what is genuinely cross-layer: type definitions, the DB singleton, and the repository of DB access functions. Layer-owned state (slices) lives in its owning layer under `pipeline/slices/`.

#### `shared/memory/database.ts`
| Function | Description |
|----------|-------------|
| `getDb()` | Singleton SQLite instance. Creates DB, runs DDL (6 tables: sessions, messages, responses, context_snapshots, settings, session_setup), migrations, seeds defaults. |
| `getSetting(key)` | Read from `settings` table. |
| `setSetting(key, value)` | Upsert into `settings` table. |

#### `shared/memory/repository.ts`
| Function | Description |
|----------|-------------|
| `getOrCreateSession(sessionId, skillName)` | INSERT OR IGNORE into `sessions`. |
| `addUserMessage(sessionId, content)` | INSERT user message. |
| `addAssistantResponse(sessionId, response)` | INSERT assistant message + full response record. |
| `getConversationHistory(sessionId)` | SELECT messages ordered by id. |
| `getResponseCount(sessionId)` | COUNT of responses. |
| `saveChunks(sessionId, fileId, chunks)` | INSERT chunks into `chunk_store` table. |
| `getChunksByIds(ids)` | SELECT chunks by ID list. |
| `getChunksBySession(sessionId)` | SELECT all chunks for a session. |
| `deleteChunksBySession(sessionId)` | DELETE all chunks for a session. |
| `saveFileChunks(sessionId, chunksJson)` | UPDATE `sessions.file_chunks` with file metadata JSON. |
| `getFileChunks(sessionId)` | SELECT `file_chunks` — file metadata JSON. |
| `deleteSession(sessionId)` | CASCADE delete session + all related records. |
| `getAllSessions()` | SELECT all sessions with metadata. |
| `getResponsesForSession(sessionId)` | SELECT all responses with parsed JSON fields. |
| `saveSessionSetup(sessionId, data)` | INSERT/REPLACE into `session_setup` table — persists ctx JSON, steps JSON, skill name, correlation ID. |
| `loadSessionSetup(sessionId)` | SELECT from `session_setup` — returns full setup data including reconstructed ctx + steps. |
| `hasSessionSetup(sessionId)` | SELECT EXISTS from `session_setup` — used as gate in `/api/chat`. |
| `saveContextSnapshot(snapshot)` | INSERT step state snapshot (system prompt, context summary, skillmd, references, uploaded files, step outputs). |
| `getContextSnapshots(sessionId)` | SELECT all snapshots. |
| `toggleStar(sessionId, starred)` | UPDATE `sessions.starred`. |

*(cleanup.ts moved to `loading/cleanup.ts`)*

#### `shared/schemas.ts`
| Schema | Description |
|--------|-------------|
| `SetupRequestSchema` | Validates setup payload: `skillName?`, `sessionId`, `files?`, `message?` (required for auto-skill). |
| `ChatRequestSchema` | Validates chat payload: `message`, `sessionId`, `revisionFields?`. (No `skillName` or `files` — loading is done.) |
| `ChatRequestFileSchema` | Validates file: `name`, `size`, `type`, `dataUrl?` (base64 data URL). |
| `AgentResponseSchema` | Validates full agent response: `content`, `reasoning`, `citations`, `sourceCitations?`, `round`, `sessionId`, `verdict`, `lesson?`, `clauseTexts?`, `toolCalls?`, `reasoningSteps?`, `claims?`, `confidence?`, `validationErrors?`, `sections?`. |
| `CitationSchema` | `{ref, regulation, clause}` — regulation citation. |
| `SourceCitationSchema` | `{ref, fileId, filename, fileUrl?, extractedText, keyExcerpt, chunks?, boundingBox?, pageNumber?}`. |
| `SourceChunkSchema` | `{id, text, bbox?, wordBoxes?, pageNumber?}`. |
| `VerdictSchema` | `PASS` / `FAIL` enum. |
| `ClaimSchema` | `{statement, citationRef, sourceCitation?}`. |
| `ConfidenceSchema` | `{score, ocrConfidence, dataCompleteness?, llmMultiplier, llmReasoning, needsExpert}`. |
| `ComplianceCheckSchema` | Tool input: `{checks: [{name, value, limit, operator, clause}]}`. |
| `LessonSchema` | `{text, confidence (1-10), sourceSkill}`. |
| `ToolCallRecordSchema` | `{step, toolName, summary, status (success|error)}`. |
| `ReasoningStepSchema` | `{stepNumber, subStep?, title, body}`. |
| `ValidationErrorSchema` | `{type (6 error kinds), message}`. |
| `ReferenceMapSchema` | `Record<string, string>` — code alias map. |
| `parseChunkRef(chunkRef)` | Parses `"S1.c3"` → `{fileRef: 1, chunkId: "c3"}`. |

*(template-types.ts moved to `present/template-types.ts`)*

*(turn-types.ts moved to `src/types/agent-types.ts`)*

#### `shared/types.ts`
| Type | Description |
|------|-------------|
| (re-exports) | Re-exports all inferred types from `schemas.ts`: `Citation`, `SourceCitation`, `SourceChunk`, `Claim`, `Verdict`, `AgentResponse`, `Confidence`, `ChatRequest`, `ComplianceCheckInput`, `ToolCallRecord`, `ValidationError`, `ReasoningStep`. |

#### `llm/factory.ts` (at `src/lib/agent/llm/`)
| Function | Description |
|----------|-------------|
| `createModel()` | Creates a `LanguageModel` instance. Reads provider (openai/anthropic/deepseek), API key, model name from DB settings or env vars. Wraps DeepSeek fetch to inject `reasoning_content` placeholder for tool_calls compat. |
| `getProvider()` | Resolves LLM provider: DB setting → env var → default "openai". |
| `getProviderConfig()` | Resolves full provider config: provider, apiKey, baseURL, model. |

---

## Total Function Count

| Segment | Files | Functions |
|---------|-------|-----------|
| **1. Knowledge** | 3 | ~8 |
| **2. Session Input** | 8 | ~18 |
| **3. Loading** | 10 | ~12 |
| **4. Pipeline** | 13 | ~21 |
| **5. Evaluation** | 5 | ~7 |
| **6. Present** | 3 | ~9 |
| **7. API Routes** | 12 | ~15 |
| **Shared** | 4 | ~20 |
| **LLM** | 1 | ~3 |
| **Total (agent engine)** | **47** | **~107** |
| **Total (all source)** | **59** | **~123** |

*Updated 2026-05-25: restructured SEGMENT 2 from "Vector-Store" → "User-Info" → "Session Input" layer. vector-store/ moved into user-info/ as a sub-directory. Extraction + chunking are always clausr.ai's responsibility (real code, not mock). Only `IDocStore.getFiles()` is mock vecDB retrieval (returns all chunks today; real vecDB to embed query + return top-k later). Added raw file persistence to disk in processFile().*
