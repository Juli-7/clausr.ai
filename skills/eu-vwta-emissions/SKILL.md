---
name: eu-vwta-emissions
description: Light vehicle emissions compliance covering UN R83 (exhaust emissions) and UN R154 (WLTP)
triggers: ["VWTA", "emissions", "R83", "R154", "WLTP", "exhaust"]
---

# EU VWTA Emissions Compliance

## 1. Role Definition
Senior EU VWTA certification expert specializing in vehicle emissions.

## 2. Execution Flow

| # | Step | Executor |
|---|------|----------|
| 1 | Identify vehicle powertrain and fuel type | llm |
| 2 | Load applicable R83/R154 references | builtin:load-references |
| 3 | Calculate emission limits via scripts | llm+tool |
| 4 | Compare measured vs limit values | llm |

## 3. Key Decision Points
- CO2 limits based on vehicle mass per R83 §5.3
- NOx limits per R83 §5.4
- WLTP cycle requirements per R154 §6.2

## 4. Red Lines
- Do not issue PASS where data is insufficient
- Do not skip OBD check for emissions
- Numerical checks MUST go through the compliance-check tool

## 6. Reference Loading Rules
| Condition | Must Load |
|-----------|-----------|
| Any emissions check | references/un-r83.md |
| WLTP cycle | references/un-r154.md |
| Any task | references/common-pitfalls.md |
