# Plan: Open-Source v1 Prep

## Context

Open-source Clausr.ai v1 for **marketing/showcasing**, not for self-serve deployment. The repo should communicate technical depth, clean architecture, and attention to detail.

Confidence scoring is already implemented (schemas, pipeline, frontend, storage).

---

## Phase 1: Must-Do

### 1.1 Add LICENSE file
MIT at repo root. Table stakes for any public repo.

### 1.2 Rotate DeepSeek API key + create `.env.example`
- The key in `.env.local` has been in debug logs — rotate it with DeepSeek before going public.
- Create `.env.example`:
  ```
  LLM_PROVIDER=deepseek
  LLM_API_KEY=your-api-key-here
  LLM_MODEL=deepseek-v4-flash
  ```
- Delete `data/debug.log` and `data/pipeline-debug.log` (contain real file content, LLM responses).

### 1.3 Expand README
Current: 24 lines. Expand to:
- What it does: AI compliance inspector with 5-layer citation enforcement
- Architecture highlights: 5-layer citation system, chunk-level source tracking, skill pipeline, confidence scoring
- Tech stack: Next.js 16, TypeScript, SQLite, Tesseract.js, Vercel AI SDK
- Quick start: prerequisites, `npm install`, `.env.local` setup, `npm run dev`
- Skill system: how to add a compliance domain via `skills/<name>/SKILL.md`
- Remove the broken `../inspectorAI/mighty-mapping-sundae.md` reference (line 41)

### 1.4 Remove binary/slop files from repo
- `eng.traineddata` (5.2MB) — add to `.gitignore`, document in README
- `public/mockup.html` (53KB) — delete
- Verify `data/` directory is fully gitignored

### 1.5 Clean dead code
- [source-citation-card.tsx](src/components/source-citation-card.tsx): remove unused `scaleBox` (lines 63-70), unused `useEffect` import (line 3)
- [document-panel.tsx](src/components/document-panel.tsx): extract duplicated chunk-finding logic (lines 303-325 and 617-640) into `findHighlightChunk()` helper

### 1.6 Fix type mismatches
- [repository.ts](src/lib/agent/memory/repository.ts): add `chunkRef?: string` to claims return type (line 167), add `chunks?: SourceChunk[]` to sourceCitations return type (line 163)

---

## Phase 2: Nice-to-Have

### 2.1 Replace console.log with structured logger
- 30+ instances throughout API routes and components.
- Replace with the existing `logPipeline` from [logger.ts](src/lib/agent/pipeline/logger.ts) or a shared utility.
- Fix [chat-view.tsx:173](src/components/chat-view.tsx#L173) which logs `dataUrl.slice(0, 40)`.

### 2.2 Add .nvmrc
Pin Node.js version.

### 2.3 Clean demo directory
- `demo/` has stale mock data. Either remove or add a README.md marking it as dev-only.

---

## Verification

1. `npm run build && npm run test` pass clean
2. `git ls-files` shows no binary blobs, debug logs, or mockup files
3. README renders cleanly on GitHub with all sections populated
4. `.env.example` is clear and self-documenting
5. No `console.log` left in non-debug code paths
