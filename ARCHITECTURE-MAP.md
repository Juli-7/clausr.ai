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
│                           SEGMENT 2: USER-INFO LAYER                                 │
│                                                                                      │
│  user-info/extractors/index.ts     user-info/extractors/ocr.ts                       │
│  ┌──────────────────────┐          ┌──────────────────────┐                          │
│  │ extractFileContent() │─────────►│ extractImageText()   │                          │
│  │   → routes by MIME   │          │   → Tesseract.js OCR  │                          │
│  │   → Image → OCR      ├──       │ getTesseractWorker() │                          │
│  │   → PDF → pdf-extract│ │       │ groupWordsIntoLines() │                          │
│  │   → DOCX → docx-ext  │ │       └──────────────────────┘                          │
│  │ ExtractionResult     │ │                                                          │
│  │ TextChunk, WordBox   │ │  user-info/extractors/pdf-extract.ts                     │
│  └──────────────────────┘ │  ┌──────────────────────┐                              │
│                           ├──►│ extractPdfText()     │                              │
│                           │   │   Path A: pdfjs-dist │                              │
│                           │   │   Path B: OCR fallback│                              │
│                           │   │ itemToWordBox()      │                              │
│                           │   │ linesToChunks()      │                              │
│                           │   └──────────────────────┘                              │
│                           │  user-info/extractors/docx-extract.ts                    │
│                           └──►┌──────────────────────┐                              │
│                               │ extractDocxText()    │                              │
│                               │   → mammoth + strip  │                              │
│                               └──────────────────────┘                              │
│                                                                                      │
│  PROVIDES: ExtractionResult, TextChunk, WordBox                                       │
│  CONSIDERS FROM: nothing (pure file I/O)                                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 3: LOADING LAYER                                   │
│                                                                                      │
│  loading/skill/loader.ts          loading/skill/check-parser.ts                       │
│  ┌──────────────────────┐         ┌──────────────────────────────────────┐           │
│  │ loadSkill(id)        │────────►│ parseChecks(skillmd)                 │           │
│  │ listSkills()         │         │ extractRegulationIds(checks)         │           │
│  └──────────────────────┘         └──────────────────────────────────────┘           │
│  │ generateSkill(msg,   │                                                           │
│  │   fileTexts)         │         loading/generate-steps.ts                          │
│  │   → LLM generates    │         ┌──────────────────────────────────────┐           │
│  │     SKILL.md         │         │ generateStepsFromChecks(checks)     │           │
│  └──────────────────────┘         │   → ExecutableStep[] (1:1 from      │           │
│                                   │     parsed checks)                  │           │
│  loading/phases/init-phase.ts     │ buildFieldInstructions(c)           │           │
│  ┌────────────────────────┐       └──────────────────────────────────────┘           │
│  │ initPhase(name, sid,   │                                                           │
│  │  message)              │       loading/phases/input-phase.ts                       │
│  │  → loadSkill, create   │       ┌──────────────────────────────────────┐           │
│  │    context, restore    │       │ inputPhase(ctx, params)              │           │
│  └────────────────────────┘       │  → extract files / restore from DB  │           │
│                                   └──────────────────────────────────────┘           │
│  loading/phases/skill-gen-phase.ts                                                   │
│  ┌────────────────────────────────────────────────────┐                              │
│  │ skillGenPhase(ctx, message)                        │                              │
│  │  → generateSkill() if isAutoSkill                  │                              │
│  └────────────────────────────────────────────────────┘                              │
│                                                                                      │
│  loading/phases/revision-phase.ts                                                    │
│  ┌────────────────────────────────────────────────────────────┐                      │
│  │ identifyRevisionTarget(ctx, userMessage)                    │                      │
│  │  → LLM determines which step to redo on follow-up           │                      │
│  │ identifyRevisionTargets(revisionFields, checks)              │                      │
│  │  → maps checkbox fields to step numbers (explicit revision) │                      │
│  └────────────────────────────────────────────────────────────┘                      │
│                                                                                      │
│  PROVIDES: SkillLoader, ParsedCheck[], ExecutableStep[], PipelineContext               │
│  CONSIDERS FROM: Knowledge (regulation refs), User-Info (chunks), Shared (DB)         │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 4: PIPELINE                                         │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  orchestrator-v2.ts (ENTRY POINT — async generator, yields PipelineEvent)   │    │
│  │  orchestratePipeline(message, skillName, sessionId, files?, revisionFields?) │    │
│  │    ├─► initPhase()                 — LOADING: skill load, session, context    │    │
│  │    ├─► inputPhase()                — LOADING: file extraction / restore       │    │
│  │    ├─► skillGenPhase()             — LOADING: create skill if auto            │    │
│  │    ├─► loadReferences()            — load regulation data into palette        │    │
│  │    ├─► generateStepsFromChecks()   — LOADING: build step list                 │    │
│  │    ├─► identifyRevisionTarget(s)   — LOADING: which step(s) to redo           │    │
│  │    ├─► [loop] executeStepWithRetry — execute each step (llm+tool, retry 1x)  │    │
│  │    │      └─► executeLlmToolStep() — core LLM+tool executor                  │    │
│  │    ├─► enforceChecks()             — EVALUATION: gap-fill missing checks     │    │
│  │    └─► finalizePhase()             — PRESENT: evaluate + assemble + persist  │    │
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
│  │ loadRefer-  │ │ PipelineErr │ │ logPipeline │ │ PipelineEv- │ │ context.ts    │  │
│  │ ences()     │ │ format...   │ │ truncate()  │ │ ent,        │ │ createPipe-   │  │
│  │ .execute-   │ └─────────────┘ └─────────────┘ │ Executable- │ │ lineContext() │  │
│  │  Compliance │                                  │ Step,       │ │ PipelineCtx   │  │
│  │  Check()    │                                  │ StepResult  │ │ CheckResult   │  │
│  └─────────────┘                                  └─────────────┘ └───────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │ executors/llm-executor.ts                                                     │  │
│  │ executeLlmToolStep(step, ctx, previousError?) — LLM+tool executor with retry  │  │
│  │ buildDomainSchemaGuide(checks), buildContextSummary(ctx), buildCitationGuide()│  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │ executors/script-runner.ts                                                     │  │
│  │ runScript(scriptPath, input, timeoutMs) — spawns python3 subprocess            │  │
│  │   → used for compliance-check scripts defined in SKILL.md                      │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  PROVIDES: StepResult[], streamed PipelineEvents                                      │
│  CONSIDERS FROM: Loading (context), Shared (slices), Knowledge (regulation data)      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 5: EVALUATION LAYER                                │
│                                                                                      │
│  evaluation/enforce-checks.ts     evaluation/index.ts                                │
│  ┌────────────────────────────┐   ┌────────────────────────────────────┐             │
│  │ enforceChecks(ctx)         │──►│ evaluate(input)                    │             │
│  │  → gap-fill missing checks │   │  → main entry, calls sub-modules   │             │
│  │  → regex extract from files│   └────────────────────────────────────┘             │
│  │  → numerical checks only   │              │                                         │
│  └────────────────────────────┘               ▼                                         │
│                                               │                                         │
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
│  CONSIDERS FROM: Pipeline (CheckStore, PipelineContext), Shared (slices)               │
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
│  POST /api/chat —— SSE streaming pipeline entry point                                │
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
│  PROVIDES: HTTP responses; consumes Pipeline (chat), Shared/repository (sessions)    │
│  CONSIDERS FROM: Pipeline (orchestratePipeline), Shared/memory (DB queries)           │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SHARED (cross-layer)                                        │
│                                                                                      │
│  shared/slices/                     shared/memory/                                    │
│  ┌────────────────────────┐        ┌─────────────────────────────┐                   │
│  │ CheckStore (class)     │        │ database.ts                  │                   │
│  │ StepMemory (class)     │        │  getDb(), getSetting()       │                   │
│  │ FileRegistry (class)   │        │  setSetting()                │                   │
│  │ PaletteStore (class)   │        ├──────────────────────────────┤                   │
│  │ ReportAssembler (class)│        │ repository.ts                │                   │
│  └────────────────────────┘        │  getOrCreateSession()        │                   │
│                                    │  addUserMessage()            │                   │
│  shared/schemas.ts                 │  addAssistantResponse()      │                   │
│  ┌────────────────────────┐        │  saveFileContents/Chunks()   │                   │
│  │ Zod schemas:            │        │  getConversationHistory()    │                   │
│  │ ChatRequestSchema      │        │  getAllSessions()            │                   │
│  │ AgentResponseSchema    │        │  deleteSession()             │                   │
│  │ CitationSchema         │        │  getContextSnapshots()       │                   │
│  │ ConfidenceSchema       │        │  toggleStar()                │                   │
│  │ ComplianceCheckSchema  │        │  saveContextSnapshot()        │                   │
│  │ LessonSchema           │        ├──────────────────────────────┤                   │
│  │ ReferenceMapSchema     │        │ cleanup.ts                   │                   │
│  │ ClaimSchema            │        │  pruneOldSessions()          │                   │
│  │ ToolCallRecordSchema   │        │  deleteSessionCascade()      │                   │
│  │ ReasoningStepSchema    │        │  removeUploadDir()           │                   │
│  │ ValidationErrorSchema  │        └──────────────────────────────┘                   │
│  │ parseChunkRef()        │                                                           │
│  └────────────────────────┘        shared/template-types.ts                           │
│                                    ┌────────────────────────────────┐                │
│  shared/types.ts                  │ ReportTemplate, SectionType     │                │
│  ┌────────────────────────┐        │ TemplateSection, TemplateField  │                │
│  │ Re-exports all types   │        └────────────────────────────────┘                │
│  │ from schemas.ts        │                                                           │
│  └────────────────────────┘        shared/turn-types.ts                               │
│                                    ┌────────────────────────────────┐                │
│  shared/llm/factory.ts            │ ChatTurn interface             │                │
│  ┌────────────────────────┐        └────────────────────────────────┘                │
│  │ createModel()          │                                                           │
│  │ createOpenAI / Anthropic│         (Future: evolution/ directory)                    │
│  │ DeepSeek reasoning_    │                                                           │
│  │  content wrapper       │                                                           │
│  └────────────────────────┘                                                           │
│                                                                                      │
│  CONSUMED BY: Loading, Pipeline, Evaluation, Present, API Routes                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Function Call Flow (End-to-End)

```
HTTP POST /api/chat
  │
  ├─ ChatRequestSchema.safeParse(req.body)   ← validates message, skillName, sessionId,
  │                                             files, revisionFields
  │
  └─ orchestratePipeline(message, skillName, sessionId, files, revisionFields)
       │  [async generator — yields PipelineEvent to client via SSE]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  LOADING — Phase 1: INIT
       │════════════════════════════════════════════════════════════════
       │
       ├─ initPhase(skillName, sessionId, message)
       │    ├─ generateCorrelationId()                                    → corr-{ts}-{n}
       │    ├─ loadSkill(skillName)              ◄── loading/skill/loader.ts
       │    │    ├─ matter(SKILL.md)              → frontmatter + body
       │    │    ├─ parseChecks(skillmd)          ◄── loading/skill/check-parser.ts
       │    │    │    └─ parseFieldType(raw)      → CheckFieldType
       │    │    ├─ extractRegulationIds(checks)  → ["R48", "R112", ...]
       │    │    ├─ discover scripts/             → [{name, path, desc}]
       │    │    │    └─ getScriptDescription()   → Python docstring
       │    │    └─ load template.json (optional) → ReportTemplate
       │    ├─ getOrCreateSession(sessionId, skillName)  ◄── shared/memory/repository.ts
       │    ├─ addUserMessage(sessionId, message)        ◄── shared/memory/repository.ts
       │    ├─ pruneOldSessions()                        ◄── shared/memory/cleanup.ts
       │    │    ├─ getSetting("retention_days")
       │    │    └─ deleteSessionCascade() for expired
       │    ├─ createPipelineContext(name, skillmd, checks, sessionId, cid)
       │    │    ├─ new CheckStore()
       │    │    ├─ new StepMemory()
       │    │    ├─ new FileRegistry()
       │    │    ├─ new PaletteStore()
       │    │    └─ new ReportAssembler()
       │    └─ getResponsesForSession(sessionId)  → ctx.previousTurns[]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  LOADING — Phase 2: INPUT
       │════════════════════════════════════════════════════════════════
       │
       ├─ inputPhase(ctx, {files, sessionId})
       │    │
       │    ├─ [if files present]
       │    │    └─ for each file:
       │    │         ├─ extractFileContent(file)  ◄── user-info/extractors/index.ts
       │    │         │    ├─ image/*  → extractImageText(dataUrl)    ◄── ocr.ts
       │    │         │    │    └─ getTesseractWorker().recognize()
       │    │         │    │         └─ groupWordsIntoLines() → TextChunk[]
       │    │         │    ├─ pdf      → extractPdfText(dataUrl)     ◄── pdf-extract.ts
       │    │         │    │    ├─ Path A: pdfjs-dist → itemToWordBox() → linesToChunks()
       │    │         │    │    └─ Path B: render + OCR (scanned fallback)
       │    │         │    └─ docx     → extractDocxText(dataUrl)    ◄── docx-extract.ts
       │    │         │         └─ mammoth → stripHtml → splitParagraphs()
       │    │         └─ ctx.files.addFile({fileId, filename, extractedText, chunks, ...})
       │    │    ├─ saveFileContents(sessionId, combinedContent)     ◄── shared/memory/
       │    │    └─ saveFileChunks(sessionId, JSON.stringify(fileData))
       │    │
       │    └─ [if no files — follow-up turn]
       │         └─ getFileChunks(sessionId) → JSON.parse → ctx.files.addFile() for each
       │
       ├─═══════════════════════════════════════════════════════════════
       │  LOADING — Phase 2.5: SKILL GENERATION (auto-mode only)
       │════════════════════════════════════════════════════════════════
       │
       ├─ skillGenPhase(ctx, message)   (only if isAutoSkill)
       │    └─ generateSkill(message, fileTexts)  ◄── loading/extractors/skill-generator.ts
       │         ├─ streamText({model, system: SKILL_GENERATION_PROMPT, messages})
       │         ├─ matter(fullText) → frontmatter + body
       │         ├─ parseChecks(skillmd)
       │         └─ extractRegulationIds(checks)
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PIPELINE — Phase 3: LOAD REFERENCES + GENERATE STEPS
       │════════════════════════════════════════════════════════════════
       │
       ├─ loadReferences(ctx)  ◄── pipeline/builtins.ts
       │    ├─ extract regulationIds from ctx.skill.checks
       │    ├─ loadRegulations(regulationIds)
       │    │    └─ for each id:
       │    │         ├─ api.resolveCode(id)
       │    │         └─ api.getRegulation({code})
       │    │              └─ RegulationSchema.safeParse()
       │    ├─ ctx.palette.loadReferences([{filename, content}])
       │    └─ ctx.palette.loadCitationPalette(palette)
       │
       ├─ generateStepsFromChecks(ctx.skill.checks)  ◄── loading/generate-steps.ts
       │    └─ Steps 1..N: llm+tool (one per check field, with field instructions)
       │
       ├─ identifyRevisionTarget(s)  ◄── loading/phases/revision-phase.ts
       │    ├─ [if revisionFields provided] → identifyRevisionTargets(fields, checks)
       │    │    └─ maps field names to step numbers for targeted re-execution
       │    └─ [if follow-up turn, no explicit fields] → identifyRevisionTarget(ctx, msg)
       │         └─ LLM determines which step to redo from message analysis
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
       │  │    │              ├─ createModel()  ◄── llm/factory.ts
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
       │  │    │    │    └─ ctx.checks.compileCitations(citationPalette, sourcePalette)
       │  │    │    │         └─ lookup + deduplicate + sort
       │  │    │    └─ saveContextSnapshot({sessionId, turnNumber, stepNumber, ...})
       │  │    │         └─ saves full context state for debugging
       │  │
       │  └─ [after all steps]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  EVALUATION — Phase 4: ENFORCE CHECKS (gap-fill)
       │════════════════════════════════════════════════════════════════
       │
       ├─ enforceChecks(ctx)  ◄── evaluation/enforce-checks.ts
       │    ├─ defined = ctx.skill.checks  (from SKILL.md ## Checks)
       │    ├─ existing = ctx.checks.getResults()
       │    ├─ missing = defined - existing (by field name)
       │    ├─ [numerical only] regex-extract value from file text
       │    ├─ if found → CheckResult{verdict: "PASS"}
       │    └─ [qualitative missing] → skipped (narrative only, no auto-fill)
       │
       ├─═══════════════════════════════════════════════════════════════
       │  EVALUATION + PRESENT — Phase 5: EVALUATE + FINALIZE
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
            │    │    ├─ pdfPenalty from extractorUsed (pdf-parse=5, fallback=10)
            │    │    ├─ baseScore = 100 - ocrPenalty - pdfPenalty
            │    │    ├─ llmMultiplier from step outputs
            │    │    └─ finalScore = baseScore * llmMultiplier
            │    │         → Confidence{score, ocrConfidence, llmMultiplier, needsExpert}
            │    └─ validate({claims, citations, sourceCitations, ...})
            │         ◄── evaluation/validate.ts
            │         ├─ [for each claim] validate citation refs in palette
            │         ├─ [for each chunk ref] ~25% word overlap check
            │         ├─ content markers match compiled citations
            │         └─ auto-supplement missing citations from sourcePalette
            │
            ├─ verdict = ctx.checks.computeVerdict()  → PASS | FAIL
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
            ├─ addAssistantResponse(sessionId, agentResponse)  ◄── shared/memory/
            │
            └─ return {response: agentResponse, validationErrors, confidence}
                 │
                 └─ yield {type: "done", response: agentResponse}
```

---

## Segment Decoupling Summary

| Segment | Provides To | Interface (Types + Functions) | Consumes From |
|---------|------------|-------------------------------|---------------|
| **1. Knowledge** | Loading, Pipeline | `IRegulationApi`, `getRegulationApi()` | — |
| **2. User-Info** | Loading | `extractFileContent()`, `ExtractionResult`, `TextChunk` | — |
| **3. Loading** | Pipeline | `initPhase()`, `inputPhase()`, `skillGenPhase()`, `identifyRevisionTarget()`, `identifyRevisionTargets()`, `generateStepsFromChecks()`, `SkillLoader`, `ParsedCheck[]`, `ExecutableStep[]` | Knowledge, User-Info, Shared |
| **4. Pipeline** | Evaluation, Present | `orchestratePipeline()`, `StepResult`, `PipelineEvent` (streaming) | Loading, Shared |
| **5. Evaluation** | Present | `evaluate()`, `EvaluationResult` | Pipeline (CheckStore), Shared |
| **6. Present** | External | `finalizePhase()` → `AgentResponse`, `generateDocx()` → `.docx Blob` | Pipeline, Evaluation, Shared |
| **7. API Routes** | HTTP clients | 14 route handlers; consumes Pipeline + Shared | Pipeline, Shared |

### Key Decoupling Points

1. **Knowledge ↔ Pipeline**: `PipelineContext.skill` carries loaded skill metadata. `IRegulationApi` is swappable (mock ↔ real).

2. **User-Info ↔ Loading**: `Loading` calls `extractFileContent()` and receives `ExtractionResult`. Loading never touches file parsing.

3. **Loading ↔ Pipeline**: Loading delivers a fully initialized `PipelineContext` with all 5 slices. Pipeline never loads skills or files.

4. **Pipeline internal**: 5 shared slices (`CheckStore`, `StepMemory`, `FileRegistry`, `PaletteStore`, `ReportAssembler`) hold all state. Pipeline orchestrator coordinates execution loop with: skip-reuse, clear-before-execute, context-snapshot patterns.

5. **Pipeline ↔ Evaluation ↔ Present**: Pipeline runs steps and fills CheckStore. Present calls Evaluation to get confidence + findings + validation, then assembles `AgentResponse`.

6. **API Routes ↔ Pipeline**: `/api/chat` wraps `orchestratePipeline` async generator in SSE `ReadableStream`. All other routes are thin wrappers over `shared/memory/repository.ts` or `loading/skill/loader.ts`.

7. **Shared**: 5 slices + `memory/` + `schemas.ts` + types live in `shared/` — consumed by every layer but owned by none.

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

### SEGMENT 2 — User-Info Layer (`src/lib/agent/user-info/`)

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

#### `loading/generate-steps.ts`
| Function | Description |
|----------|-------------|
| `generateStepsFromChecks(checks)` | Maps `ParsedCheck[]` to `ExecutableStep[]` (1:1, `llm+tool` type). Each step includes field-specific instructions via `buildFieldInstructions()`. |
| `buildFieldInstructions(c)` | Builds LLM instructions for a step: type/kind, constraint, clause, depends_on, sample JSON output format. |

#### `loading/phases/init-phase.ts`
| Function | Description |
|----------|-------------|
| `initPhase(skillName, sessionId, message)` | Generates correlation ID, loads skill (or sets auto-skill flag), creates/gets session, adds user message, prunes old sessions, creates `PipelineContext`, loads previous turns. Returns `{ctx, correlationId, isAutoSkill}`. |

#### `loading/phases/input-phase.ts`
| Function | Description |
|----------|-------------|
| `inputPhase(ctx, {files, sessionId})` | If files present: extracts each via `extractFileContent()`, adds to `ctx.files`, persists to DB. If no files: restores from saved chunks in DB. |

#### `loading/phases/skill-gen-phase.ts`
| Function | Description |
|----------|-------------|
| `skillGenPhase(ctx, message)` | Calls `generateSkill()` with user message + extracted file texts, replaces `ctx.skill` with the auto-generated skill. |

#### `loading/phases/revision-phase.ts`
| Function | Description |
|----------|-------------|
| `identifyRevisionTarget(ctx, userMessage)` | On follow-up turns, calls LLM to determine which step number to redo based on user's follow-up message. Returns step number or `-1`. |
| `identifyRevisionTargets(revisionFields, checks)` | Maps explicit field names from UI checkboxes to step numbers (1-indexed from checks order). Used for targeted re-execution. |

---

### SEGMENT 4 — Pipeline (`src/lib/agent/pipeline/`)

#### `pipeline/orchestrator-v2.ts`
| Function | Description |
|----------|-------------|
| `orchestratePipeline(message, skillName, sessionId, files?, revisionFields?)` | **Top-level entry point.** Async generator: init → input → skill-gen → load-refs → step-gen → revision → step-exec → enforce → finalize. Yields `PipelineEvent` for SSE streaming. Handles skip-reuse, clear-before-execute, context snapshots. |
| `executeStepWithRetry(step, ctx, maxRetries)` | Wraps `executeLlmToolStep()` with retry loop (default 1 retry). Returns `StepResult`. |

#### `pipeline/pipeline-context.ts`
| Function / Type | Description |
|-----------------|-------------|
| `createPipelineContext(name, skillmd, checks, sessionId, cid?, scripts?)` | Factory. Creates `PipelineContext` with all 5 slices. |
| `PipelineContext` | Core context: `skill` metadata, `sessionId`, `correlationId`, slices (`checks`, `steps`, `files`, `palette`, `report`), `previousTurns[]`, `uploadedFiles[]`. |
| `CheckResult` | `{name, type, finding, verdict, citationRef, sourceCitation, toolCallId?, toolResult?}` |
| `CitationPaletteEntry` | `{id, regulation, clause, text}` |
| `SourcePaletteEntry` | `{id, fileId, filename, extractedText, keyExcerpt, chunks?, ...}` |

#### `pipeline/builtins.ts`
| Function | Description |
|----------|-------------|
| `loadReferences(ctx)` | Loads regulation data into palette by extracting IDs from checks, fetching via API. Builds `CitationPaletteEntry[]`. |
| `executeComplianceCheck(input)` | Evaluates numerical checks against operators (`>=`, `<=`, `>`, `<`, `range`). Returns pass/fail results. Called as a registered tool handler. |

#### `pipeline/executors/llm-executor.ts`
| Function | Description |
|----------|-------------|
| `executeLlmToolStep(step, ctx, previousError?)` | Runs an `llm+tool` step. Registers tools (compliance-check, scripts), streams LLM, processes tool results, stores output. |
| `buildDomainSchemaGuide(checks)` | Builds schema guide string from `ParsedCheck[]` for LLM prompts. |
| `buildContextSummary(ctx)` | Builds composite context string: file summary, latest step output, citation summary, check results, domain schema guide, source summary, previous turns. |
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

---

### SEGMENT 5 — Evaluation Layer (`src/lib/agent/evaluation/`)

#### `evaluation/enforce-checks.ts`
| Function | Description |
|----------|-------------|
| `enforceChecks(ctx)` | Gap-fills missing numerical check results via regex extraction from file text. Qualitative checks skipped (narrative-only). Found → PASS, not found → FAIL "not assessed". |

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
| `formatContent(stepOutputs, checks, checkResults, citationPalette)` | Per-check: strips JSON + `[R...]` markers from narrative, injects `<cite>` badges. |

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

---

### SEGMENT 7 — API Routes (`src/app/api/`)

#### `api/chat/route.ts`
| Route | Description |
|-------|-------------|
| `POST /api/chat` | Validates body with `ChatRequestSchema`, wraps `orchestratePipeline()` async generator in SSE `ReadableStream`. Yields `PipelineEvent` as SSE data frames. Returns `text/event-stream`. |

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

### SHARED — Cross-Layer State & Persistence (`src/lib/agent/shared/`)

#### `shared/slices/check-store.ts`
| Function | Description |
|----------|-------------|
| `CheckStore` (class) | Manages check results, claims, and compiled citations across pipeline + evaluation. |
| `.addCheck(result)` | Add single `CheckResult`. |
| `.addResults(results)` | Add multiple `CheckResult`s. |
| `.removeResultsForField(field)` | Remove and return results for a specific field (clear-before-execute pattern). |
| `.getResults()` | Get all check results. |
| `.addClaims(claims)` | Set claims array. |
| `.getClaims()` | Get claims. |
| `.getCitations()` | Get compiled regulation citations. |
| `.getSourceCitations()` | Get compiled source citations. |
| `.compileCitations(citationPalette, sourcePalette)` | Build `Citation[]` from check results by palette lookup + dedup + sort. |
| `.buildCitationsFromClaims(citationPalette, sourcePalette)` | Build citations from structured claims. |
| `.supplementFromContent(content, citationPalette, sourcePalette)` | Scan content for `[R...]`/`[S...]` markers and backfill missing citations. |
| `.computeVerdict()` | `FAIL` if any check has `verdict === "FAIL"`, else `PASS`. |
| `.failureCount` (getter) | Count of `FAIL` verdicts. |

#### `shared/slices/step-memory.ts`
| Function | Description |
|----------|-------------|
| `StepMemory` (class) | In-memory store for step outputs and arbitrary raw data. |
| `.write(stepNumber, value)` | Store output for a step. |
| `.read(stepNumber)` | Read output for a step. |
| `.latest()` | Most recent step output (highest step number). |
| `.getRaw(key)` | Read arbitrary data by string key. |
| `.setRaw(key, value)` | Write arbitrary data by string key. |
| `.entries()` | All entries as record. |

#### `shared/slices/file-registry.ts`
| Function | Description |
|----------|-------------|
| `FileRegistry` (class) | Manages uploaded files for the pipeline session. |
| `.addFile(file)` | Register an uploaded file. |
| `.getFiles()` | Get all uploaded files. |
| `.hasFiles()` | Check if any files registered. |
| `.getSourcePalette()` | Convert files to `SourcePaletteEntry[]` with excerpts. |
| `.buildContextSummary()` | Build LLM context string from files with chunk annotations. |
| `.averageOcrConfidence()` | Average OCR confidence across files. |

#### `shared/slices/palette-store.ts`
| Function | Description |
|----------|-------------|
| `PaletteStore` (class) | Manages loaded regulation references and citation palette. |
| `.loadReferences(refs)` | Load regulation reference texts. |
| `.getReferences()` | Get loaded references. |
| `.loadCitationPalette(entries)` | Load citation palette entries. |
| `.getCitationPalette()` | Get citation palette. |
| `.findCitation(ref)` | Lookup citation entry by ID. |
| `.formatContextSummary()` | Format citations as LLM context string. |
| `.formatSourceSummary(sourcePalette)` | Format source files as LLM context string. |

#### `shared/slices/report-assembler.ts`
| Function | Description |
|----------|-------------|
| `ReportAssembler` (class) | Assembles and stores report sections and verdict. |
| `.setContent(sections)` | Set report sections. |
| `.getContent()` | Get formatted report as markdown. |
| `.getAllContentFlat()` | Get all content as flat string for citation scanning. |
| `.getSections()` | Get raw sections record. |
| `.getSection(id)` | Get single section by ID. |
| `.setVerdict(v)` | Set PASS/FAIL verdict. |
| `.getVerdict()` | Get verdict. |

#### `shared/memory/database.ts`
| Function | Description |
|----------|-------------|
| `getDb()` | Singleton SQLite instance. Creates DB, runs DDL (5 tables), migrations, seeds defaults. |
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
| `saveFileContents(sessionId, fileContents)` | UPDATE `sessions.file_contents`. |
| `getFileContents(sessionId)` | SELECT `file_contents`. |
| `saveFileChunks(sessionId, chunksJson)` | UPDATE `sessions.file_chunks`. |
| `getFileChunks(sessionId)` | SELECT `file_chunks`. |
| `deleteSession(sessionId)` | CASCADE delete session + all related records. |
| `getAllSessions()` | SELECT all sessions with metadata. |
| `getResponsesForSession(sessionId)` | SELECT all responses with parsed JSON fields. |
| `saveContextSnapshot(snapshot)` | INSERT step state snapshot (system prompt, context summary, skillmd, references, uploaded files, step outputs). |
| `getContextSnapshots(sessionId)` | SELECT all snapshots. |
| `toggleStar(sessionId, starred)` | UPDATE `sessions.starred`. |

#### `shared/memory/cleanup.ts`
| Function | Description |
|----------|-------------|
| `pruneOldSessions()` | Deletes unstarred sessions past retention limits. Runs in single transaction. |
| `isValidSessionId(id)` | Regex validation for session IDs. |
| `deleteSessionCascade(db, sessionId)` | Delete all related records. |
| `removeUploadDir(sessionId)` | Remove `data/uploads/{sessionId}` directory. |

#### `shared/schemas.ts`
| Schema | Description |
|--------|-------------|
| `ChatRequestSchema` | Validates chat payload: `message`, `skillName?`, `sessionId`, `files?`, `revisionFields?`. |
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

#### `shared/template-types.ts`
| Type | Description |
|------|-------------|
| `ReportTemplate` | `{name, sections: TemplateSection[]}` — template for .docx export. |
| `TemplateSection` | `{id, title, type (fields|markdown|table|verdict), fields?, columns?}`. |
| `TemplateField` | `{id, label, type (text|number|select), options?}`. |

#### `shared/turn-types.ts`
| Type | Description |
|------|-------------|
| `ChatTurn` | UI-facing: `{userMessage, attachedFiles, response?, reasoningSteps, toolCalls, liveToolResults, error}`. |

#### `shared/types.ts`
| Type | Description |
|------|-------------|
| (re-exports) | Re-exports all inferred types from `schemas.ts`: `Citation`, `SourceCitation`, `SourceChunk`, `Claim`, `Verdict`, `AgentResponse`, `Confidence`, `ChatRequest`, `ComplianceCheckInput`, `ToolCallRecord`, `ValidationError`, `ReasoningStep`. |

#### `shared/llm/factory.ts`
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
| **2. User-Info** | 4 | ~10 |
| **3. Loading** | 8 | ~9 |
| **4. Pipeline** | 8 | ~14 |
| **5. Evaluation** | 6 | ~8 |
| **6. Present** | 3 | ~8 |
| **7. API Routes** | 11 | ~14 |
| **Shared** | 12 | ~40 |
| **LLM (shared/llm)** | 1 | ~3 |
| **Total (agent engine)** | **45** | **~98** |
| **Total (all source)** | **56** | **~114** |

*Updated 2026-05-23: added missing modules (generate-steps, script-runner, llm/factory, shared types), added API Routes segment, updated pipeline flow for revisionFields + clear-before-execute + context snapshots, fixed file counts throughout.*
