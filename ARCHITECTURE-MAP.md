# clausr.ai — Function-Level Architecture Map

## Segment Boundaries & Decoupling Interfaces

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SEGMENT 1: KNOWLEDGE LAYER                              │
│                                                                                      │
│  regulation/                          skill/                                         │
│  ┌──────────────────────┐             ┌──────────────────────┐                       │
│  │ regulation-types.ts  │             │ loader.ts            │                       │
│  │  - Clause,Regulation │             │  loadSkill(id)       │◄── init-phase         │
│  │  - Zod schemas       │             │  listSkills()        │                       │
│  └──────────┬───────────┘             └──────────┬───────────┘                       │
│             │                                    │                                    │
│  ┌──────────▼───────────┐             ┌──────────▼───────────┐                       │
│  │ regulation-api.ts    │             │ check-parser.ts      │                       │
│  │  IRegulationApi      │             │  parseChecks(md)     │◄── loader.ts          │
│  │  getRegulationApi()  │             │  extractRegulationIds│◄── loader.ts          │
│  │  setRegulationApi()  │             │  deriveDomainSchema  │                       │
│  └──────────┬───────────┘             └──────────┬───────────┘                       │
│             │                                    │                                    │
│  ┌──────────▼───────────┐             ┌──────────▼───────────┐                       │
│  │ mock-regulation-api  │             │ step-parser.ts       │                       │
│  │  MockRegulationApi   │             │  parseSteps(md)      │◄── execute-phase      │
│  │  .getRegulation()    │             └──────────────────────┘                       │
│  │  .getClause()        │                                                          │
│  │  .resolveCode()      │             ┌──────────────────────┐                       │
│  └──────────┬───────────┘             │ script-runner.ts     │                       │
│             │                         │  runScript(path,in)  │◄── llm-executor       │
│  ┌──────────▼───────────┐             └──────────────────────┘                       │
│  │ skill-source.ts      │                                                          │
│  │  loadRegulations()   │                                                          │
│  │  getClauseTextAsync()│                                                          │
│  └──────────────────────┘                                                          │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                        DECOUPLING INTERFACE                                    │  │
│  │                                                                                │  │
│  │  IRegulationApi (regulation-api.ts)                                            │  │
│  │    getRegulation, getClause, listRegulations, searchClauses,                  │  │
│  │    resolveCode, invalidateCache                                               │  │
│  │                                                                                │  │
│  │  SkillLoader (loader.ts)                                                       │  │
│  │    {name, skillmd, checks, scripts, template, regulationIds}                  │  │
│  │                                                                                │  │
│  │  ParsedCheck[] (check-parser.ts)                                               │  │
│  │    {field, type, constraint, clause, dependsOn, notes}                        │  │
│  │                                                                                │  │
│  │  ParsedStep[] (step-parser.ts)                                                 │  │
│  │    {number, title, type, instructions, temperature}                           │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SEGMENT 2: INPUT LAYER                                  │
│                                                                                      │
│  extractors/                          memory/                                        │
│  ┌──────────────────────┐             ┌──────────────────────┐                       │
│  │ index.ts             │             │ database.ts          │                       │
│  │  extractFileCont()   │─────────────►│  getDb()             │                       │
│  │    → OCR(Tesseract)  │             │  getSetting()        │                       │
│  │    → PDF(pdfjs)      │             │  setSetting()        │                       │
│  │    → DOCX(mammoth)   │             └──────────┬───────────┘                       │
│  └──────────────────────┘                        │                                    │
│                    ┌─────────────────────────────▼────────────────────────────┐      │
│                    │ memory/repository.ts                                     │      │
│                    │  getOrCreateSession()    ◄── init-phase                  │      │
│                    │  addUserMessage()        ◄── init-phase                  │      │
│                    │  getResponsesForSession()◄── init-phase                  │      │
│                    │  saveFileContents()      ◄── input-phase                  │      │
│                    │  saveFileChunks()        ◄── input-phase                  │      │
│                    │  getFileChunks()         ◄── input-phase                  │      │
│                    │  addAssistantResponse()  ◄── finalize-phase               │      │
│                    │  saveContextSnapshot()   ◄── orchestrator                 │      │
│                    │  getResponseCount()      ◄── orchestrator                 │      │
│                    │  getConversationHistory()                                 │      │
│                    │  getAllSessions()                                         │      │
│                    │  deleteSession()                                          │      │
│                    │  toggleStar()                                             │      │
│                    │  getContextSnapshots()                                    │      │
│                    └─────────────────────────────┬────────────────────────────┘      │
│                                                  │                                   │
│                    ┌─────────────────────────────▼────────────────────────────┐      │
│                    │ memory/cleanup.ts          ◄── init-phase                │      │
│                    │  pruneOldSessions()                                       │      │
│                    └──────────────────────────────────────────────────────────┘      │
│                                                                                      │
│  schemas.ts                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  Zod Schemas — single source of truth for all data types                     │   │
│  │  ChatRequestSchema, AgentResponseSchema, CitationSchema,                     │   │
│  │  SourceChunkSchema, ConfidenceSchema, ComplianceCheckSchema, ...             │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                        DECOUPLING INTERFACE                                  │   │
│  │                                                                              │   │
│  │  ExtractionResult (extractors/index.ts)                                      │   │
│  │    {text, chunks: TextChunk[], pageCount?, ocrConfidence?, extractorUsed?}  │   │
│  │                                                                              │   │
│  │  TextChunk (extractors/index.ts)                                             │   │
│  │    {id, text, bbox?, wordBoxes?, pageNumber?}                                │   │
│  │                                                                              │   │
│  │  UploadedFileEntry (pipeline/slices/file-registry.ts)                        │   │
│  │    {fileId, filename, extractedText, chunks?, dataUrl?, pageCount?,         │   │
│  │     ocrConfidence?, extractorUsed?}                                          │   │
│  │                                                                              │   │
│  │  Repository CRUD (memory/repository.ts)                                      │   │
│  │    Session: getOrCreate, getResponses, saveFileContents/Chunks,              │   │
│  │             getFileContents/Chunks, addAssistantResponse                     │   │
│  │    Message: addUserMessage, getConversationHistory                           │   │
│  │    Snapshot: saveContextSnapshot, getContextSnapshots                        │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SEGMENT 3: PIPELINE                                     │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  orchestrator-v2.ts  (ENTRY POINT — async generator, yields PipelineEvent)  │    │
│  │  orchestratePipeline(message, skillName, sessionId, files?)                 │    │
│  │    │                                                                        │    │
│  │    ├─► initPhase()          ── Phase 1: skill load, session, context        │    │
│  │    ├─► inputPhase()         ── Phase 2: file extraction / restore           │    │
│  │    ├─► parseStepsPhase()    ── Phase 3: parse SKILL.md steps                │    │
│  │    ├─► [loop] executeStep() ── Phase 3: step execution                      │    │
│  │    ├─► enforceChecks()      ── Phase 3b: gap-fill missing checks            │    │
│  │    ├─► reportPhase()        ── Phase 4: report assembly                     │    │
│  │    └─► finalizePhase()      ── Phase 5: verdict, confidence, persist        │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│         │               │              │               │              │              │
│         ▼               ▼              ▼               ▼              ▼              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ init-phase  │ │ input-phase │ │execute-phase│ │ report-phase│ │finalize-phase│  │
│  │ initPhase() │ │ inputPhase()│ │parseStepsPh()│ │reportPhase()│ │finalizePhase│  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘   │
│         │               │               │               │               │          │
│         ▼               ▼               ▼               ▼               ▼          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                         PipelineContext (shared state)                       │   │
│  │  createPipelineContext() ── factory                                          │   │
│  │  serializeContext() / deserializeContext() ── persistence                    │   │
│  │                                                                              │   │
│  │  skill: {name, skillmd, template, checks}                                    │   │
│  │  checks: CheckStore        ◄── slice: check-store.ts                        │   │
│  │  steps:  StepMemory        ◄── slice: step-memory.ts                        │   │
│  │  files:  FileRegistry      ◄── slice: file-registry.ts                      │   │
│  │  palette: PaletteStore     ◄── slice: palette-store.ts                      │   │
│  │  report: ReportAssembler   ◄── slice: report-assembler.ts                   │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│         │                                                                          │
│         ▼                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  step-executor.ts  (dispatch + retry)                                        │   │
│  │  executeStep(step, ctx, maxRetries)                                          │   │
│  │    │                                                                         │   │
│  │    ├─ builtin:* ──► executeBuiltin() ──► builtins.ts                        │   │
│  │    │                    └─ builtin:load-references ──► loadReferences()     │   │
│  │    │                         │                                               │   │
│  │    │                         ├─► loadRegulations() ◄── skill-source.ts       │   │
│  │    │                         │    └─► getRegulationApi()                     │   │
│  │    │                         │         └─► api.getRegulation()               │   │
│  │    │                         │              └─► resolveCode()                │   │
│  │    │                         │                   └─► RegulationSchema.parse() │   │
│  │    │                         ├─► ctx.palette.loadReferences()                │   │
│  │    │                         └─► ctx.palette.loadCitationPalette()            │   │
│  │    │                                                                     │   │
│  │    ├─ llm ──► executeLlmStep() ──► executors/llm-executor.ts                │   │
│  │    │              │                                                         │   │
│  │    │              ├─► buildContextSummary()                                  │   │
│  │    │              │    ├─ ctx.files.buildContextSummary()                    │   │
│  │    │              │    ├─ ctx.steps.latest()                                 │   │
│  │    │              │    ├─ ctx.palette.formatContextSummary()                 │   │
│  │    │              │    ├─ ctx.checks.getResults()                            │   │
│  │    │              │    ├─ buildDomainSchemaGuide(ctx.skill.checks)           │   │
│  │    │              │    └─ ctx.palette.formatSourceSummary()                  │   │
│  │    │              ├─► buildCitationGuide()                                   │   │
│  │    │              ├─► createModel() ◄── llm/factory                          │   │
│  │    │              ├─► streamText() ◄── ai library                            │   │
│  │    │              └─► storeOutput() ──► ctx.steps.write()                    │   │
│  │    │                                                                     │   │
│  │    └─ llm+tool ──► executeLlmToolStep() ──► executors/llm-executor.ts       │   │
│  │                       │                                                      │   │
│  │                       ├─► loadSkill() ◄── skill/loader                       │   │
│  │                       ├─► buildContextSummary()                              │   │
│  │                       ├─► buildCitationGuide()                               │   │
│  │                       ├─► Tool registration:                                  │   │
│  │                       │    ├─ checkCompliance ──► executeComplianceCheck()   │   │
│  │                       │    └─ generic scripts ──► runScript()                │   │
│  │                       ├─► streamText() with tools                            │   │
│  │                       │    └─ onStepFinish:                                  │   │
│  │                       │         ├─ ctx.checks.addResults()                   │   │
│  │                       │         └─ ctx.steps.setRaw("toolCalls")             │   │
│  │                       ├─► findCitationRef()                                  │   │
│  │                       └─► storeOutput() ──► ctx.steps.write()                │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                        DECOUPLING INTERFACE                                  │   │
│  │                                                                              │   │
│  │  PipelineEvent (phases/types.ts)                                             │   │
│  │    {type: "status"|"token"|"tool-result"|"done"|"error", ...}               │   │
│  │                                                                              │   │
│  │  StepResult (step-executor.ts)                                               │   │
│  │    {success, error?, errorCode?, contextSnapshot?, streamedTokens?,         │   │
│  │     toolResults?}                                                            │   │
│  │                                                                              │   │
│  │  PipelineContext (pipeline-context.ts)                                       │   │
│  │    skill: {name, skillmd, template, checks: ParsedCheck[]}                   │   │
│  │    checks: CheckStore  — addResults(), getResults(), compileCitations(),     │   │
│  │                      computeVerdict(), supplementFromContent()              │   │
│  │    steps:  StepMemory  — write(), read(), latest(), getRaw(), setRaw()      │   │
│  │    files:  FileRegistry — addFile(), getFiles(), getSourcePalette(),         │   │
│  │                       buildContextSummary(), averageOcrConfidence()         │   │
│  │    palette: PaletteStore — loadReferences(), loadCitationPalette(),          │   │
│  │                      getCitationPalette(), getReferences(),                  │   │
│  │                      formatContextSummary(), formatSourceSummary()          │   │
│  │    report: ReportAssembler — setContent(), getContent(), getAllContentFlat(),│   │
│  │                      getSections(), getSection(), setVerdict(), getVerdict() │   │
│  │                                                                              │   │
│  │  Phase Functions (phases/)                                                   │   │
│  │    initPhase(skillName, sessionId, message) → {ctx, correlationId}          │   │
│  │    inputPhase(ctx, {files?, sessionId}) → void                               │   │
│  │    parseStepsPhase(ctx) → ParsedStep[]                                       │   │
│  │    enforceChecks(ctx) → void                                                 │   │
│  │    reportPhase(ctx, steps, maxStepNum) → void                                │   │
│  │    finalizePhase(ctx, steps, sessionId) → {response, validationErrors,       │   │
│  │                                            confidence}                      │   │
│  │                                                                              │   │
│  │  Executor Functions (executors/)                                             │   │
│  │    executeLlmStep(step, ctx, previousError?) → StepResult                    │   │
│  │    executeLlmToolStep(step, ctx, previousError?) → StepResult                │   │
│  │    executeBuiltin(executor, ctx) → StepResult                                │   │
│  │    executeComplianceCheck(input) → {results: ComplianceCheckResult[]}        │   │
│  │                                                                              │   │
│  │  Support Functions                                                           │   │
│  │    buildDomainSchemaGuide(checks) → string                                   │   │
│  │    buildClauseTextsFromPalette(palette) → Record<string,string>              │   │
│  │    postValidate(ctx, steps?) → ValidationError[]                             │   │
│  │    validateClaimChunks(ctx) → ValidationError[]                              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              SEGMENT 4: OUTPUT LAYER                                 │
│                                                                                      │
│  export-docx.ts                       pipeline/ (finalize-phase)                     │
│  ┌──────────────────────┐             ┌──────────────────────┐                       │
│  │ generateDocx()       │◄── download │  finalizePhase()     │                       │
│  │  ├─ fillTemplateDocx │             │  ├─ computeVerdict() │                       │
│  │  │   ├─ fetch .docx  │             │  ├─ computeConfidence│                       │
│  │  │   ├─ buildPlaceholderMap         │  ├─ postValidate()  │                       │
│  │  │   │   ├─ stripMarkdown           │  ├─ buildClauseTexts│                       │
│  │  │   │   └─ flattenObject           │  ├─ formatContent() │                       │
│  │  │   ├─ normalizeConsecutiveRuns    │  ├─ buildReasoning  │                       │
│  │  │   └─ escapeXml                   │  ├─ AgentResponseSchema.parse              │
│  │  └─ buildFallbackDocx│             │  └─ addAssistantResponse                     │
│  └──────────────────────┘             └──────────────────────┘                       │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                        DECOUPLING INTERFACE                                  │   │
│  │                                                                              │   │
│  │  AgentResponse (schemas.ts)                                                  │   │
│  │    {content, reasoning, citations, sourceCitations?, round, sessionId,       │   │
│  │     verdict, clauseTexts?, sections?, toolCalls?, reasoningSteps?,           │   │
│  │     claims?, confidence, validationErrors?}                                  │   │
│  │                                                                              │   │
│  │  ReportTemplate (template-types.ts)                                          │   │
│  │    {name, sections: TemplateSection[]}                                       │   │
│  │    TemplateSection: {id, type, fields?, heading?}                            │   │
│  │                                                                              │   │
│  │  generateDocx(response, template?, skillName?) → Promise<Blob>               │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Function Call Flow (End-to-End)

```
HTTP POST /api/chat
  │
  ├─ ChatRequestSchema.safeParse(req.body)
  │
  └─ orchestratePipeline(message, skillName, sessionId, files)
       │  [async generator — yields PipelineEvent to client via streaming]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PHASE 1: INIT
       │════════════════════════════════════════════════════════════════
       │
       ├─ initPhase(skillName, sessionId, message)
       │    ├─ generateCorrelationId()                                    → corr-{ts}-{n}
       │    ├─ loadSkill(skillName)              ◄── Knowledge Layer
       │    │    ├─ matter(SKILL.md)              → frontmatter + body
       │    │    ├─ parseChecks(skillmd)          ◄── check-parser.ts
       │    │    │    └─ parseFieldType(raw)      → CheckFieldType
       │    │    ├─ extractRegulationIds(checks)  → ["R48", "R112", ...]
       │    │    ├─ discover scripts/             → [{name, path, desc}]
       │    │    │    └─ getScriptDescription()   → Python docstring
       │    │    └─ load template.json (optional) → ReportTemplate
       │    ├─ getOrCreateSession(sessionId, skillName)  ◄── Memory Layer
       │    ├─ addUserMessage(sessionId, message)        ◄── Memory Layer
       │    ├─ pruneOldSessions()                        ◄── Memory Layer
       │    │    ├─ getSetting("retention_days")
       │    │    └─ deleteSessionCascade() for expired
       │    ├─ createPipelineContext(name, skillmd, template, sessionId, cid, checks)
       │    │    ├─ new CheckStore()
       │    │    ├─ new StepMemory()
       │    │    ├─ new FileRegistry()
       │    │    ├─ new PaletteStore()
       │    │    └─ new ReportAssembler()
       │    └─ getResponsesForSession(sessionId)  → ctx.previousTurns[]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PHASE 2: INPUT
       │════════════════════════════════════════════════════════════════
       │
       ├─ inputPhase(ctx, {files, sessionId})
       │    │
       │    ├─ [if files present]
       │    │    └─ for each file:
       │    │         ├─ extractFileContent(file)  ◄── Input Layer
       │    │         │    ├─ image/*  → extractImageText(dataUrl)
       │    │         │    │    └─ getTesseractWorker().recognize()
       │    │         │    │         └─ groupWordsIntoLines() → TextChunk[]
       │    │         │    ├─ pdf      → extractPdfText(dataUrl)
       │    │         │    │    ├─ Path A: pdfjs-dist → itemToWordBox() → linesToChunks()
       │    │         │    │    └─ Path B: render pages → extractImageText() (scanned fallback)
       │    │         │    └─ docx     → extractDocxText(dataUrl)
       │    │         │         └─ mammoth.convertToHtml() → stripHtml() → splitParagraphs()
       │    │         └─ ctx.files.addFile({fileId, filename, extractedText, chunks, ...})
       │    │    ├─ saveFileContents(sessionId, combinedContent)  ◄── Memory Layer
       │    │    └─ saveFileChunks(sessionId, JSON.stringify(fileData))  ◄── Memory Layer
       │    │
       │    └─ [if no files — follow-up turn]
       │         └─ getFileChunks(sessionId) → JSON.parse → ctx.files.addFile() for each
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PHASE 3: PARSE & EXECUTE
       │════════════════════════════════════════════════════════════════
       │
       ├─ parseStepsPhase(ctx)
       │    └─ parseSteps(ctx.skill.skillmd)  ◄── skill/step-parser.ts
       │         └─ regex: ## 2. Execution Flow → table rows → ParsedStep[]
       │
       ├─ turnNumber = getResponseCount(sessionId) + 1
       │
       ├─ ┌─ for each step in steps:
       │  │    │
       │  │    ├─ executeStep(step, ctx, maxRetries=1)
       │  │    │    └─ tryExecute(step, ctx, previousError)  [retry loop]
       │  │    │         │
       │  │    │         ├─ [builtin:*] ──► executeBuiltin(step.type, ctx)
       │  │    │         │    └─ "builtin:load-references":
       │  │    │         │         └─ loadReferences(ctx)
       │  │    │         │              ├─ extract regulationIds from ctx.skill.checks
       │  │    │         │              ├─ loadRegulations(regulationIds)  ◄── skill-source.ts
       │  │    │         │              │    └─ for each id:
       │  │    │         │              │         ├─ api.resolveCode(id)
       │  │    │         │              │         └─ api.getRegulation({code})
       │  │    │         │              │              └─ RegulationSchema.safeParse()
       │  │    │         │              ├─ ctx.palette.loadReferences([{filename, content}])
       │  │    │         │              ├─ ctx.palette.loadCitationPalette(palette)
       │  │    │         │              └─ ctx.steps.setRaw("2", metadata)
       │  │    │         │
       │  │    │         ├─ [llm] ──► executeLlmStep(step, ctx, previousError)
       │  │    │         │    ├─ buildContextSummary(ctx)
       │  │    │         │    │    ├─ ctx.files.buildContextSummary()
       │  │    │         │    │    ├─ ctx.steps.latest()
       │  │    │         │    │    ├─ ctx.palette.formatContextSummary()
       │  │    │         │    │    ├─ ctx.checks.getResults()
       │  │    │         │    │    ├─ buildDomainSchemaGuide(ctx.skill.checks)
       │  │    │         │    │    └─ ctx.palette.formatSourceSummary(sourcePalette)
       │  │    │         │    ├─ buildCitationGuide(ctx)
       │  │    │         │    ├─ createModel()  ◄── llm/factory.ts (reads DB settings)
       │  │    │         │    ├─ streamText({model, system, messages, responseFormat?})
       │  │    │         │    │    └─ consume textStream → tokens[]
       │  │    │         │    └─ storeOutput(ctx, step.number, fullText)
       │  │    │         │         └─ ctx.steps.write(stepNumber, parsed-or-raw)
       │  │    │         │
       │  │    │         └─ [llm+tool] ──► executeLlmToolStep(step, ctx, previousError)
       │  │    │              ├─ loadSkill(ctx.skill.name)  ◄── skill/loader.ts
       │  │    │              ├─ buildContextSummary(ctx)
       │  │    │              ├─ buildCitationGuide(ctx)
       │  │    │              ├─ Register tools from skill.scripts:
       │  │    │              │    ├─ "compliance-check" → tool(checkCompliance)
       │  │    │              │    │    └─ execute: executeComplianceCheck(input)
       │  │    │              │    │         └─ for each check: eval operator (>=, <=, >, <, range)
       │  │    │              │    └─ other scripts → tool(script.name)
       │  │    │              │         └─ execute: runScript(script.path, input)
       │  │    │              │              └─ execFile("python3", [path]) → JSON.parse(stdout)
       │  │    │              ├─ streamText({model, system, messages, tools, onStepFinish})
       │  │    │              │    └─ onStepFinish(event):
       │  │    │              │         ├─ for each toolResult:
       │  │    │              │         │    ├─ merge input+output → CheckResult[]
       │  │    │              │         │    ├─ ctx.checks.addResults(results)
       │  │    │              │         │    └─ ctx.steps.setRaw("toolCalls", records)
       │  │    │              │         └─ validate tool was called (else → retry with error)
       │  │    │              ├─ findCitationRef(ctx, result)
       │  │    │              │    └─ lookup in ctx.palette.getCitationPalette()
       │  │    │              └─ storeOutput(ctx, step.number, fullText)
       │  │    │
       │  │    ├─ yield {type: "token", text, stepNumber}  for each streamedToken
       │  │    ├─ yield {type: "tool-result", stepNumber, results}  if toolResults present
       │  │    ├─ ctx.steps.read(step.number)  → log output
       │  │    │
       │  │    ├─ if ctx.checks.getResults().length > 0:
       │  │    │    └─ ctx.checks.compileCitations(citationPalette, sourcePalette)
       │  │    │         ├─ for each CheckResult:
       │  │    │         │    ├─ lookup citationPalette entry → Citation
       │  │    │         │    └─ lookup sourcePalette entry → SourceCitation
       │  │    │         └─ deduplicate + sort
       │  │    │
       │  │    └─ saveContextSnapshot({sessionId, turnNumber, stepNumber, ...})  ◄── Memory Layer
       │  │
       │  └─ [after all steps]
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PHASE 3b: ENFORCE CHECKS
       │════════════════════════════════════════════════════════════════
       │
       ├─ enforceChecks(ctx)
       │    ├─ defined = ctx.skill.checks  (from SKILL.md ## Checks)
       │    ├─ existing = ctx.checks.getResults()
       │    ├─ missing = defined - existing (by field name)
       │    └─ for each missing check:
       │         ├─ regex-extract value from ctx.files.getFiles() combined text
       │         ├─ if found → CheckResult{name, value, verdict: "PASS"}
       │         └─ if not found → CheckResult{finding: "not assessed", verdict: "FAIL"}
       │         └─ ctx.checks.addResults([result])
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PHASE 4: REPORT
       │════════════════════════════════════════════════════════════════
       │
       ├─ reportPhase(ctx, steps, maxStepNum)
       │    ├─ for each step: ctx.steps.read(step.number) → stepTexts[]
       │    ├─ ctx.checks.getResults() → findings[] (with citation + source markers)
       │    ├─ ctx.report.setContent({assessment: stepTexts, findings})
       │    ├─ reportContent = ctx.report.getAllContentFlat()
       │    └─ ctx.checks.supplementFromContent(reportContent, citationPalette, sourcePalette)
       │         └─ scan content for [R48.x.x] and [SN] markers → backfill missing citations
       │
       ├─═══════════════════════════════════════════════════════════════
       │  PHASE 5: FINALIZE
       │════════════════════════════════════════════════════════════════
       │
       └─ finalizePhase(ctx, steps, sessionId)
            ├─ verdict = ctx.checks.computeVerdict()  → "PASS" | "FAIL"
            ├─ ctx.report.setVerdict(verdict)
            │
            ├─ confidence = computeObjectiveConfidence(ctx)
            │    ├─ avgOcr = ctx.files.averageOcrConfidence()
            │    ├─ ocrPenalty = (1 - avgOcr/100) * 30
            │    ├─ pdfPenalty = 5 (pdf-parse) or 10 (fallback)
            │    ├─ baseScore = 100 - ocrPenalty - pdfPenalty
            │    ├─ llmMultiplier from ctx.steps.entries() (if LLM provided confidence)
            │    └─ finalScore = baseScore * llmMultiplier
            │         → {score, ocrConfidence, dataCompleteness, llmMultiplier, llmReasoning, needsExpert}
            │
            ├─ validationErrors = postValidate(ctx, steps)
            │    ├─ validateClaimChunks(ctx)
            │    │    └─ for each claim: verify chunkRef exists, ~25% word overlap
            │    ├─ check citation/source markers in report content vs compiled citations
            │    └─ check verdict consistency with report content
            │
            ├─ clauseTexts = buildClauseTextsFromPalette(citationPalette)
            │    └─ {"R48.5.11": "clause text..."}
            │
            ├─ Build responseData:
            │    ├─ content = formatContent(ctx, steps)
            │    │    └─ sections as markdown tables OR last LLM step output
            │    ├─ reasoning = buildReasoningFromSteps(ctx, steps)
            │    │    └─ "---STEP N---\ntitle\noutput[0:500]"
            │    ├─ citations = ctx.checks.getCitations()
            │    ├─ sourceCitations = ctx.checks.getSourceCitations()
            │    ├─ sections = ctx.report.getSections()
            │    ├─ toolCalls = ctx.steps.getRaw("toolCalls")
            │    ├─ reasoningSteps = buildReasoningSteps(ctx, steps)
            │    ├─ claims = ctx.checks.getClaims()
            │    ├─ confidence
            │    └─ validationErrors (if any)
            │
            ├─ agentResponse = AgentResponseSchema.parse(responseData)  ◄── schemas.ts
            ├─ addAssistantResponse(sessionId, agentResponse)  ◄── Memory Layer
            │
            └─ return {response: agentResponse, validationErrors, confidence}
                 │
                 └─ yield {type: "done", response: agentResponse}
```

---

## Segment Decoupling Summary

| Segment | Provides To | Interface (Types + Functions) | Consumes From |
|---------|------------|-------------------------------|---------------|
| **1. Knowledge** | Pipeline | `IRegulationApi`, `loadRegulations()`, `getClauseTextAsync()`, `SkillLoader`, `ParsedCheck[]`, `ParsedStep[]` | — |
| **2. Input** | Pipeline | `ExtractionResult`, `TextChunk`, `UploadedFileEntry`, Repository CRUD functions, Zod schemas | — |
| **3. Pipeline** | Output Layer | `AgentResponse` (via `finalizePhase`), `PipelineEvent` (streaming) | Knowledge + Input |
| **4. Output** | External | `.docx` Blob | `generateDocx(response, template?, skillName?)` | Pipeline (`AgentResponse`) |

### Key Decoupling Points

1. **Knowledge ↔ Pipeline**: `PipelineContext.skill` carries `SkillLoader` output (skillmd, checks, template). `IRegulationApi` is swappable (mock ↔ real implementation).

2. **Input ↔ Pipeline**: `PipelineContext.files` (FileRegistry) carries `UploadedFileEntry` objects. File extraction is isolated in `extractors/` — pipeline only sees the extraction result.

3. **Pipeline internal**: 5 focused context slices (`CheckStore`, `StepMemory`, `FileRegistry`, `PaletteStore`, `ReportAssembler`) replace monolithic `PipelineContext` fields. Each slice has a narrow, focused API.

4. **Pipeline ↔ Output**: `AgentResponse` (Zod-validated) is the single handoff type. `generateDocx()` consumes only `AgentResponse` + optional `ReportTemplate`.

5. **Memory Layer**: Shared by all segments via `repository.ts` (SQLite). Stores sessions, messages, responses, file contents/chunks, and context snapshots.

---

## Complete Function Reference

### SEGMENT 1 — Knowledge Layer

#### `src/lib/agent/regulation/regulation-api.ts`
| Function | Description |
|----------|-------------|
| `getRegulationApi()` | Singleton factory — lazily instantiates and returns the current `IRegulationApi` implementation (defaults to `MockRegulationApi`). |
| `setRegulationApi(api)` | Injects a custom `IRegulationApi` implementation. Used for swapping mock ↔ real regulation backends. |

#### `src/lib/agent/regulation/mock-regulation-api.ts`
| Function | Description |
|----------|-------------|
| `MockRegulationApi` (class) | Implements `IRegulationApi` with hardcoded UN vehicle regulations (R48, R112, R83, R154, R13) and in-memory caches. |
| `.getRegulation(req)` | Resolves code alias, looks up regulation in cache, validates with `RegulationSchema.safeParse()`, returns response. |
| `.getClause(req)` | Resolves code, looks up a single clause in the clause cache by `"code:number"` composite key. |
| `.listRegulations(req)` | Filters cached regulations by jurisdiction and/or keyword (case-insensitive match on title/description/code). |
| `.searchClauses(req)` | Searches clause title/text/number across all (or specified) regulations for a keyword match. |
| `.resolveCode(rawCode)` | Normalizes raw code strings (`"R48"`, `"UN-R48"`, `"UNR48"`) to canonical regulation code via `CODE_ALIASES` map. |
| `.invalidateCache()` | Clears both regulation and clause caches, then re-populates from hardcoded `MOCK_REGULATIONS` data. |

#### `src/lib/agent/regulation/skill-source.ts`
| Function | Description |
|----------|-------------|
| `loadRegulations(regulationIds)` | Iterates regulation IDs, resolves each via `api.resolveCode()`, fetches full regulation via `api.getRegulation()`, returns `Regulation[]`. |
| `getClauseTextAsync(regulation, clause)` | Resolves regulation code, fetches single clause via `api.getClause()`, returns clause text string or `null`. |

#### `src/lib/agent/skill/loader.ts`
| Function | Description |
|----------|-------------|
| `loadSkill(skillId)` | Reads `skills/<skillId>/SKILL.md`, parses YAML frontmatter with `gray-matter`, discovers `.py` scripts, parses `## Checks` table, loads optional `template.json`. Returns `SkillLoader` object. |
| `listSkills()` | Lists all subdirectories under `skills/` that contain a `SKILL.md` file. |
| `getScriptDescription(filePath, filename)` | Reads a Python file and extracts the first `"""..."""` docstring as description; falls back to `"Script: <filename>"`. |

#### `src/lib/agent/skill/check-parser.ts`
| Function | Description |
|----------|-------------|
| `parseChecks(skillmd)` | Extracts the `## Checks` markdown table from SKILL.md, parses table rows with regex, converts type strings to `CheckFieldType`. Returns `ParsedCheck[]` or empty array. |
| `extractRegulationIds(checks)` | Extracts unique regulation IDs from the `clause` column of parsed checks using regex `/R(\d+)/`. Returns sorted array. |
| `deriveDomainSchema(checks)` | Builds a nested Zod object schema from `ParsedCheck[]` field paths (e.g., `"vehicle.make"` → `{ vehicle: z.object({ make: ... }) }`). |
| `findCheck(fieldPath, checks)` | Finds a `ParsedCheck` by exact field path match. |
| `parseFieldType(raw)` | Converts type string (`"string"`, `"number"`, `"boolean"`, `"enum(a,b,c)"`) to `CheckFieldType`. |
| `groupFieldsByPrefix(checks)` | Groups fields by their top-level prefix (before first dot), stripping the prefix from field names. |
| `buildNestedShape(fields)` | Builds a flat Zod shape object from a group of fields (used by `deriveDomainSchema`). |
| `fieldTypeToZod(check)` | Maps a `ParsedCheck` to a Zod type, applying `.optional()` unless constraint is `"required"`. |

#### `src/lib/agent/skill/step-parser.ts`
| Function | Description |
|----------|-------------|
| `parseSteps(skillmd)` | Extracts the `## 2. Execution Flow` section from SKILL.md, parses markdown table rows (`| # | Step | Executor |`), returns `ParsedStep[]`. Throws `SkillLoadError` if section missing or empty. |

#### `src/lib/agent/skill/script-runner.ts`
| Function | Description |
|----------|-------------|
| `runScript(scriptPath, input, timeoutMs)` | Runs `python3 <scriptPath>` with JSON input piped to stdin via `execFile`. Default timeout 30s, max buffer 1MB. Returns `{stdout, stderr, success}`. |

---

### SEGMENT 2 — Input Layer

#### `src/lib/agent/extractors/index.ts`
| Function | Description |
|----------|-------------|
| `extractFileContent(file)` | Main dispatcher. Routes to OCR, PDF, or DOCX extractor based on MIME type and file extension. Returns `ExtractionResult`. |
| `mergeWordBoxes(boxes)` | Computes the bounding box enclosing all input word boxes (min x/y, max x+width/y+height). |

#### `src/lib/agent/extractors/ocr.ts`
| Function | Description |
|----------|-------------|
| `extractImageText(dataUrl)` | OCR via Tesseract.js. Returns `{text, chunks: TextChunk[], ocrConfidence, extractorUsed}`. |
| `getTesseractWorker()` | Lazy singleton Tesseract worker initialization. |
| `collectWords(page)` | Flattens Tesseract page blocks/paragraphs/lines/words into a flat word array. |
| `toWordBox(b)` | Converts Tesseract bbox to internal `WordBox` format. |
| `groupWordsIntoLines(words)` | Groups words into lines by Y-coordinate proximity. |

#### `src/lib/agent/extractors/pdf-extract.ts`
| Function | Description |
|----------|-------------|
| `extractPdfText(dataUrl)` | Two-path PDF extraction: Path A uses pdfjs-dist for positioned text; Path B renders pages as images + OCR for scanned PDFs. |
| `itemToWordBox(item)` | Converts a PDF text item's transform matrix to a `WordBox`. |
| `groupItemsIntoLines(items)` | Groups PDF text items into lines by Y-coordinate proximity. |
| `linesToChunks(lines, pageNumber)` | Converts lines to `TextChunk[]` with bounding boxes, merging nearby lines. |

#### `src/lib/agent/extractors/docx-extract.ts`
| Function | Description |
|----------|-------------|
| `extractDocxText(dataUrl)` | Uses mammoth to convert DOCX to HTML, then strips HTML to plain text. Returns paragraph-level chunks. |
| `stripHtml(html)` | Removes HTML tags and decodes HTML entities. |
| `splitParagraphs(html)` | Splits HTML by `</p>` tags and strips each paragraph. |

#### `src/lib/agent/memory/database.ts`
| Function | Description |
|----------|-------------|
| `getDb()` | Singleton SQLite database instance. Creates DB file, runs DDL (5 tables), applies migrations (adds columns/indexes), seeds default settings. Returns `better-sqlite3` instance. |
| `getSetting(key)` | Reads a value from the `settings` table. Returns string or null. |
| `setSetting(key, value)` | Upserts a key-value in the `settings` table. |

#### `src/lib/agent/memory/repository.ts`
| Function | Description |
|----------|-------------|
| `getOrCreateSession(sessionId, skillName)` | INSERT OR IGNORE into `sessions` table. |
| `addUserMessage(sessionId, content)` | INSERT user message into `messages` table. |
| `addAssistantResponse(sessionId, response)` | INSERT assistant message + full response record into `messages` and `responses` tables (serializes all JSON fields). |
| `getConversationHistory(sessionId)` | SELECT messages ordered by id for a session. Returns `{role, content}[]`. |
| `getResponseCount(sessionId)` | COUNT of responses for a session. Used for turn/round numbering. |
| `saveFileContents(sessionId, fileContents)` | UPDATE `sessions.file_contents`. |
| `getFileContents(sessionId)` | SELECT `file_contents` from sessions. |
| `saveFileChunks(sessionId, chunksJson)` | UPDATE `sessions.file_chunks` (JSON string). |
| `getFileChunks(sessionId)` | SELECT `file_chunks` from sessions. Returns `"[]"` if none. |
| `deleteSession(sessionId)` | CASCADE delete from `context_snapshots`, `messages`, `responses`, `sessions`. |
| `getRecentMemories(skillName, limit)` | SELECT recent assistant messages for a skill, truncated to 120 chars. |
| `getAllSessions()` | SELECT all sessions with first message, last message, verdict, confidence, round count. |
| `getResponsesForSession(sessionId)` | SELECT all responses for a session with parsed JSON fields (citations, sections, toolCalls, claims, confidence, etc.). |
| `saveContextSnapshot(snapshot)` | INSERT into `context_snapshots` (full step state: system prompt, user message, context summary, skillmd, uploaded files, step outputs). |
| `getContextSnapshots(sessionId)` | SELECT all snapshots for a session. |
| `toggleStar(sessionId, starred)` | UPDATE `sessions.starred`. |

#### `src/lib/agent/memory/cleanup.ts`
| Function | Description |
|----------|-------------|
| `pruneOldSessions()` | Deletes unstarred sessions older than `retention_days` and/or exceeding `retention_max_sessions`. Also removes upload directories. Runs in a single transaction. |
| `isValidSessionId(id)` | Regex validation for session IDs (`^[a-zA-Z0-9_-]+$`, 1-128 chars). |
| `deleteSessionCascade(db, sessionId)` | Deletes all related records for a session across all tables. |
| `removeUploadDir(sessionId)` | Removes `data/uploads/{sessionId}` directory. |

#### `src/lib/agent/schemas.ts`
| Function | Description |
|----------|-------------|
| *(Zod schemas)* | Single source of truth for all data types. Exported schemas: `ChatRequestSchema`, `AgentResponseSchema`, `CitationSchema`, `SourceChunkSchema`, `SourceCitationSchema`, `VerdictSchema`, `ValidationErrorSchema`, `ReasoningStepSchema`, `LessonSchema`, `ClaimSchema`, `ToolCallRecordSchema`, `ConfidenceSchema`, `ComplianceCheckSchema`, `ReferenceMapSchema`. |

---

### SEGMENT 3 — Pipeline

#### `src/lib/agent/pipeline/orchestrator-v2.ts`
| Function | Description |
|----------|-------------|
| `orchestratePipeline(message, skillName, sessionId, files?)` | **Top-level entry point.** Async generator that coordinates all 5 phases in sequence, yields `PipelineEvent` for real-time streaming to the client. |

#### `src/lib/agent/pipeline/pipeline-context.ts`
| Function | Description |
|----------|-------------|
| `createPipelineContext(skillName, skillmd, template, sessionId, correlationId, checks?)` | Factory function. Creates a fresh `PipelineContext` with all 5 slices initialized (CheckStore, StepMemory, FileRegistry, PaletteStore, ReportAssembler). |
| `serializeContext(ctx)` | Serializes context to JSON for persistence across turns. Captures skillData, citationPalette, sourcePalette, checkResults, compiledCitations, compiledSourceCitations, uploadedFiles. |
| `deserializeContext(json, skill, sessionId)` | Parses JSON back into a partial `PipelineContext`. |

#### `src/lib/agent/pipeline/step-executor.ts`
| Function | Description |
|----------|-------------|
| `executeStep(step, ctx, maxRetries)` | Execute a single pipeline step with retry logic (default 1 retry). Loops `attempt` from 0 to maxRetries, calls `tryExecute()`, returns on first success or final failure. |
| `tryExecute(step, ctx, previousError)` | Internal dispatch function. Routes by step type: `builtin:*` → `executeBuiltin()`, `llm` → `executeLlmStep()`, `llm+tool` → `executeLlmToolStep()`. |

#### `src/lib/agent/pipeline/builtins.ts`
| Function | Description |
|----------|-------------|
| `executeBuiltin(executor, ctx)` | Dispatches built-in step handlers by name. Currently only `"builtin:load-references"`. Returns `StepResult`. |
| `loadReferences(ctx)` | Private. Extracts regulation IDs from `ctx.skill.checks`, calls `loadRegulations()`, loads regulation text and citation palette into `ctx.palette`, stores metadata in `ctx.steps`. |
| `executeComplianceCheck(input)` | Evaluates numerical compliance checks against operators (`>=`, `<=`, `>`, `<`, `range`). Returns pass/fail status for each check. Called as a tool handler in `llm+tool` steps. |

#### `src/lib/agent/pipeline/executors/llm-executor.ts`
| Function | Description |
|----------|-------------|
| `executeLlmStep(step, ctx, previousError?)` | Runs a plain LLM step. Builds system prompt from skill + context summary + citation guide, calls `streamText()`, collects streamed tokens, stores output in `ctx.steps`. |
| `executeLlmToolStep(step, ctx, previousError?)` | Runs an LLM step with tool calling. Loads skill scripts, registers tools (compliance-check or generic scripts), calls `streamText()` with tools, processes `onStepFinish` to build `CheckResult[]` from tool outputs, validates tools were actually called. |
| `storeOutput(ctx, stepNumber, text)` | Parses JSON if text starts with `{` or `[`, otherwise stores as string. Calls `ctx.steps.write()`. |
| `extractRegulation(result)` | Extracts regulation code from a tool result record (defaults to `"R48"`). |
| `findCitationRef(ctx, result)` | Looks up citation ID from `ctx.palette.getCitationPalette()` by regulation + clause number. Falls back to regulation-only match, then `"R48.0"`. |
| `buildDomainSchemaGuide(checks)` | Builds a schema guide string from `ParsedCheck[]` for LLM prompting. Lists each field with type, constraint, clause, dependency, notes. |
| `buildContextSummary(ctx)` | Builds a composite context string for LLM prompts: file summary, latest step output, citation summary, check results, domain schema guide, source summary, previous turns. |
| `buildCitationGuide(ctx)` | Builds citation format instructions for the LLM: how to use `[R48.5.11]` and `[SN]` markers, available markers list, chunk reference instructions. |

#### `src/lib/agent/pipeline/phases/init-phase.ts`
| Function | Description |
|----------|-------------|
| `initPhase(skillName, sessionId, message)` | Phase 1: generates correlation ID, loads skill, creates/gets session, adds user message, prunes old sessions, creates `PipelineContext`, loads previous turns from DB. Returns `{ctx, correlationId}`. |

#### `src/lib/agent/pipeline/phases/input-phase.ts`
| Function | Description |
|----------|-------------|
| `inputPhase(ctx, params)` | Phase 2: if files present, extracts each via `extractFileContent()`, adds to `ctx.files`, persists combined content and chunks to DB. If no files, restores from saved chunks in DB. |

#### `src/lib/agent/pipeline/phases/execute-phase.ts`
| Function | Description |
|----------|-------------|
| `parseStepsPhase(ctx)` | Phase 3a: calls `parseSteps(ctx.skill.skillmd)` to extract executable steps from SKILL.md. Returns `ParsedStep[]`. |

#### `src/lib/agent/pipeline/phases/enforce-checks.ts`
| Function | Description |
|----------|-------------|
| `enforceChecks(ctx)` | Phase 3b: verifies every check defined in `## Checks` has a `CheckResult`. For missing checks, attempts regex extraction from file text; if found → PASS, if not → FAIL ("not assessed"). |

#### `src/lib/agent/pipeline/phases/report-phase.ts`
| Function | Description |
|----------|-------------|
| `reportPhase(ctx, steps, maxStepNum)` | Phase 4: assembles report from step outputs and check results. Stores sections in `ctx.report`, then scans flat content for `[R...]`/`[S...]` markers to backfill missing citations. |

#### `src/lib/agent/pipeline/phases/finalize-phase.ts`
| Function | Description |
|----------|-------------|
| `finalizePhase(ctx, steps, sessionId)` | Phase 5: computes verdict, confidence, runs post-validation, builds response data (content, reasoning, citations, sections, toolCalls, claims, confidence), validates with `AgentResponseSchema`, persists to DB. Returns `{response, validationErrors, confidence}`. |
| `formatContent(ctx, steps)` | Formats report sections as markdown tables, or falls back to last LLM step output, or "Assessment not available." |
| `computeObjectiveConfidence(ctx)` | Computes confidence score: base = 100 - OCR penalty - PDF penalty, multiplied by LLM confidence multiplier. Returns `{score, ocrConfidence, dataCompleteness, llmMultiplier, llmReasoning, needsExpert}`. |
| `buildReasoningSteps(ctx, steps)` | Builds structured reasoning steps array from step outputs: `{stepNumber, title, body}[]`. |
| `buildReasoningFromSteps(ctx, steps)` | Builds a text summary of all step outputs for the reasoning field. |

#### `src/lib/agent/pipeline/slices/check-store.ts`
| Function | Description |
|----------|-------------|
| `CheckStore` (class) | Manages check results, claims, and compiled citations. |
| `.addCheck(result)` | Add a single `CheckResult`. |
| `.addResults(results)` | Add multiple `CheckResult`s. |
| `.getResults()` | Get all check results (read-only). |
| `.addClaims(claims)` | Set claims array. |
| `.getClaims()` | Get claims (read-only). |
| `.getCitations()` | Get compiled regulation citations (read-only). |
| `.getSourceCitations()` | Get compiled source citations (read-only). |
| `.compileCitations(citationPalette, sourcePalette)` | Builds `Citation[]` and `SourceCitation[]` from check results + palettes by lookup. Deduplicates and sorts. |
| `.buildCitationsFromClaims(citationPalette, sourcePalette)` | Builds citations from structured claims (Layer 5). Merges with existing entries. Filters source chunks by referenced chunk IDs. |
| `.supplementFromContent(content, citationPalette, sourcePalette)` | Scans report content for `[R...]` and `[S...]` markers and backfills any missing citation entries. |
| `.computeVerdict()` | Returns `"FAIL"` if any check result has `verdict === "FAIL"`, else `"PASS"`. |
| `.failureCount` (getter) | Count of check results with `verdict === "FAIL"`. |

#### `src/lib/agent/pipeline/slices/step-memory.ts`
| Function | Description |
|----------|-------------|
| `StepMemory` (class) | In-memory store for step outputs and arbitrary raw data. |
| `.write(stepNumber, value)` | Store output for a numbered step. |
| `.read(stepNumber)` | Read output for a numbered step. |
| `.latest()` | Get the most recent numbered step output (highest step number). |
| `.getRaw(key)` | Read arbitrary data by string key. |
| `.setRaw(key, value)` | Write arbitrary data by string key. |
| `.entries()` | Get a copy of all stored entries as a record. |

#### `src/lib/agent/pipeline/slices/file-registry.ts`
| Function | Description |
|----------|-------------|
| `FileRegistry` (class) | Manages uploaded files within the pipeline context. |
| `.addFile(file)` | Add an uploaded file to the registry. |
| `.getFiles()` | Get all uploaded files (read-only). |
| `.hasFiles()` | Check if any files have been uploaded. |
| `.getSourcePalette()` | Convert files to `SourcePaletteEntry[]` format (with numeric IDs and key excerpts). |
| `.buildContextSummary()` | Build an LLM context string showing uploaded files with chunk annotations (e.g., `[S1.c3] text`). |
| `.averageOcrConfidence()` | Compute average OCR confidence across all files (defaults to 100 if no OCR data). |

#### `src/lib/agent/pipeline/slices/palette-store.ts`
| Function | Description |
|----------|-------------|
| `PaletteStore` (class) | Manages loaded regulation references and citation palette. |
| `.loadReferences(refs)` | Load regulation reference texts. |
| `.getReferences()` | Get loaded references (read-only). |
| `.loadCitationPalette(entries)` | Load citation palette entries. |
| `.getCitationPalette()` | Get citation palette (read-only). |
| `.findCitation(ref)` | Lookup a single citation palette entry by ID. |
| `.formatContextSummary()` | Format citations as an LLM context string (e.g., `[R48.5.11] R48 §5.11 — text...`). |
| `.formatSourceSummary(sourcePalette)` | Format source files as an LLM context string (e.g., `[S1] filename`). |

#### `src/lib/agent/pipeline/slices/report-assembler.ts`
| Function | Description |
|----------|-------------|
| `ReportAssembler` (class) | Assembles and stores report sections and verdict. |
| `.setContent(sections)` | Set report sections. Values can be strings or nested objects (rendered as tables). |
| `.getContent()` | Get formatted report content as markdown. |
| `.getAllContentFlat()` | Get all content joined as a single flat string (for citation scanning). |
| `.getSections()` | Get raw sections record or null. |
| `.getSection(id)` | Get a single section by ID. |
| `.setVerdict(v)` | Set PASS/FAIL verdict. |
| `.getVerdict()` | Get verdict or null. |

#### `src/lib/agent/pipeline/errors.ts`
| Function | Description |
|----------|-------------|
| `PipelineError` (class) | Base pipeline error with `code`, `details`, `correlationId`. Extends `Error`. |
| `StepFailedError` (class) | Extends `PipelineError` with `stepNumber` and `stepType`. |
| `SkillLoadError` (class) | Extends `PipelineError` with `skillName`. |
| `generateCorrelationId()` | Generates a unique correlation ID: `corr-{timestamp}-{base36-counter}`. |
| `formatPipelineError(err, fallbackCorrelationId?)` | Formats `PipelineError` with code and correlation ID, or falls back to generic error message. |

#### `src/lib/agent/pipeline/logger.ts`
| Function | Description |
|----------|-------------|
| `logPipeline(msg)` | Writes timestamped log line to stderr and appends to `data/pipeline-debug.log`. |
| `truncate(text, max)` | Truncates string to first N chars with ellipsis indicator. |
| `logInfo(msg)` | Writes info line to stderr with `[clausr]` prefix. |
| `logError(tag, err)` | Writes error line to stderr with `[clausr]` prefix and error detail. |

#### `src/lib/agent/pipeline/post-validate.ts`
| Function | Description |
|----------|-------------|
| `postValidate(ctx, steps?)` | Runs post-execution validation: step completeness, claim citations against palettes, chunk validation, citation/source markers in content vs compiled citations, verdict consistency. Returns `ValidationError[]`. |
| `validateClaimChunks(ctx)` | Validates that each claim's `chunkRef` points to an actual chunk and that claim text matches chunk content (~25% word overlap threshold). Returns `ValidationError[]`. |

#### `src/lib/agent/pipeline/clause-texts.ts`
| Function | Description |
|----------|-------------|
| `buildClauseTextsFromPalette(palette)` | Builds a map of `"regulation.clause"` → clause text from citation palette entries. Used for displaying regulation clause text in the response. |

#### `src/lib/agent/pipeline/phases/types.ts`
| Function | Description |
|----------|-------------|
| `PipelineEvent` (type) | Discriminated union of all pipeline events: `status`, `token`, `tool-result`, `done`, `error`. |

---

### SEGMENT 4 — Output Layer

#### `src/lib/export-docx.ts`
| Function | Description |
|----------|-------------|
| `generateDocx(response, template?, skillName?)` | **Main entry point.** Tries template-filling first; falls back to building a `.docx` from scratch using the `docx` library. Returns `Promise<Blob>`. |
| `fillTemplateDocx(response, template, skillName)` | Fetches the skill's original `.docx` template via API, unzips it, replaces `{placeholders}` in the XML, re-zips. Returns `Blob` or `null` on failure. |
| `buildPlaceholderMap(response, template)` | Maps `{placeholder-name}` to values from `response.sections`. Primary: ID-based matching by section/field. Fallback: flattens sections to dot-path keys (e.g., `{vehicle.make}` → `sections["vehicle"]["make"]`). |
| `flattenObject(obj, prefix?)` | Recursively flattens nested objects to dot-path keys. |
| `normalizeConsecutiveRuns(xml)` | Merges consecutive `<w:r>` XML runs that Word splits across runs, reuniting split placeholders. |
| `escapeXml(s)` | Escapes `&`, `<`, `>`, `"` for safe XML insertion. |
| `stripMarkdown(md)` | Removes markdown syntax characters for plain-text placeholder values. |
| `buildFallbackDocx(response, template?)` | Builds a `.docx` from scratch using the `docx` library. Creates title, metadata (verdict/round/session), content lines (with heading detection), and citation references. |

---

## Total Function Count: 100+

| Segment | Files | Functions |
|---------|-------|-----------|
| **1. Knowledge** | 7 | ~20 |
| **2. Input** | 7 | ~30 |
| **3. Pipeline** | 15 | ~45 |
| **4. Output** | 1 | ~8 |
| **Total** | **30** | **~103** |
