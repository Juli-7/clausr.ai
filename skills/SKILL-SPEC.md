# SKILL.md — Format Specification v1.3

## Philosophy

A SKILL.md file is a **contract** between a domain expert and the AI execution engine.

The domain expert declares, in explicit structured form, everything the engine must know that it would not know by default. The engine guarantees: if it is declared, it is executed as declared — in order, no skipping, no improvisation.

The engine already knows how to run a generic compliance assessment (collect evidence → check against rules → produce cited conclusion). The SKILL.md exists for everything the engine does **not** know: this domain's specific procedures, this domain's specific rules, this domain's specific thresholds, this domain's specific lessons learned.

The format standardizes one thing: **the categories of declarations a domain expert can make to control an AI compliance assessment.**

## File Anatomy

5 sections. Each answers a question the domain expert must answer for the engine to guarantee faithful execution.

### Frontmatter

```yaml
---
name: <unique-identifier>
description: <one-line summary>
triggers: [<keyword>, ...]  # optional
---
```

### §1 Domain & Scope

**The question:** What do you cover, what standards apply, and with what authority?

```
- Domain: <compliance area>
- Standards: <regulation(s)>
- Assessor: <role>
```

This is also where the expert declares which regulations govern this domain. If certain regulations apply only under certain conditions, that belongs in §3 as a rule (e.g., "If LED source, R48 §5.11 applies").

### §2 Workflow

**The question:** What domain-specific steps must be executed that the engine would not know by default?

The engine provides a default assessment loop. The expert adds steps here when the domain requires something the default loop does not cover. Each step declares its execution guarantee:

| Type | Guarantee |
|------|-----------|
| `reasoning` | AI judgment, constrained by every rule in §3. The engine guarantees guardrails are enforced. |
| `deterministic` | Pure code execution. The engine guarantees zero AI involvement. |
| `tool` | AI marshals input/output; computation runs in a deterministic script. The engine guarantees the AI does not estimate, approximate, or guess the result. |

Steps are ordered. Order is enforced by the execution layer — not suggested to the AI.

**If the domain requires no additional steps beyond the default loop, this section may contain a single `reasoning` step describing the assessment objective, or remain minimal.** The section exists for the expert. What the expert does not declare, the engine handles with defaults.

### §3 Rules & Constraints

**The question:** What guardrails constrain the AI's reasoning?

Every rule in this section is binding on all `reasoning`-type steps. Written as assertions:

> If [condition], then [rule].

> Do not [action] when [condition].

Rules guide judgment. Constraints prevent known errors. Both are the expert saying: when the AI reasons about this domain, these boundaries must not be crossed.

Rules about regulation applicability live here, not in a separate section — "If LED source, R48 §5.11 applies" is a rule that constrains reasoning.

### §4 Numerical Thresholds

**The question:** What numbers are non-negotiable?

| Check | Operator | Limit | Clause |
|-------|----------|-------|--------|

`tool`-type steps parse this table to call deterministic scripts. The table format guarantees reliable parsing.

Omit if the domain has no numerical criteria.

### §5 Evolution Log

**The question:** What was corrected, and when?

```
- [YYYY-MM-DD] When [condition], [rule]. Rationale: [why].
```

Every entry was reviewed and merged after a real assessment caught an error or gap. Durable entries should be promoted into §3 during periodic review. The log is the raw feed; §3 is the refined, permanent form.

## The Guarantee

| Section | Expert declares... | Engineer guarantees... |
|---------|-------------------|----------------------|
| §1 | Domain, standards, authority | Scope is enforced |
| §2 | Domain-specific steps with execution types | Executed in declared order, each with declared guarantee |
| §3 | Guardrails on AI reasoning | Every `reasoning` step is bound by every rule |
| §4 | Non-negotiable numbers | Numerical comparisons use deterministic tools, not AI estimation |
| §5 | Reviewed corrections | Merged into future assessments; full audit trail |

## Completeness

A valid SKILL.md must have:

- [ ] Frontmatter with `name` and `description`
- [ ] §1 Domain & Scope
- [ ] §2 Workflow — at least one step declared; may be minimal
- [ ] §3 Rules & Constraints
- [ ] §4 Numerical Thresholds, or explicitly omitted
- [ ] §5 Evolution Log, or explicitly omitted

## Canonical Example

See `eu-vwta-lighting/SKILL.md`.
