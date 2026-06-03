# SKILL.md — Format Specification v1.3

## Philosophy

A SKILL.md file is a **contract** between a domain expert and the AI execution engine.

The domain expert declares, in explicit structured form, everything the engine must know that it would not know by default. The engine guarantees: if it is declared, it is executed as declared — in order, no skipping, no improvisation.

The engine already knows how to run a generic compliance assessment (collect evidence → check against rules → produce cited conclusion). The SKILL.md exists for everything the engine does **not** know: this domain's specific procedures, this domain's specific rules, this domain's specific thresholds, this domain's specific lessons learned.

The format standardizes one thing: **the categories of declarations a domain expert can make to control an AI compliance assessment.**

## File Anatomy

4 sections. Each answers a question the domain expert must answer for the engine to guarantee faithful execution.

### Frontmatter

```yaml
---
name: <unique-identifier>
description: <one-line summary>
triggers: [<keyword>, ...]    # optional — used for skill discovery
regulation_ids:               # optional — regulation codes to load
  - R48
  - R112
---
```

### `## Checks`

**The question:** What specific values must be assessed, against what rules, and what evidence is needed for each?

Each check is a 3rd-level heading (`### field_name`) followed by numbered lines with bold keys:

| # | Key | Required | Description |
|---|-----|----------|-------------|
| 1 | `type` | Yes | `string`, `boolean`, `number`, `number(0-100)`, `enum(a, b, c)` |
| 2 | `attention` | No | Keywords for FTS5 chunk retrieval (space-separated) |
| 3 | `description` | Yes | Human-readable description of what to assess |
| 4 | `clause` | Yes/no | Regulation clause ID e.g. `R48.6.2`. Use `(none)` if no clause applies |
| 5 | `constraint` | No | Numerical constraint: `>= 500`, `range(500-1200)`, `<= 6000`, or `(none)` |
| 6 | `rounding` | No | Rounding for numerical checks: `2` (standard), `2:ceil`, `2:floor`. Omit if not needed |
| 7 | `depends_on` | No | `other_field` or `(none)` |
| 8 | `sample` | Yes/no | Example LLM JSON output with citation markers. Use `(none)` if omitted |

Example:
```markdown
### mounting_height
1. **type**: number(0-2000)
2. **attention**: headlamp mounting height position installation
3. **description**: Headlamp mounting height measured in mm from ground
4. **clause**: R48.6.2
5. **constraint**: range(500-1200)
6. **rounding**: 0
7. **depends_on**: (none)
8. **sample**: The headlamp mounting height is 650 mm [S1.c3], within range under R48.6.2.
```

The engine generates one **execution step per check**, 1:1, in order. Each step passes the `attention` keywords to FTS5 full-text search over uploaded document chunks to retrieve relevant evidence.

### `## Red Lines`

Non-negotiable guardrails for the LLM. Written as bullet points with ❌ prefix:

```markdown
## Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip auto-leveling check for LED — legally required
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
```

These are included in the system prompt but not programmatically enforced. They serve as explicit instructions to the LLM.

### `## Lessons Learnt`

System-maintained area for evolution. Initially empty. Appended to by the evolution confirmation endpoint when a user accepts a lesson from an assessment.

```markdown
## Lessons Learnt
(System-maintained area, initially empty.)
```

## The Guarantee

| Component | Expert declares... | Engine guarantees... |
|-----------|-------------------|----------------------|
| Frontmatter | Name, description, triggers, regulation codes | Skill is discoverable; regulations are loaded |
| `## Checks` | Per-field: type, clause, constraint, attention keywords | One step per check; FTS5 chunk retrieval per step; compliance tool for numerical checks |
| `## Red Lines` | Guardrails on LLM reasoning | Included in every step's system prompt |
| `## Lessons Learnt` | Reviewed corrections (appended by system) | Merged into future assessments |

## Completeness

A valid SKILL.md must have:

- [ ] Frontmatter with `name` and `description`
- [ ] `## Checks` — at least one check with `type`, `description`, and optionally `clause`
- [ ] `## Red Lines` — at least one guardrail
- [ ] `## Lessons Learnt` — present even if empty

## Parsing Behavior

The engine parses `## Checks` by scanning for:
1. `### field_name` lines — start of a new check
2. Lines matching `N. **key**: value` — properties of the current check
3. Keys are normalized: `depends_on`, `attention`, `description`, `type`, `constraint`, `clause`, `sample`, `rounding`
4. Missing optional keys get `null`. Missing required keys do not prevent parsing but may affect execution
5. The `regulation_ids` in frontmatter determine which regulation clauses are loaded from the Knowledge API
6. The `attention` field drives per-step FTS5 chunk retrieval — if omitted, the field name itself is used as the search query

## Canonical Example

See `gdpr/SKILL.md`.
