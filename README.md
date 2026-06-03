# clausr.ai

AI-powered regulatory compliance assessment. Upload vehicle specs and source documents; the agent checks every value against regulation text with inline citations back to specific document chunks.

## What It Does

1. **Upload** a vehicle specification document (PDF, DOCX, or images)
2. **Select** a regulatory skill (e.g., GDPR)
3. **Chat** with the agent about the document — it extracts values and checks them against regulation clauses
4. **Review** the assessment report with PASS/FAIL verdicts, confidence scores, and clickable citations

## Architecture

### Pipeline

```
User Message
    → Orchestrator loads skill + regulation summaries + file chunks
    → Generates one LLM+tool step per check field
    → Streams tokens back via SSE
    → Evaluation layer computes confidence
    → Finalize phase builds response with citations
```

Each turn:
- Restores previous context from SQLite (`session_setup` table)
- Loads regulation summaries into the citation palette
- Searches uploaded file chunks via SQLite FTS5
- Executes one `llm+tool` step per check (numerical checks get a `compliance-check` tool)
- Compiles citations from check results + palette entries
- Builds the response with HTML citation badges

### Citation Safety Nets

Citations are **requested from the LLM and validated**, not structurally guaranteed:

1. **Prompted** — System prompt instructs the LLM to include `[R48.6.2]` regulation references and `[S1.c1]` source chunk IDs in its JSON output
2. **Backfilled** — If the LLM omits `citationRef` or `sourceCitation`, the pipeline falls back to the check's clause or available file chunks
3. **Validated** — A validation layer checks that cited regulation IDs exist in the palette and that claim text roughly matches source chunk content (word overlap heuristic)

The response is still LLM-generated. These are safety nets, not deterministic guarantees.

### Chunk-Level Source Traceability

Source citations point to specific text chunks within documents. Clicking a `[S1]` badge highlights the exact source region on the original image or PDF page:

- **OCR** — Tesseract.js with per-word bounding boxes, grouped into line-level chunks
- **PDF** — pdfjs-dist extracts position data from transform matrices; pdf-parse fallback for text extraction
- **DOCX** — mammoth converts to HTML, paragraphs become chunks
- **Highlight rendering** — `object-fit: contain` aware scaling overlays on image thumbnails

### Confidence Scoring

Binary PASS/FAIL is backed by a 0–100% confidence score:

```
BASE = 100% − OCR penalty (max 30%) − validation penalty (n×5% per error)
FINAL = BASE × LLM multiplier (0.5–1.0)
```

Color stops: dark green ≥99%, green ≥80%, amber ≥50%, red <50%.

### Skills

Skills are file-based domain definitions under `skills/<skill-id>/`:

- `SKILL.md` — Agent role, `## Checks` block with per-field constraints, optional template definition
- `references.json` — Regulation clause text indexed by `[R48.5.11]` ID
- `assets/template.docx` — Optional Word template for export
- `scripts/` — Optional Python scripts for custom checks

**Built-in skills**: GDPR.

`SKILL.md` format:
- **Frontmatter** — `title`, `description`, `domain`
- **## Checks** — Numbered checks with `type`, `description`, `clause`, `constraint`, `attention`
- **Template sections** — `fields`, `table`, `markdown`, `verdict`

See `SKILL-SPEC.md` for the full specification and `skills/gdpr/` for a complete example.

### Prompt Versioning

LLM prompts are extracted from inline code into dedicated files under `src/lib/agent/pipeline/prompts/`:
- `system.ts` — System prompt builder with retry context
- `user.ts` — User message builder with file chunks and revision support

This makes prompts versionable, reviewable, and testable independently.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript (strict) |
| UI | Tailwind CSS v4, shadcn/ui, @base-ui/react |
| AI SDK | Vercel AI SDK (`streamText` with tool use) |
| LLM | DeepSeek V4 (OpenAI-compatible protocol), OpenAI, Anthropic |
| Database | SQLite via `better-sqlite3` with FTS5 for chunk search |
| OCR | Tesseract.js v7 |
| PDF | pdfjs-dist + pdf-parse |
| DOCX | mammoth |
| Validation | Zod (runtime schema enforcement) |

## Quick Start

**Prerequisites**: Node.js ≥24, pnpm ≥10

```bash
pnpm install
```

Copy `.env.example` to `.env.local` and add your API key:

```
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-your-key-here
LLM_MODEL=deepseek-v4-flash
```

```bash
pnpm dev      # Start dev server at http://localhost:3000
pnpm test     # Run tests
pnpm build    # Production build
```

## Project Structure

```
src/
  app/api/           # REST + SSE streaming endpoints
  components/        # React components (panels, drawers, badges, chat)
  lib/agent/         # Core agent logic
    loading/         # Skill parser, phase loaders
    pipeline/        # Orchestrator, executors, prompts
    evaluation/      # Confidence scoring, validation
    present/         # Response formatting, finalize phase
    shared/          # Schemas, types, memory (SQLite repository)
    __tests__/       # Integration tests (139 tests)
skills/              # Skill definitions (1 built-in)
data/                # SQLite database + uploads (runtime, not committed)
```

## License

MIT — see [LICENSE](LICENSE).
