# clausr.ai — Build Plan

## Project Overview

clausr.ai is a compliance assessment platform where users upload evidence, AI evaluates it against regulations, and every finding cites the exact clause. The product's core differentiator is clause-level traceability — not "this regulation applies" but "you fail because of §5.11, and here's the text."

A standalone Next.js + shadcn/ui web app where users chat with an AI agent that answers compliance questions with traceable regulation citations. Every agent response includes numbered citation markers `[1]` mapped to specific regulation clauses. The renderer replaces markers with clickable badges that show the exact clause text on click.

**Stack:** Next.js 16, shadcn/ui, SQLite (better-sqlite3), OpenAI + DeepSeek, gray-matter

**Demo domain:** EU VWTA lighting compliance (UN R48, UN R112)

**Key architectural decisions:**
- Multiple API endpoints: `/api/chat` (SSE streaming), `/api/scripts`, `/api/settings`, `/api/sessions`
- LLM outputs delimited text (`---STEP N---`/`---CONTENT---`/`---DATA---`) parsed by `parse-response.ts`
- Skills use three-level loading (L1 metadata, L2 SKILL.md, L3 references on demand)
- Numerical checks go through scripts/ via function calling (not LLM)
- Evolution uses inline LLM lesson (via `---DATA---` JSON) with rule-based fallback + fuzzy dedup against SKILL.md §7

---

## Product Architecture: Four-Part Segmentation

The product is organized around four concerns, each with a distinct reason to exist:

| # | Part | Role | Value |
|---|------|------|-------|
| 1 | **Capture** | Multi-modal input → structured plain text | Accessibility — users aren't technical, they bring PDFs, images, chat |
| 2 | **Knowledge** | Skills, regulation corpus, memory, evolution | Moat — the only part that compounds over time; accumulated expertise can't be copied |
| 3 | **Reasoning** | LLM pipeline, tool calling, traceability/citations | Magic — the AI + audit trail that impresses and builds trust |
| 4 | **Deliver** | Template parsing, .docx in/out | Usability — intentionally simple; format conversion with no intelligence |

### How They Connect

```
Capture ──► Knowledge ──► Reasoning ──► Deliver
  │            │              │              │
  │      Skills + regs    LLM + tools    Templates
  │      + memories       + citations    + .docx
  │            │              │              │
  │      Compounds         Trust           Dumb
  │      over time        enabler        but reliable
```

- **Knowledge feeds Reasoning**: the skill drives prompt construction, reference loading, tool availability, and execution flow. Reasoning doesn't exist without knowledge.
- **User feeds Capture**: multi-modal evidence enters here, gets normalized to plain text.
- **Capture + Knowledge + Reasoning converge into Deliver**: the LLM produces structured output with citations; Deliver places it into the template format.
- **Traceability is the contract between Reasoning and Deliver**: citations are generated in Reasoning, rendered in Deliver. Reasoning owns the audit trail; Deliver just formats it.

### Why This Segmentation Works

- **Maps to the user journey**: input → expertise → analysis → report
- **Each part has a different "reason to exist"**: accessibility, defensibility, trust, usability
- **Prioritization framework**: any feature should clearly strengthen one of the four, or it's scope creep
- **Knowledge is the foundation layer**: it's the only part that gets *better* while everything else just gets *used*

### Deliver is Intentionally Boring

Deliver stays traditional — .docx parsing and rendering. No intelligence. No LLM dependency. It's format conversion that would work the same way without AI. The LLM owned the thinking; Deliver just places the result where the template says to.

---

## UX Architecture: Three-Panel Layout

### Layout

```
┌──────────┬───────────────────────────────────┬───────────────────────┐
│          │                                   │                       │
│   ⚡     │       COMPLIANCE DOCUMENT         │   REASONING TRACE     │
│  Skills  │       (Middle Panel)              │   (Right Panel)       │
│          │                                   │                       │
│   🕐     │  ┌─────────────────────────┐      │  ┌─────────────────┐  │
│  History │  │ Vehicle Information     │      │  │ Step 1          │  │
│          │  │ Make: Model X           │      │  │ Check light src │  │
│   ⚙️     │  │ Light: LED              │      │  │ → LED found     │  │
│ Settings │  │ Height: 650mm           │      │  │                 │  │
│          │  └─────────────────────────┘      │  │ Step 2          │  │
│          │                                   │  │ R48 §5.11 says  │  │
│          │  ┌─────────────────────────┐      │  │ auto-leveling   │  │
│          │  │ Compliance Assessment   │      │  │ mandatory for   │  │
│          │  │ The vehicle... [1] ...  │      │  │ LED → FAIL      │  │
│          │  │ [R48 §6.1] [R48 §5.11] │      │  │                 │  │
│          │  └─────────────────────────┘      │  │ Step 3          │  │
│          │                                   │  │ Height 650mm    │  │
│          │                                   │  │ is within       │  │
│          │  ┌─────────────────────────┐      │  │ 500-1200mm [2]  │  │
│          │  │ Conclusion: FAIL       │      │  │ → PASS          │  │
│          │  │ [Approve] [Revise]     │      │  │                 │  │
│          │  └─────────────────────────┘      │  │ ┌──────────────┐│  │
│          │                                   │  │ │▶ compliance- ││  │
│          │                                   │  │ │  check.py    ││  │
│          │                                   │  │ │ $ beam cutoff││  │
│          │                                   │  │ │ ✓ 0.42° PASS ││  │
│          │                                   │  │ └──────────────┘│  │
│          │                                   │  │                 │  │
│          │                                   │  │ 📊 Score: 100  │  │
│          │                                   │  │                 │  │
│          │                                   │                       │
├──────────┴───────────────────────────────────┴───────────────────────┤
│  [Review the analysis, request additional checks...]      [Review]    │
└──────────────────────────────────────────────────────────────────────┘
```

### What Each Panel Does

| Panel | Content | Purpose |
|-------|---------|---------|
| **Left sidebar** | Icons for Skills (database table), History, Settings | Navigation — opens slide-out drawers |
| **Top bar** | Skill name, round counter, session ID, Download button | Status at a glance — shows active skill and session state |
| **Middle (Document)** | Rendered template with citation badges inline, conclusion box (PASS/FAIL with Approve/Revise) | The final deliverable — what gets exported, signed, audited. Template-driven layout. |
| **Right (Reasoning)** | Step-by-step LLM reasoning trace, agent score summary at bottom | Shows the process was followed correctly. Each step maps to SKILL.md execution flow. |
| **Bottom bar** | Single text input spanning middle + right | User types once → LLM updates both panels simultaneously |

### How Reasoning Trace Works

The LLM outputs two things:
1. **`content`** — the final document (goes to middle panel, rendered with template)
2. **`reasoning`** — step-by-step trace (goes to right panel, rendered as structured list)

Each reasoning step references the same `[1]`, `[2]` citation markers. The user sees: "Step 2: R48 §5.11 says auto-leveling mandatory for LED [3]" — the [3] badge is clickable in both panels.

### Script Execution Card

When the LLM calls a tool (e.g. `compliance-check.py`), the reasoning panel shows a **CLI-like card** that visually separates deterministic computation from LLM reasoning:

```
┌─────────────────────────────────────┐
│ ▶ Running: compliance-check.py      │
│ ─────────────────────────────────── │
│ $ check_compliance([                │
│   {"name":"Beam cutoff",            │
│    "value":0.42,"limit":0.57,       │
│    "operator":"<=","clause":"5.3"}, │
│   {"name":"Color temp",             │
│    "value":5500,"limit":6000,       │
│    "operator":"<=","clause":"5.5"}  │
│ ])                                  │
│                                     │
│ ✓ Result: 2/2 checks passed         │
└─────────────────────────────────────┘
```

**Design:** Monospace font, dark terminal-like background, "running" animation pulse via CSS. This makes it obvious to the viewer that a **deterministic script** is running, not LLM guesswork. The card updates from "▶ Running..." → "✓ Complete" or "✗ Failed" once the script returns.

At the bottom of the reasoning panel, an **Agent Score Summary** shows the implicit score and trend:
```
📊 Scoring
Implicit  100 (Round 1)
Trend     ↑ Up
```

### Difference Between Q&A and Report

| Aspect | Q&A | Report |
|--------|-----|--------|
| Middle panel | Default answer card (markdown) | User-provided or skill-defined template |
| Right panel | ✅ Same reasoning trace | ✅ Same reasoning trace |
| Citation badges | ✅ Same | ✅ Same |
| Template required | No | Yes (JSON schema defining sections) |

### Skills Database (Split-View Drawer)

The Skills drawer uses a **split layout**: a regulation database table on the left, a detail panel on the right. This reinforces the "professional compliance tool" identity.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚡ Skills Database                                    [+ New] (Mock)  │
├──────────────────────────┬───────────────────────────────────────────┤
│ Search: [__________]     │ EU VWTA Lighting                         │
├──────────┬───────┬───────┤ Standards: [UN R48] [UN R112]            │
│ Name     │ Stds  │ Last  │                                           │
│          │       │ Used  │ Reference Documents (L3 — loaded per §6)  │
├──────────┼───────┼───────│ 📄 un-r48.md     §5.11, §6.1, §6.2      │
│ EU VWTA  │ R48,  │ 2h ago│ 📄 un-r112.md    §5.3, §5.5              │
│ Lighting │ R112  │       │ 📄 common-pitfalls.md  General            │
├──────────┼───────┼───────┤                                           │
│ EU VWTA  │ R83,  │ 3d ago│ Scripts (function calling):               │
│ Emissions│ R154  │       │ ▶ compliance-check.py — Numerical pass/  │
├──────────┼───────┼───────│   fail for beam cutoff, color temp       │
│ UN R13   │ R13   │ 1w ago│                                           │
│ Braking  │       │       │ Template (embedded):                      │
├──────────┴───────┴───────┤ {"sections":[{"id":"vehicle-info",...}]}  │
│ [1-3]  [<] [>]           │                                           │
│                          │ SKILL.md (L2 methodology):                │
│                          │ ---                                       │
│                          │ ## 1. Role Definition                     │
│                          │ ## 2. Execution Flow ...                  │
│                          │                                           │
│                          │ [Use Skill]    [Cancel]                   │
└──────────────────────────┴───────────────────────────────────────────┘
```

**Interaction flow:**
- Click a skill row → right panel shows full detail: standards, triggers, reference documents, scripts, embedded template JSON, SKILL.md content
- Click "Use Skill" → drawer closes, skill name appears in top bar, agent is ready
- Search bar filters the table by name or standard number
- "[+ New]" button shows toast (mock for V1.0)

### Template System

Templates live **within** each skill (in `skills/{name}/assets/template.json`), not as a separate management UI. Each skill has exactly one default template. Q&A uses a built-in default markdown card template.

```json
{
  "sections": [
    { "id": "vehicle-info", "title": "Vehicle Info", "type": "fields", "fields": [...] },
    { "id": "assessment", "title": "Compliance Assessment", "type": "markdown" },
    { "id": "checks", "title": "Detailed Checks", "type": "table", "columns": [...] }
  ]
}
```

The LLM fills each section. The renderer stitches them into a document. For Q&A, a default single-section markdown template is used. No separate template management UI — the skill *is* the template container.

### Conclusion Box

Every assessment ends with a conclusion box at the bottom of the document panel:

```
┌──────────────────────────────────────────────────────────────┐
│  Overall Verdict                                             │
│  ❌ FAIL — Auto-leveling non-compliance                      │
│  LED source requires mandatory auto-leveling per R48 §5.11   │
│                                          [Revise]  [Approve] │
└──────────────────────────────────────────────────────────────┘
```

- Color-coded: red for FAIL, green for PASS
- **Revise** → opens input bar for follow-up feedback, triggers re-run
- **Approve** → triggers evolution classifier (two-stage), then shows a **"Lessons Learned" confirmation dialog**:

```
┌──────────────────────────────────────────────────────────────┐
│  📖 Lessons Learned from this session                        │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  The agent identified a generalizable improvement:          │
│                                                              │
│  "Always check R48 §5.11 for LED sources before             │
│   checking any other requirement"                            │
│                                                              │
│  This will be added to SKILL.md §7 Experience Accumulation.  │
│                                                              │
│  [Confirm & Save]  [Dismiss]                                 │
└──────────────────────────────────────────────────────────────┘
```

Only when the user clicks **Confirm & Save** is the rule actually written to SKILL.md §7 (via `evolution/integrator.ts`). **Dismiss** discards the lesson (but still stores it as memory). This puts a human-in-the-loop before skill auto-evolution, addressing the misclassification risk.

### Inline Comments

Users can select any text in the document panel to add an anchored comment thread:

```
┌──────────────────────────────────────────────────────────────┐
│ Auto-leveling system: Not equipped                           │
│ ──────────────────────────────────────────────────────────── │
│ You — selected "auto-leveling system"                        │
│ Auto-leveling can be retrofitted after type approval?        │
│ ↪ Agent is revising...                                      │
└──────────────────────────────────────────────────────────────┘
```

Anchored to the selected text — visible in context. On submit, the comment is sent back to the LLM as additional context for revision.

### API: Single Chat Endpoint

```typescript
// POST /api/chat
Request:  { message: string, skillName: string, sessionId: string }
Response: {
  content: string,            // Markdown with [1], [2] markers — for middle panel
  reasoning: string,          // Step-by-step trace — for right panel
  citations: Citation[],      // [{ ref: 1, regulation: "R48", clause: "5.11" }]
  round: number,
  sessionId: string
}
```

The `/api/chat` endpoint internally:
1. Load skill (L1 metadata + L2 SKILL.md)
2. Load relevant references per §6 rules
3. Load top 5 memories from SQLite
4. LLM generates both `content` (document) and `reasoning` (trace) with numbered citations
5. Returns AgentResponse with citations array validated against RegulationSource

---

## Architecture: Citation System

LLM outputs JSON with numbered reference markers in the text. Two distinct citation types create a complete audit trail — user evidence through LLM analysis to regulation clause.

### Two Citation Types

| Type | Marker Pattern | Points to | Render | UI |
|------|---------------|-----------|--------|----|
| **Regulation** | `[1]`, `[2]` | Regulation clause (R48 §6.1) | `[R48 §6.1]` badge | Popover (quick text lookup) |
| **Source** | `[S1]`, `[S2]` | User-uploaded file (image, PDF) | `[S1]` badge | Inline expand card (inspectable evidence) |

### Response Format

```typescript
interface AgentResponse {
  content: string;                // Markdown with [1], [S1] markers
  reasoning: string;
  citations: Citation[];          // Regulation references
  sourceCitations: SourceCitation[]; // User-source references
  round: number;
  sessionId: string;
}

interface Citation {
  ref: number;              // Matches [N] in content
  regulation: string;       // "R48"
  clause: string;           // "5.11"
}

interface SourceCitation {
  ref: number;              // Matches [SN] in content
  fileId: string;           // Which uploaded file
  filename: string;         // headlamp-label.jpg
  extractedText: string;    // Full OCR/parsed text from the file
  keyExcerpt: string;       // The specific part supporting this claim
  boundingBox?: {           // For image/PDF highlight (from OCR)
    x: number; y: number; width: number; height: number;
  };
  pageNumber?: number;      // For PDFs — which page the excerpt came from
}
```

### How Renderer Works

```
LLM output → AgentResponse JSON
  ├── content: "The vehicle has LED headlamps [S1]. Per R48 §5.11,
  │             auto-leveling is mandatory for LED sources [1]."
  ├── citations: [{ ref: 1, regulation: "R48", clause: "5.11" }]
  └── sourceCitations: [{ ref: 1, fileId: "f1", filename: "..." }]

document-panel.tsx:
  1. Parse content for all markers: /\[(S?\d+)\]/g
  2. For regulation markers [N] → render CitationBadge (popover variant)
  3. For source markers [SN] → render SourceCitationCard (inline expand variant)
  4. Both show regulation label or filename in the badge
  5. Click behavior diverges:
     [N] → popover with clause text from RegulationSource
     [SN] → inline expanded card with extracted text + highlighted source
```

### Regulation Citation Badge (Popover)

Numbered markers `[1]`, `[2]` rendered as inline badges labeled `[R48 §6.1]`. Click → popover floats next to the badge, showing the exact regulation clause text from references/. Fast, ephemeral — read, click away.

```
Render:
  "The headlamp must be between 500-1200mm  ┌─────────┐
                                           │ R48 §6.2 │"
                                           └────┬────┘
                                                │ click
                                                ▼
                                         ┌──────────────────┐
                                         │ UN R48 §6.2      │
                                         │                  │
                                         │ The height of    │
                                         │ headlamps shall  │
                                         │ be between 500   │
                                         │ and 1200 mm...   │
                                         └──────────────────┘
```

### Source Citation Card (Inline Expand)

Source markers `[S1]`, `[S2]` rendered as inline badges labeled by filename. Click → the card **expands inline** below the paragraph, showing the original source file with a highlight on the specific data region. Different from popovers — designed for inspection, not glances.

**Image source** — thumbnail with yellow highlight rectangle drawn from OCR bounding boxes:

```
  "The vehicle has LED headlamps  ┌──────────┐ with 6000K color temp."
                                  │  S1 ▼   │
                                  └────┬─────┘
                                       │ click
                                       ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ┌──────────────────────┐                                │
  │ │  [headlamp-label.jpg]│  Key claim:                    │
  │ │                      │  Color temperature 6000K —     │
  │ │  LED 55W             │  within R112 §5.5 limit.       │
  │ │  ┌───────────────┐  │                                │
  │ │  │ 6000K        │◀─ yellow highlight (OCR bbox)     │
  │ │  │ ECE R112 4B  │  │                                │
  │ │  └───────────────┘  │  Extracted text:               │
  │ │  LOT 2028H3         │  "LED 55W 6000K"               │
  │ └──────────────────────┘  "ECE R112 4B"               │
  │                          "LOT 2028H3"                   │
  │                                                         │
  │  headlamp-label.jpg (234 KB)               [✕ Dismiss]  │
  └─────────────────────────────────────────────────────────┘
```

**PDF source** — page rendered as image with highlight, plus section reference and navigable links:

```
  ┌─────────────────────────────────────────────────────────┐
  │ Source: test-report-vin-2024.pdf (Page 4, §3.2)          │
  │ ─────────────────────────────────────────────────────── │
  │                                                         │
  │  ┌──────────────────────────┐  Key claim:               │
  │  │  [Page 4 rendered]       │  VIN WAUZZZ8X confirmed   │
  │  │  ┌────────────────────┐ │  as Model X specification.│
  │  │  │ WAUZZZ8X...   │ │                          │
  │  │  │ ⬜ HIGHLIGHT  │◀─ yellow highlight         │
  │  │  └────────────────────┘ │                          │
  │  └──────────────────────────┘                          │
  │                                                         │
  │  [Open PDF at page 4 ↗]  [Download PDF ↗] [✕ Dismiss]  │
  └─────────────────────────────────────────────────────────┘
```

**Same SourceCitationCard component** — three render modes per file type (image highlight, PDF page highlight, plain text). The card shell is identical; only the preview slot changes.

highlight comes from OCR bounding boxes (`boundingPoly` per text block). On expand, a `<canvas>` overlay draws tinted rectangles over the relevant pixel region. No server-side image editing.

### File Upload Handling

User attaches files + types a question. The `/api/chat` endpoint parses first, then feeds extracted text into the normal orchestrator flow:

```
User attaches files + types question
        │
        ▼
POST /api/chat (multipart/form-data)
  1. Parse files by MIME type:
     └── image/* → OCR (extract text + bounding boxes)
     └── application/pdf → pdf-parse for text, then render page → image for OCR
     └── .docx → mammoth extraction
  2. Prepend extracted text to user message:
     "[Uploaded: headlamp-label.jpg]
      Extracted text: LED 55W 6000K ECE R112 4B..."
  3. Continue normal orchestrator: skill + references + LLM
  4. LLM cites source data as [S1], [S2] + regulation as [1], [2]
  5. Map sourceCitations back to parsed file data (bbox, page, excerpt)
  6. Return full AgentResponse
```

The reasoning panel shows a **Step 0** when files are attached:
```
Step 0  File Upload
headlamp-label.jpg (234 KB) → OCR: 47 chars extracted
test-report.pdf (1.2 MB) → 3 pages, 820 chars extracted
```

### End-to-End Flow (with Sources)

```
User Input (with files) ──► /api/chat (multipart/form-data)
  │
  ├── 1. File parsing: OCR images, extract PDF text
  ├── 2. Prepend extracted text to user message
  ├── 3. Load skill + references + memories per normal flow
  ├── 4. LLM generates:
  │      { content: "LED headlamps [S1]. R48 §5.11 applies [1].",
  │        reasoning: "Step 0: Parse files... Step 1: Check light source...",
  │        citations: [{ ref: 1, regulation: "R48", clause: "5.11" }],
  │        sourceCitations: [{ ref: 1, fileId: "f1", keyExcerpt: "6000K", boundingBox: {...} }] }
  │        │
  │        ▼
  ├── 5. Map sourceCitations to parsed file data (match OCR bboxes)
  ├── 6. Return to frontend
  │        │
  │        ▼
  └── document-panel renders:
       ├── [S1] inline → SourceCitationCard (expandable, highlighted image/PDF)
       ├── [1] inline → CitationBadge (popover, regulation text)
       ├── Select text → inline comment
       └── Approve → Lessons Learned → confirm → evolution
```

---

## Skill Format

### Folder Structure

```
skills/
└── eu-vwta-lighting/
    ├── SKILL.md               # Core: role + flow + decisions + red lines (≤3000 chars)
    ├── references/             # On-demand: regulation text, parameter tables, pitfalls
    │   ├── un-r48.md           # UN R48 full clause text
    │   ├── un-r112.md          # UN R112 full clause text
    │   └── common-pitfalls.md  # Common VWTA lighting mistakes
    ├── scripts/                # Deterministic computation via function calling
    │   └── compliance-check.py # Numerical pass/fail, rounding
    └── assets/                 # Templates (not counted in context)
        └── report-template.docx
```

### Three-Level Loading

| Level | Content | When | Size | Purpose |
|-------|---------|------|------|---------|
| L1 | `name`, `description`, `triggers` | Always in context | ~30 chars | Skill selection |
| L2 | Full `SKILL.md` | User selects skill | ≤3000 chars | Execution |
| L3 | `references/*.md` | LLM loads on demand per §6 | 500-1000 chars/file | Deep reference |

### SKILL.md Template (For Demo)

```markdown
---
name: eu-vwta-lighting
description: >
  EU VWTA compliance review for vehicle lighting systems.
  Covers UN R48 (installation) and UN R112 (headlamp performance).
triggers: ["VWTA", "lighting", "headlamp", "R48", "R112", "type approval"]
---

# EU VWTA Lighting Compliance

## 1. Role Definition

You are a senior EU VWTA certification expert specializing in vehicle lighting systems.
You understand the intent behind each regulation clause.
You rely on scripts for numerical pass/fail and your own expertise for anomaly detection.

## 2. Execution Flow

1. Identify vehicle specs and lighting system configuration
2. Load applicable regulation references per §6
3. For each compliance check:
   a. Evaluate against regulation requirement
   b. For numerical limits → call scripts/compliance-check.py (§5)
   c. For qualitative checks → apply professional judgment
4. Compile compliance report with clause citations as `[1]`, `[2]` markers
5. Issue conclusion: PASS / FAIL with rationale

## 3. Key Decision Points

### 3.1 Auto-Leveling (LED Source)
If light source is LED → UN R48 §5.11 applies: auto-leveling MANDATORY.

### 3.2 Mounting Height
Range: 500-1200mm per UN R48 §6.2. Near-limit boundary: flag in conclusion.

### 3.3 Beam Cutoff Angle
UN R112 §5.3: ≤ 0.57°. Use compliance-check.py for determination.

### 3.4 Color Temperature
UN R112 §5.5: ≤ 6000K. Use compliance-check.py for determination.

## 4. Red Lines

- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip auto-leveling check for LED — legally required
- ❌ Do not make numerical pass/fail without calling scripts (§5)
- ❌ Do not reference clauses from memory — load from references/

## 5. Numerical Judgement Rules

⚠️ All numerical pass/fail MUST go through scripts/compliance-check.py (function calling).

### Tool: check_compliance

| Parameter | Type | Description |
|-----------|------|-------------|
| checks[].name | string | Check name |
| checks[].value | number | Measured/input value |
| checks[].limit | number | Regulation limit |
| checks[].operator | string | `>=`, `>`, `<=`, `<` |
| checks[].clause | string | Regulation clause reference |

Returns: `{ results: [{ name, value, limit, comparison, status: "pass"|"fail", note }] }`

## 6. Reference Loading Rules

| Condition | Must Load |
|-----------|-----------|
| Any lighting check | references/un-r48.md |
| Headlamp performance | references/un-r112.md |
| Any task | references/common-pitfalls.md |

## 7. Experience Accumulation

> This section is auto-maintained by system experience沉淀, equally important as the initial flow.

(System-maintained area, initially empty.)
```

### Key Design Principles

| Principle | Meaning |
|-----------|---------|
| **One skill = one domain** | Lighting compliance is one skill. Emissions would be another. |
| **SKILL.md ≤ 3000 chars** | Only decision-level knowledge. Standard text goes to references/. |
| **Deterministic → scripts** | Numerical pass/fail MUST go through compliance-check.py via function calling |
| **Fuzzy → LLM** | Anomaly detection, standard applicability, report writing |
| **References on demand** | §6 tells LLM when to load each reference file |
| **Experience auto-saved** | §7 maintained by system, humans don't touch |

---

## Layered Knowledge Architecture (Quality Gate)

```
                    ┌──────────────────────────────────────┐
                    │  L1: SKILL.md (Methodology)          │
                    │  ──────────────────────               │
                    │  Role, flow, decisions, red lines     │
                    │  Human-written, system-evolved        │
                    │  ≤3000 chars                          │
                    └──────────┬───────────────────────────┘
                               │ §6: load when needed
                               ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  L3a: references/    │  │  L3b: scripts/       │  │  Memory (SQLite)     │
│  ────────────────    │  │  ──────────────       │  │  ────────────────    │
│  Regulation text     │  │  Numerical pass/fail  │  │  User corrections    │
│  Parameter tables    │  │  Rounding (GB/T 8170) │  │  User preferences    │
│  Common pitfalls     │  │  Status determination │  │  Past approaches     │
│  Loaded on demand    │  │  Called via function  │  │  Injected next task  │
│  (one file per std)  │  │  calling             │  │                      │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

**No vector DB, no graph DB, no RAG needed.** The three-level loading solves knowledge management more directly:
- The skill author's expertise determines WHAT knowledge is needed (§6 rules)
- The reference files provide the exact text (no search needed)
- Scripts handle deterministic computation (no AI hallucination risk)
- The `RegulationSource` interface decouples agent code from data source as a good engineering practice, but the `references/` approach is already production-worthy for any skill with ≤50 reference files

---

## API Flows

### `POST /api/chat` — Unified endpoint (SSE streaming)

```
Request:  { skillName: "eu-vwta-lighting", message: "Check Model X LED headlamps...",
            sessionId: "abc" }

orchestrator.ts:
  1. Load skill → loader.ts reads:
     ├── L1: { name, description, triggers }
     ├── L2: full SKILL.md body
     ├── L3a: references list
     └── L3b: scripts list
           │
           ▼
  2. Parse §6 loading rules, match conditions against input
     ├── LED source → load references/un-r48.md
     ├── Headlamp check → load references/un-r112.md
     └── Always → load references/common-pitfalls.md
           │
           ▼
  3. Build LLM prompt:
     ├── System prompt: senior EU VWTA expert
     ├── SKILL.md full text
     ├── Relevant references/*.md (regulation clause text)
     ├── Top 5 relevant memories (SQLite)
     └── Tools: check_compliance(checks) → scripts/compliance-check.py
           │
           ▼
  4. LLM generates delimited output via `streamText`:
     ---STEP 1---
     Step title
     → finding details
     
     ---STEP 2---
     Step title  
     → more findings [1]

     ---CONTENT---
     The compliance document with [1] markers...

     ---DATA---
     {"citations": [{"ref": 1, "regulation": "R48", "clause": "6.1"}], "verdict": "FAIL", "lesson": "..."}
     ---DATA---END
           │
           ▼
  5. Response streams as SSE events to the client
     Client accumulates tokens, re-parses with `parseLlmResponse`
     on each chunk to extract reasoning steps, content, citations
  6. Store in session history
  7. Return final AgentResponse
```

### `POST /api/chat` — Feedback (same endpoint, round > 1)

```
Request:  { sessionId, message: "You missed the auto-leveling check for LED",
            round: 2 }

orchestrator.ts:
  1. Load previous session (content + context)
  2. Re-run LLM with:
     ├── Previous prompt + content
     ├── "User feedback: missed auto-leveling check for LED"
     └── Available tools + references
  3. LLM generates updated markdown with revised `[1]`, `[2]` markers + citations array
  4. Store in session history

Response: { sessionId, content: "Updated... [1]", citations: [{ ref: 1, ... }], round: 2 }
```

### `POST /api/agent/evolution-confirm` — User confirms or dismisses

```
Request: { sessionId, skillId, lessonText, confirmed }
           │
           ▼
evolution/integrator.ts:
  ├── confirmed=true  → append to SKILL.md §7, store in memory
  └── confirmed=false → store in memory only (do NOT modify skill)
           │
           ▼
Response: { success: true, written: confirmed }
```

### Lesson Extraction (Inline Classifier)

Lessons are extracted from every session via two paths:

1. **LLM inline** — The system prompt instructs the LLM to emit a `---DATA---` JSON block with an optional `lesson` field. If the LLM finds a generalizable insight from the session, it includes it.
2. **Rule-based fallback** — `classifyAndSynthesize()` in orchestrator.ts collects FAIL findings with regulation citations (R\d+ + §[\d.]+) from reasoning steps and tool call errors. Returns null if nothing specific is worth saving.

Both paths go through fuzzy dedup against SKILL.md §7 (normalize first 80 chars, strip non-alphanumeric, compare). If the lesson already exists, it's skipped. No separate `classifier.ts` — the logic lives in orchestrator.ts.

```
LLM output → parseLlmResponse → parsed.lesson exists?
  ├── Yes → use LLM-generated lesson text
  └── No  → classifyAndSynthesize() scans steps + tool results
              → null if no FAIL with R\d+ + §[\d.]+
              → synthesized text if significant findings
                    │
                    ▼
              lessonExistsInSkill() fuzzy dedup
              → skip if already in §7
              → return Lesson object for frontend
                    │
                    ▼
         Approve button → evolution-confirm dialog
         → Confirm → integrator writes to SKILL.md §7
         → Dismiss → discarded (no persistence)
```

### `GET /api/scripts/compliance-check` — Function calling tool

```
Called by LLM via function calling during Stage 2:
Request:  { checks: [{ name: "Headlamp Count", value: 2, limit: 2,
                        operator: ">=", clause: "6.1" }] }

           ▼
script-runner.ts:
  1. Receives checks array
  2. For each check: evaluate value vs limit with operator
  3. Apply rounding per GB/T 8170 (via compliance-check.py logic)
  4. Return status + comparison string

Response: { results: [{ name: "Headlamp Count", value: 2, limit: 2,
                        comparison: "2 >= 2", status: "pass", note: "" }] }
```

---

## Project Structure

```
/Users/7ian/skill-agent/
├── package.json, next.config.ts, tsconfig.json, components.json
├── .env.example, .gitignore
├── data/                    # SQLite DB
├── skills/
│   └── eu-vwta-lighting/
│       ├── SKILL.md
│       ├── references/
│       │   ├── un-r48.md
│       │   ├── un-r112.md
│       │   └── common-pitfalls.md
│       └── scripts/
│           └── compliance-check.py
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Sidebar nav + drawer system
│   │   ├── globals.css
│   │   ├── page.tsx         # ⭐ Chat view (entry point)
│   │   └── api/
│   │       ├── chat/route.ts       # ⭐ Unified chat endpoint
│   │       ├── skills/route.ts
│   │       ├── settings/route.ts          # LLM provider + model config
│   │       ├── sessions/route.ts          # Session CRUD
│   │       ├── sessions/[id]/route.ts
│   │       ├── scripts/route.ts           # List skill scripts
│   │       ├── scripts/[name]/route.ts    # Execute named script
│   │       └── agent/
│   │           └── evolution-confirm/route.ts
│   ├── components/
│   │   ├── ui/              # shadcn/ui
│   │   ├── sidebar.tsx
│   │   ├── skills-drawer.tsx        # Table view — regulation database style
│   │   ├── history-drawer.tsx      # ✅ Light
│   │   ├── settings-popover.tsx    # ✅ Real — provider + model controls
│   │   ├── chat-view.tsx           # ⭐ SSE streaming consumer + session container
│   │   ├── chat-message.tsx        # ⭐ Renders markdown + citation badges + comments
│   │   ├── document-panel.tsx      # ⭐ Middle panel: template-rendered document
│   │   ├── reasoning-panel.tsx     # ⭐ Right panel: pre-parsed step cards
│   │   ├── chat-input.tsx          # ⭐ Input bar at bottom
│   │   ├── citation-badge.tsx      # ⭐ [R48 §6.1] → badge + popover (regulation)
│   │   ├── source-citation-card.tsx  # 🔜 To be tackled
│   │   ├── inline-comment.tsx      # 🔜 To be tackled
│   │   ├── script-execution-card.tsx # ⭐ CLI-style card in reasoning panel
│   │   ├── evolution-confirm-dialog.tsx # ⭐ Lessons learned confirmation
│   │   └── learning-banner.tsx     # ⭐ "Auto-applied from experience"
│   └── lib/
│       ├── app-context.tsx
│       ├── citation-parser.ts      # Extract [Reg §Clause] from markdown text
│       ├── utils.ts
│       └── agent/
│           ├── types.ts               # AgentResponse type
│           ├── schemas.ts             # Zod schemas (ToolCallRecord, AgentResponse, etc.)
│           ├── turn-types.ts          # ChatTurn interface with reasoningSteps
│           ├── parse-response.ts      # Shared parser for ---STEP---/---CONTENT---/---DATA---
│           ├── skill/loader.ts        # Reads L1, L2, L3 from skill folder
│           ├── skill/registry.ts
│           ├── skill/script-runner.ts # Runs scripts/ via function calling
│           ├── memory/database.ts
│           ├── memory/repository.ts
│           ├── llm/factory.ts         # createModel() — selects OpenAI/Anthropic/DeepSeek
│           ├── regulation/
│           │   ├── types.ts           # RegulationSource interface
│           │   └── skill-source.ts    # Demo impl (reads references/ + §6 dynamic loading)
│           ├── agent/orchestrator.ts  # ⭐ Coordinates LLM + references + scripts + streaming
│           └── evolution/
│               └── integrator.ts      # Write lesson to SKILL.md §7
```

---

## Implementation Phases

### Phase 1: Scaffold + Chat Layout
- `npx create-next-app` + shadcn/ui setup
- Dependencies: `better-sqlite3`, `gray-matter`, `openai`, `dotenv`
- `layout.tsx` with sidebar (3 icons: Skills, History, Settings), all 3 mock drawers
- `page.tsx` as chat view with `chat-view.tsx`, `chat-message.tsx`, `chat-input.tsx`
- For demo without backend: chat-input sends message, chat-message shows it, mock response shows a sample embedded report-workspace
- **Checkpoint**: Professional chat app shell with embedded mock report

### Phase 2: Skill Engine + Three-Level Loading
- `skill/loader.ts` — reads L1 (metadata), L2 (SKILL.md full), L3 (references/ on demand)
- `skill/registry.ts` — discover skills
- `skill/script-runner.ts` — execute scripts/ via function calling
- `regulation/types.ts` + `regulation/skill-source.ts` — RegulationSource interface + demo impl
- Demo skill folder with SKILL.md, references/, scripts/
- `llm/*` — factory + providers
- **Checkpoint**: Skill loaded, references loadable on demand, scripts callable

### Phase 3: Orchestrator + Chat API
- `agent/types.ts` — AgentResponse type
- `agent/orchestrator.ts` — loads skill + references + memories, builds prompt, calls LLM, returns markdown with citations
- `POST /api/chat` — unified endpoint, reads session, calls orchestrator, stores result
- `citation-parser.ts` — regex to extract `[N]` markers and match to citations[]
- **Checkpoint**: Chat input → API → markdown response with citation markers

### Phase 4: Rich Message Rendering (HARD TO IMAGINE)
- `citation-badge.tsx` — replaces `[N]` markers with clickable badges labeled `R48 §6.1` from citations[]
- `chat-message.tsx` — renders markdown + extracts citations → renders as inline badges
- Citation popover fetches clause text from RegulationSource (reads references/)
- **Checkpoint**: Every agent response has clickable citation badges showing real clause text

### Phase 5: Script Execution Card + Evolution Confirm
- `script-execution-card.tsx` — CLI-style card in reasoning panel for function calls
- Inline lesson extraction in orchestrator.ts (LLM via `---DATA---` + rule-based fallback)
- `evolution/integrator.ts` — write to SKILL.md §7 or memory only
- `POST /api/agent/evolution-confirm` → user confirms/dismisses
- `evolution-confirm-dialog.tsx` — "Lessons Learned" dialog, shows proposed rule
- `learning-banner.tsx` — shown when evolution completes
- `history-drawer.tsx` — past sessions
- States, error handling, polish
- **Checkpoint**: Full end-to-end demo with visible script execution and human-gated evolution

## Remaining Work

**To be tackled in the current phase (Step 1 — Production Build):**
- Source citation cards — inline expand with image/PDF highlight + extracted text
- File upload + OCR — Tesseract.js for images, pdf-parse for PDFs, bounding box extraction
- Inline comments — select text → anchored comment → agent revises

**SaaS phase (Step 2):**
- IAM: invitation-code gated registration, email login, role-based access, multi-tenancy
- Payment: Stripe for EU (in-app), off-platform for China (manual codes, no code changes)
- Admin panel: invitation code management, LLM provider config (add/remove, temperature, max steps), user management
- Platform hardening: database migrations, rate limiting, cost tracking, skill zip upload + validation, logging
- Infrastructure: PostgreSQL, S3/R2 file storage, CI/CD, monitoring, daily backups
- Single Vercel deployment for both regions. i18n and separate China deployment deferred post-trial

---
          
## Two-Step Delivery Plan

### Step 1 — Production Build (current)

**Goal:** Everything is real. Every LLM call goes to OpenAI/DeepSeek. Skills load from the filesystem. Scripts execute. Evolution writes to SKILL.md. Memory persists in SQLite. SSE streaming delivers reasoning steps to the UI in real time.

**Status:** Core is built. What remains:

**To be tackled in current phase:**

| Feature | Details |
|---------|---------|
| File upload + OCR | Tesseract.js for images, pdf-parse + canvas for PDFs — preserve bounding boxes for source highlights |
| Source citation cards | Inline expand card with image/PDF highlight + extracted text — visual evidence trail |
| Inline comments | Select text → anchored comment → agent revises with that context |

**Deliverable:** Full production build. Runs locally with `npm run dev`. All 5 implementation phases complete.

---

### Step 2 — SaaS Platform (next phase, 2-3 weeks)

**Goal:** An invitation-only trial platform, open to both EU and China users. Invited users register, upload their own skills, and run compliance assessments. Single codebase, single Vercel deployment, different payment paths per region.

**Model:** Closed trial — no public signup. Admin generates invitation codes; only code-holders can register.

**Hybrid deployment:** Single Vercel app serves both regions. EU users pay in-app via Stripe. China users get manual invitation codes — payment handled off-platform (WeChat shop, manual transfer, etc.). No ICP, no Tencent Cloud needed for trial. Language and region-specific skill marketplace deferred post-trial.

#### IAM (Identity & Access Management)
| Feature | Implementation |
|---------|---------------|
| Invitation codes | Admin generates single-use codes (UUID). Codes expire after N days or first use |
| User registration | Email + password registration, invitation code required |
| Login | Email + password, session-based (JWT or iron-session) |
| Password reset | Email-based reset link |
| Role-based access | User / Admin roles. Admin sees all data; users see only their own |
| Multi-tenancy | All queries scoped to `user_id` |

#### Payment (Hybrid)
| Feature | EU | China |
|---------|-----|-------|
| In-app payment | Stripe Checkout — embeddable, handles VAT automatically | — |
| Off-platform payment | — | Manual: WeChat shop, transfer, whatever channel. Admin issues invitation code after payment |
| Subscription tiers | Monthly / annual via Stripe | Manual equivalent |
| Free trial | N-day trial via invitation code | Same |
| Usage metering | Track LLM calls, sessions, file uploads per user per month | Same |
| Feature flag | `STRIPE_ENABLED=true` | `STRIPE_ENABLED=false`, payment UI hidden |

#### Admin Panel
| Feature | Implementation |
|---------|---------------|
| Invitation code management | Generate codes, list active/used/expired, revoke. Track which were purchased vs trial |
| LLM provider config | Add/remove providers, set base URL, API keys per provider |
| LLM defaults | Configure temperature, max steps (`stopWhen: stepCountIs(N)`), default model per provider |
| User management | List users, view usage, disable accounts |
| System overview | Total sessions, LLM costs, active users dashboard |

#### Platform Hardening
| Feature | Implementation |
|---------|---------------|
| Database migrations | Proper migration strategy (e.g. `db-migrate` or manual versioned SQL files). Current `CREATE TABLE IF NOT EXISTS` handles first-time creation but not schema changes |
| Rate limiting | 20 req/min per user on `/api/chat` |
| LLM cost tracking | Log tokens per call, per user, per session |
| Skill upload | Zip upload only (no UI-based creation for this phase). Extract to `skills/`, validate structure |
| Skill validation | Validate SKILL.md format on upload: required sections (§1-§7), L1 frontmatter, `references/` and `scripts/` directories. Reject malformed skills with clear error messages |
| Memory management | Per-user SQLite or PostgreSQL, paginated retrieval |
| Export/import | Export sessions as PDF/Word, download skill as zip |
| Error pages | Custom 404, 500, rate-limit pages |
| Logging | Structured logging (pino or winston), audit trail for evolution writes |
| Script sandboxing | Docker container or vm2 isolate for compliance-check execution. No network access. Whitelist allowed imports. Currently only 30s timeout is implemented |
| Request body size limits | Enforce max request body size on `/api/chat` (e.g., 10 MB) to prevent memory exhaustion from large file data URLs |
| Lesson extraction fallback | Implement `classifyAndSynthesize()` in orchestrator.ts: scan reasoning steps + tool results for FAIL findings with regulation citations (R\d+ + §[\d.]+) when LLM doesn't emit a `---DATA---` lesson |
| Fuzzy lesson dedup | Replace simple `content.includes()` in `evolution/integrator.ts` with normalized comparison (first 80 chars, strip non-alphanumeric) against SKILL.md §7 |
| Agent Score Summary | Add scoring widget at bottom of reasoning panel: implicit score, trend indicator (up/down/flat) — see plan wireframe lines 147-151 |
| Source citation inline rendering | Wire `[SN]` markers to expand inline below their paragraph (not in a separate section at card bottom). Implement canvas overlay with tinted rectangles from OCR bounding boxes for image/PDF highlights |

#### Infrastructure
| Feature | Implementation |
|---------|---------------|
| Database | PostgreSQL (Supabase or Neon, EU region) — replaces SQLite for multi-tenant |
| File storage | Cloudflare R2 or S3 (EU region) for uploaded skill zips, source documents |
| Deployment | Single Vercel app. Both regions access the same deployment |
| CI/CD | GitHub Actions — lint, typecheck, build, run migrations, deploy |
| Monitoring | Sentry for errors, Vercel Analytics or Plausible for usage |
| Backups | Daily PostgreSQL backups |

#### Stretch (if time allows)
| Feature | Notes |
|---------|-------|
| China Volcano deployment | Separate deployment on existing Volcano Engine account if latency becomes an issue |
| i18n (Chinese UI) | UI strings externalized, `zh-CN` locale |
| Region-specific skill marketplace | Different featured skills per region (GB/T for China, UN regulations for EU) |
| Skill creation via UI | Visual SKILL.md editor with section templates |
| Team workspaces | Multiple users share a skill set and session history |
| Skill marketplace | Public gallery of community skills, install with one click |
| API keys | Programmatic access to `/api/chat` for CI/CD integration |
| Audit report PDF | Auto-generated signed PDF of each compliance session |

**Deliverable:** Single Vercel URL. Admin generates invitation codes → invited users register → EU users pay via Stripe, China users pay off-platform → upload skill zips → run assessments. Admin configures LLM providers and monitors usage.

**Budget:** 2-3 weeks (~80-120 hours).

---

### Dependency Chain

```
Step 1 (Day-1 Demo) ──► Step 2 (Full Build) ──► Step 3 (SaaS)
                             │                        │
                        Real components          Add IAM + Payment
                        from Step 1 carry        + PostgreSQL + Stripe
                        forward unchanged        + Deployment hardening
```

Step 1 components are the real React components — just fed mock data. In Step 2, the same components receive real API responses. In Step 3, we add auth wrappers, payment gates, and multi-tenant data isolation.

### Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM outputs malformed JSON for citations | High | Validate all citations against RegulationSource before rendering; fall back to raw markdown on parse failure |
| OCR quality insufficient for bounding box highlights | Medium | Current: if OCR fails, fall back to plain text card without highlight. SaaS phase: consider cloud OCR (AWS Textract) |
| LLM hallucinates regulation clauses that don't exist | High | Citation validation layer rejects unknown clauses before rendering. Show "citation unavailable" badge instead |
| Script execution security (arbitrary Python) | High | Sandbox: Docker container or vm2 isolate. No network access. 30s timeout. Whitelist allowed imports |
| Evolution writes bad rules to SKILL.md | Medium | Significance gate (requires FAIL + specific regulation/clause) + human gate (confirm dialog) + fuzzy dedup. No auto-write without user confirmation |
| Context window overflow with large references | Medium | §6 loading rules + 3000-char SKILL.md limit. References loaded one at a time on demand |
| Payment integration complexity delays launch | Low | Stripe Checkout for EU (sub-day integration). China: off-platform (no code). No payment API risk |
| Multi-tenant data leak | Critical | Row-level security in PostgreSQL. All queries scoped to `user_id`. Audit all API routes for tenant isolation |
