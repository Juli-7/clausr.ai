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
│  (Future: skill management APIs)                                                    │
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
│  └──────────────────────┘ │                                                          │
│                            │  user-info/extractors/pdf-extract.ts                     │
│                            ├──►┌──────────────────────┐                              │
│                            │   │ extractPdfText()     │                              │
│                            │   │   Path A: pdfjs-dist │                              │
│                            │   │   Path B: OCR fallback│                              │
│                            │   │ itemToWordBox()      │                              │
│                            │   │ linesToChunks()      │                              │
│                            │   └──────────────────────┘                              │
│                            │  user-info/extractors/docx-extract.ts                    │
│                            └──►┌──────────────────────┐                              │
│                                │ extractDocxText()    │                              │
│                                │   → mammoth + strip  │                              │
│                                └──────────────────────┘                              │
│                                                                                      │
│  PROVIDES: ExtractionResult, TextChunk                                                │
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
│  └──────────────────────┘         │ deriveDomainSchema(checks)           │           │
│                                   │ findCheck(fieldPath, checks)         │           │
│  loading/extractors/              │ groupFieldsByPrefix(checks)          │           │
│  skill-generator.ts               │ fieldTypeToZod(check)                │           │
│  ┌──────────────────────┐         └──────────────────────────────────────┘           │
│  │ generateSkill(msg,   │                                                           │
│  │   fileTexts)         │         loading/phases/init-phase.ts                       │
│  │   → LLM generates    │         ┌────────────────────────────────────────┐         │
│  │     SKILL.md         │         │ initPhase(skillName, sessionId, msg)   │         │
│  └──────────────────────┘         │  → loadSkill, create context, restore  │         │
│                                   └────────────────────────────────────────┘         │
│  loading/phases/input-phase.ts    loading/phases/skill-gen-phase.ts                   │
│  ┌────────────────────────┐       ┌──────────────────────────────────────┐           │
│  │ inputPhase(ctx, params)│       │ skillGenPhase(ctx, message)          │           │
│  │  → extract files /     │       │  → generateSkill if no skill exists  │           │
│  │    restore from DB     │       └──────────────────────────────────────┘           │
│  └────────────────────────┘                                                           │
│                                                                                      │
│  loading/phases/revision-phase.ts                                                    │
│  ┌────────────────────────────────────────────────────────────┐                      │
│  │ identifyRevisionTarget(ctx, userMessage)                    │                      │
│  │  → LLM determines which step to redo on follow-up           │                      │
│  └────────────────────────────────────────────────────────────┘                      │
│                                                                                      │
│  PROVIDES: SkillLoader, ParsedCheck[], loaded PipelineContext                          │
│  CONSIDERS FROM: Knowledge (regulation refs), User-Info (chunks)                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 4: PIPELINE                                         │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  orchestrator-v2.ts (ENTRY POINT — async generator, yields PipelineEvent)   │    │
│  │  orchestratePipeline(message, skillName, sessionId, files?)                  │    │
│  │    ├─► initPhase()                — LOADING: skill load, session, context    │    │
│  │    ├─► inputPhase()               — LOADING: file extraction / restore       │    │
│  │    ├─► skillGenPhase()            — LOADING: create skill if none            │    │
│  │    ├─► loadReferences()           — load regulation data into palette        │    │
│  │    ├─► generateStepsFromChecks()  — LOADING: build step list                 │    │
│  │    ├─► identifyRevisionTarget()   — LOADING: which step to redo              │    │
│  │    ├─► [loop] executeStep()       — execute each step (llm+tool)            │    │
│  │    ├─► enforceChecks()            — EVALUATION: gap-fill missing checks     │    │
│  │    └─► finalizePhase()            — PRESENT: evaluate + assemble + persist  │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│         │               │              │               │              │              │
│         ▼               ▼              ▼               ▼              ▼              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ step-executor│ │ builtins.ts │ │ errors.ts   │ │ logger.ts   │ │ types.ts    │   │
│  │ executeStep()│ │ loadRefer-  │ │ PipelineErr │ │ logPipeline │ │ PipelineEv- │   │
│  │ tryExecute() │ │ ences()     │ │ format...   │ │ truncate()  │ │ ent (type)  │   │
│  └──────┬──────┘ │ .execute-   │ └─────────────┘ └─────────────┘ └─────────────┘   │
│         │        │  Compliance │                                                         │
│         │        │  Check()    │                                                         │
│         ▼        └─────────────┘                                                         │
│  ┌────────────────────────────────────────────────────────────────────────────────┐    │
│  │ executors/llm-executor.ts                                                     │    │
│  │ executeLlmToolStep(step, ctx, previousError?) — only executor, always llm+tool │    │
│  │ buildDomainSchemaGuide(checks), buildContextSummary(ctx), buildCitationGuide() │    │
│  └────────────────────────────────────────────────────────────────────────────────┘    │
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
│  └────────────────────────────┘              │                                         │
│                                               ▼                                         │
│  evaluation/summary.ts          evaluation/confidence.ts                               │
│  ┌──────────────────────┐      ┌──────────────────────────────────────┐              │
│  │ buildFindings(checks)│      │ computeConfidence(input)             │              │
│  │  → per-check map      │      │  → OCR penalty + PDF + LLM mult.   │              │
│  └──────────────────────┘      └──────────────────────────────────────┘              │
│                                                                                      │
│  evaluation/validate.ts                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐           │
│  │ validate({claims, citations, sourceCitations, ...})                   │           │
│  │  → citation/chunk consistency, verdict alignment, claim validation   │           │
│  └──────────────────────────────────────────────────────────────────────┘           │
│                                                                                      │
│  PROVIDES: EvaluationResult {confidence, findings, validationErrors}                  │
│  CONSIDERS FROM: Pipeline (CheckStore, PipelineContext), Shared (slices)               │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SEGMENT 6: PRESENT LAYER                                    │
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
│                                                                                      │
│  PROVIDES: AgentResponse, .docx Blob, document-panel data                             │
│  CONSIDERS FROM: Pipeline (step output), Evaluation (verdict/confidence)               │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SHARED (cross-layer)                                        │
│                                                                                      │
│  shared/slices/                     shared/memory/                                    │
│  ┌────────────────────────┐        ┌─────────────────────────────┐                   │
│  │ CheckStore             │        │ database.ts                  │                   │
│  │ StepMemory             │        │  getDb(), getSetting()       │                   │
│  │ FileRegistry           │        │  setSetting()                │                   │
│  │ PaletteStore           │        ├──────────────────────────────┤                   │
│  │ ReportAssembler        │        │ repository.ts                │                   │
│  └────────────────────────┘        │  getOrCreateSession()        │                   │
│                                    │  addUserMessage()            │                   │
│  shared/schemas.ts                 │  addAssistantResponse()      │                   │
│  ┌────────────────────────┐        │  saveFileContents/Chunks()   │                   │
│  │ Zod schemas:            │        │  getConversationHistory()    │                   │
│  │ ChatRequestSchema      │        │  getAllSessions()            │                   │
│  │ AgentResponseSchema    │        │  deleteSession()             │                   │
│  │ CitationSchema         │        │  getContextSnapshots()       │                   │
│  │ ConfidenceSchema       │        │  toggleStar()                │                   │
│  │ ComplianceCheckSchema  │        ├──────────────────────────────┤                   │
│  │ ...                    │        │ cleanup.ts                   │                   │
│  └────────────────────────┘        │  pruneOldSessions()          │                   │
│                                    └──────────────────────────────┘                   │
│  shared/types.ts                    shared/turn-types.ts                               │
│  shared/template-types.ts                                                             │
│                                                                                      │
│  CONSUMED BY: Loading, Pipeline, Evaluation, Present + external components            │
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
       │  LOADING/PIPELINE — Phase 3: LOAD REFERENCES + GENERATE STEPS
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
       │    └─ Steps 1..N: llm+tool (one per check field)
       │
       ├─ identifyRevisionTarget(ctx, userMessage)  ◄── loading/phases/revision-phase.ts
       │    (only on follow-up turns — LLM decides which step to redo)
       │
       ├─ ┌─ for each step in steps:
       │  │    │
       │  │    ├─ executeStep(step, ctx, maxRetries=1)
       │  │    │    └─ tryExecute(step, ctx, previousError)  [retry loop]
       │  │    │         └─ [llm+tool] ──► executeLlmToolStep(step, ctx, previousError)
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
       │  │    ├─ yield {type: "token", text, stepNumber}  for each streamedToken
       │  │    ├─ yield {type: "tool-result", stepNumber, results}  if toolResults
       │  │    ├─ ctx.steps.read(step.number)  → log output
       │  │    │
       │  │    ├─ if ctx.checks.getResults().length > 0:
       │  │    │    └─ ctx.checks.compileCitations(citationPalette, sourcePalette)
       │  │    │         └─ lookup + deduplicate + sort
       │  │    │
       │  │    └─ saveContextSnapshot({sessionId, turnNumber, stepNumber, ...})
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
       │    └─ for each missing check:
       │         ├─ regex-extract value from file text
       │         ├─ if found → CheckResult{name, value, verdict: "PASS"}
       │         └─ if not found → CheckResult{finding: "not assessed", verdict: "FAIL"}
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
            │    │    └─ map per check: "field → finding → VERDICT [citation]"
            │    ├─ computeConfidence(input)       ◄── evaluation/confidence.ts
            │    │    ├─ avgOcr = ctx.files.averageOcrConfidence()
            │    │    ├─ ocrPenalty = (1 - avgOcr/100) * 30
            │    │    ├─ pdfPenalty = 5 or 10
            │    │    ├─ baseScore = 100 - ocrPenalty - pdfPenalty
            │    │    ├─ llmMultiplier from step outputs
            │    │    └─ finalScore = baseScore * llmMultiplier
            │    │         → {score, ocrConfidence, llmMultiplier, needsExpert}
            │    └─ validate({claims, citations, sourceCitations, ...})
            │         ◄── evaluation/validate.ts
            │         ├─ validateClaimChunks(claims, sourcePalette)
            │         │    └─ verify chunkRef exists, ~25% word overlap
            │         ├─ citation/source marker consistency
            │         └─ verdict consistency
            │
            ├─ verdict = ctx.checks.computeVerdict()  → PASS | FAIL
            ├─ ctx.report.setVerdict(verdict)
            │
            ├─ Build responseData:
            │    ├─ content = formatContent(ctx, steps)
            │    │    └─ sections as markdown tables OR last LLM step output
            │    ├─ reasoning = buildReasoningFromSteps(ctx, steps)
            │    ├─ citations = ctx.checks.getCitations()
            │    ├─ sourceCitations = ctx.checks.getSourceCitations()
            │    ├─ sections = ctx.report.getSections()
            │    ├─ toolCalls = ctx.steps.getRaw("toolCalls")
            │    ├─ reasoningSteps = buildReasoningSteps(ctx, steps)
            │    ├─ claims = ctx.checks.getClaims()
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
| **3. Loading** | Pipeline | `initPhase()`, `inputPhase()`, `skillGenPhase()`, `identifyRevisionTarget()`, `SkillLoader`, `ParsedCheck[]` | Knowledge, User-Info, Shared |
| **4. Pipeline** | Evaluation, Present | `orchestratePipeline()`, `StepResult`, `PipelineEvent` (streaming) | Loading, Shared |
| **5. Evaluation** | Present | `evaluate()`, `EvaluationResult` | Pipeline (CheckStore), Shared |
| **6. Present** | External | `finalizePhase()` → `AgentResponse`, `generateDocx()` → `.docx Blob` | Pipeline, Evaluation, Shared |
| **Shared** | All layers | `CheckStore`, `StepMemory`, `FileRegistry`, `PaletteStore`, `ReportAssembler`, `schemas.ts`, `memory/` | — |

### Key Decoupling Points

1. **Knowledge ↔ Pipeline**: `PipelineContext.skill` carries loaded skill metadata. `IRegulationApi` is swappable (mock ↔ real).

2. **User-Info ↔ Loading**: `Loading` calls `extractFileContent()` and receives `ExtractionResult`. Loading never touches file parsing.

3. **Loading ↔ Pipeline**: Loading delivers a fully initialized `PipelineContext` with all 5 slices. Pipeline never loads skills or files.

4. **Pipeline internal**: 5 shared slices (`CheckStore`, `StepMemory`, `FileRegistry`, `PaletteStore`, `ReportAssembler`) hold all state. Pipeline orchestrator coordinates execution loop.

5. **Pipeline ↔ Evaluation ↔ Present**: Pipeline runs steps and fills CheckStore. Present calls Evaluation to get confidence + findings + validation, then assembles `AgentResponse`.

6. **Shared**: All 5 slices plus `memory/` and `schemas.ts` live in `shared/` — consumed by every layer but owned by none.

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
| `deriveDomainSchema(checks)` | Builds nested Zod object schema from field paths (e.g., `"vehicle.make"` → `{ vehicle: z.object({ make: ... }) }`). |
| `findCheck(fieldPath, checks)` | Finds a `ParsedCheck` by exact field path match. |
| `parseFieldType(raw)` | Converts type string to `CheckFieldType`. |
| `groupFieldsByPrefix(checks)` | Groups fields by top-level prefix, stripping prefix from field names. |
| `buildNestedShape(fields)` | Builds flat Zod shape from a group of fields. |
| `fieldTypeToZod(check)` | Maps a `ParsedCheck` to a Zod type with optional modifier. |

#### `loading/extractors/skill-generator.ts`
| Function | Description |
|----------|-------------|
| `generateSkill(message, fileTexts)` | Calls LLM to generate a SKILL.md from user request + uploaded file contents. Parses result with `gray-matter`, extracts frontmatter + Checks. Returns `SkillLoader`. |

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
| `identifyRevisionTarget(ctx, userMessage)` | On follow-up turns, calls LLM to determine which step number to redo based on the user's follow-up message. Returns step number or `-1`. |

---

### SEGMENT 4 — Pipeline (`src/lib/agent/pipeline/`)

#### `pipeline/orchestrator-v2.ts`
| Function | Description |
|----------|-------------|
| `orchestratePipeline(message, skillName, sessionId, files?)` | **Top-level entry point.** Async generator: init → input → skill-gen → load-refs → step-gen → revision → step-exec → enforce → finalize. Yields `PipelineEvent` for streaming. |

#### `pipeline/pipeline-context.ts`
| Function | Description |
|----------|-------------|
| `createPipelineContext(name, skillmd, checks, sessionId, cid?)` | Factory. Creates `PipelineContext` with all 5 slices: `CheckStore`, `StepMemory`, `FileRegistry`, `PaletteStore`, `ReportAssembler`. |
| `serializeContext(ctx)` | JSON-serializes context for persistence across turns. |
| `deserializeContext(json, skill, sessionId)` | Parses JSON back into partial `PipelineContext`. |

#### `pipeline/step-executor.ts`
| Function | Description |
|----------|-------------|
| `executeStep(step, ctx, maxRetries?)` | Executes an `llm+tool` step with retry logic. Delegates directly to `executeLlmToolStep`. |
| `tryExecute(step, ctx, previousError)` | Single attempt — always calls `executeLlmToolStep`. |

#### `pipeline/builtins.ts`
| Function | Description |
|----------|-------------|
| `loadReferences(ctx)` | Loads regulation data into palette by extracting IDs from checks, fetching via API. |
| `executeComplianceCheck(input)` | Evaluates numerical checks against operators (`>=`, `<=`, `>`, `<`, `range`). Returns pass/fail. Called as a tool handler. |

#### `pipeline/executors/llm-executor.ts`
| Function | Description |
|----------|-------------|
| `executeLlmToolStep(step, ctx, previousError?)` | Runs an `llm+tool` step. Registers tools (compliance-check, scripts), streams LLM, processes tool results, stores output. |
| `buildDomainSchemaGuide(checks)` | Builds schema guide string from `ParsedCheck[]` for LLM prompts. |
| `buildContextSummary(ctx)` | Builds composite context string: file summary, latest step output, citation summary, check results, domain schema guide, source summary, previous turns. |
| `buildCitationGuide(ctx)` | Builds citation format instructions for LLM (`[R48.5.11]` and `[SN]` markers). |

#### `pipeline/types.ts`
| Type | Description |
|------|-------------|
| `PipelineEvent` | Discriminated union: `status`, `token`, `tool-result`, `done`, `error`. |

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
| `enforceChecks(ctx)` | Gap-fills missing check results via regex extraction from file text. Found → PASS, not found → FAIL "not assessed". |

#### `evaluation/index.ts`
| Function | Description |
|----------|-------------|
| `evaluate(input)` | Main entry. Computes confidence, builds findings, validates consistency. Returns `{confidence, findings, validationErrors}`. |

#### `evaluation/confidence.ts`
| Function | Description |
|----------|-------------|
| `computeConfidence(input)` | Computes score: base 100 − OCR penalty − PDF penalty, multiplied by LLM confidence multiplier. Returns `{score, ocrConfidence, dataCompleteness, llmMultiplier, llmReasoning, needsExpert}`. |

#### `evaluation/summary.ts`
| Function | Description |
|----------|-------------|
| `buildFindings(checkResults)` | Converts check results to findings map: `field → "finding → VERDICT [citation]"`. |

#### `evaluation/validate.ts`
| Function | Description |
|----------|-------------|
| `validate({claims, citations, sourceCitations, ...})` | Validates citation/chunk consistency, marker presence, verdict alignment. Returns `ValidationError[]`. |
| `validateClaimChunks(claims, sourcePalette)` | Validates each claim's chunkRef exists and has ~25% word overlap. Returns `ValidationError[]`. |

#### `evaluation/types.ts`
| Type | Description |
|------|-------------|
| `EvaluationInput` | Input shape: checkResults, citationPalette, sourcePalette, files, steps, skill. |
| `EvaluationResult` | Output shape: confidence, findings, validationErrors. |

---

### SEGMENT 6 — Present Layer (`src/lib/agent/present/`)

#### `present/phases/finalize-phase.ts`
| Function | Description |
|----------|-------------|
| `finalizePhase(ctx, steps, sessionId)` | Runs evaluation (`evaluate()`), computes verdict, builds `AgentResponseData`, validates with `AgentResponseSchema`, persists to DB. Returns `{response, validationErrors, confidence}`. |
| `formatContent(ctx, steps)` | Formats sections as markdown tables or falls back to last LLM step output. |

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

### SHARED — Cross-Layer State & Persistence (`src/lib/agent/shared/`)

#### `shared/slices/check-store.ts`
| Function | Description |
|----------|-------------|
| `CheckStore` (class) | Manages check results, claims, and compiled citations across pipeline + evaluation. |
| `.addCheck(result)` | Add single `CheckResult`. |
| `.addResults(results)` | Add multiple `CheckResult`s. |
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
| `saveContextSnapshot(snapshot)` | INSERT step state snapshot. |
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
| `ChatRequestSchema` | Validates chat payload. |
| `AgentResponseSchema` | Validates full agent response. |
| `CitationSchema` | Regulation citation. |
| `SourceChunkSchema` | Source text chunk. |
| `SourceCitationSchema` | Source file citation. |
| `VerdictSchema` | PASS / FAIL enum. |
| `ClaimSchema` | Claim with citation refs. |
| `ConfidenceSchema` | Confidence score object. |
| `ComplianceCheckSchema` | Compliance check tool input. |
| `ToolCallRecordSchema` | Tool call record. |
| `ReasoningStepSchema` | Reasoning step. |
| `ValidationErrorSchema` | Validation error. |
| `ReferenceMapSchema` | Reference code map. |

---

## Total Function Count

| Segment | Files | Functions |
|---------|-------|-----------|
| **1. Knowledge** | 3 | ~8 |
| **2. User-Info** | 4 | ~8 |
| **3. Loading** | 7 | ~10 |
| **4. Pipeline** | 10 | ~15 |
| **5. Evaluation** | 5 | ~6 |
| **6. Present** | 2 | ~8 |
| **Shared** | 10 | ~35 |
| **Total** | **41** | **~90** |

Plus: `llm/factory.ts`, `evolution/integrator.ts`, `pipeline/executors/script-runner.ts` — utilities not specific to any segment.
