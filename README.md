# Clausr — AI Compliance Inspector

AI-powered regulatory compliance assessment with **5-layer citation enforcement** and **chunk-level source traceability**. Upload vehicle specs and source documents; the agent checks every value against regulation text with citations inline.

## Architecture Highlights

### 5-Layer Citation Enforcement

Regulation citations are **structurally guaranteed**, not probabilistically prompted:

| Layer | Mechanism |
|-------|-----------|
| 1. Prompting | LLM instructed to use `[R48.6.2]` markers |
| 2. Deterministic | Non-template content built from check results with citation markers inline |
| 3. Supplementation | Scan LLM output, backfill citations from the regulation palette |
| 4. Post-validation | Regex + claims-based mismatch detection across report sections |
| 5. Structured output | LLM outputs `claims[]` array — backend validates & builds citations from it |

### Chunk-Level Source Traceability

Source citations point to **specific text chunks** within documents. Clicking a `[S1]` badge highlights the exact source region on the original image or PDF page:

- **OCR** — Tesseract.js with per-word bounding boxes, grouped into line-level chunks
- **PDF** — pdfjs-dist extracts position data from transform matrices; pdf-parse fallback
- **DOCX** — mammoth converts to HTML, paragraphs become chunks
- **Highlight rendering** — `object-fit: contain` aware scaling overlays on image thumbnails

### LLM Confidence Scoring

Binary PASS/FAIL is backed by a 0–100% confidence score:

```
BASE = 100% − OCR penalty (max 30%) − data completeness penalty (max 30%) − PDF quality penalty
FINAL = BASE × LLM multiplier (0.5–1.0)
```

4 color stops: dark green ≥99%, green ≥80%, amber ≥50%, red <50% (defers to expert).

### Skill Pipeline

Skills are file-based domain definitions. Each skill has:
- `SKILL.md` — Agent role, execution flow table, template definition
- `references.json` — Regulation clause text indexed by `[R48.5.11]` ID
- Optional scripts for custom checks

**Built-in skills**: EU VWTA Emissions, EU VWTA Lighting, UN R13 Braking.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript (strict) |
| UI | Tailwind CSS v4, shadcn/ui, @base-ui/react |
| AI SDK | Vercel AI SDK (`streamText` with tool use) |
| LLM | DeepSeek V4 (OpenAI-compatible protocol) |
| Database | SQLite via `better-sqlite3` |
| OCR | Tesseract.js v7 |
| PDF | pdfjs-dist + pdf-parse |
| DOCX | mammoth |
| Validation | Zod (runtime schema enforcement) |

## Quick Start

**Prerequisites**: Node.js ≥24, npm ≥10

```bash
npm install
```

Create `.env.local`:
```
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-your-key-here
LLM_MODEL=deepseek-v4-flash
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Adding a Skill

Create a new directory under `skills/<skill-id>/`:

```
skills/your-domain/
├── SKILL.md          # Role, execution flow table, template
└── references.json   # {"R1.1": "Clause text...", ...}
```

`SKILL.md` format:
- **§1 Agent Profile** — What the agent is and does
- **§2 Execution Flow** — Markdown table: `| # | Step | Executor |`
- **§3 Report Template** — Sections: fields, table, markdown, verdict
- **§4 References** — Citation palette mappings

See `skills/eu-vwta-lighting/` for a complete example.

## Project Structure

```
src/
  app/api/           # REST + SSE streaming endpoints
  components/        # React components (panels, drawers, badges, chat)
  lib/agent/         # Core: pipeline, extractors, schemas, LLM factory
skills/              # Skill definitions (3 built-in)
data/                # SQLite database (runtime, gitignored)
```

## License

MIT — see [LICENSE](LICENSE).
