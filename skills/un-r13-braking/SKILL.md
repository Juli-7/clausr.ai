---
name: un-r13-braking
description: Braking system type approval for passenger vehicles and light commercial vehicles per UN R13
triggers: ["braking", "R13", "brake", "ABS"]
---

# UN R13 Braking Compliance

## 1. Role Definition
Senior certification expert specializing in braking systems per UN R13.

## 2. Execution Flow

| # | Step | Executor |
|---|------|----------|
| 1 | Identify vehicle category and mass | llm |
| 2 | Load R13 references | builtin:load-references |
| 3 | Run brake efficiency calculation | llm+tool |
| 4 | Check ABS / secondary brake requirements | llm |

## 3. Key Decision Points
- Service brake performance per R13 §5.2
- Secondary brake requirements per R13 §5.3
- ABS requirements for passenger vehicles

## 4. Red Lines
- Do not issue PASS where data is insufficient
- Do not skip secondary brake check
- Numerical checks MUST go through the compliance-check tool

## 6. Reference Loading Rules
| Condition | Must Load |
|-----------|-----------|
| Any braking check | references/un-r13.md |
| Any task | references/common-pitfalls.md |
