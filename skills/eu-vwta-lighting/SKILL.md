---
name: eu-vwta-lighting
description: EU VWTA compliance review for vehicle lighting systems. Covers UN R48 (installation) and UN R112 (headlamp performance).
triggers: ["VWTA", "lighting", "headlamp", "R48", "R112", "type approval"]
---

## Checks
| Field | Type | Constraint | Clause | Depends On | Notes |
|-------|------|------------|--------|------------|-------|
| light_source | enum(led|halogen|xenon|other) | | | | Determines which clauses apply |
| auto_leveling | enum(required|not_required|na) | | R48.5.11 | light_source | Mandatory if light_source is LED |
| mounting_height | number(0-2000) | range(500-1200) | R48.6.2 | | Measured in mm from ground |
| colour_temperature | number(3000-8000) | <= 6000 | R112.5.5 | | Kelvin; compliance-check tool required |
| beam_cutoff_angle | number(0-2) | <= 0.57 | R112.5.3 | | Degrees; compliance-check tool required |
| luminous_flux | number(0-500) | >= 150 | R112.5.2 | | Lumens per lamp |

## 3. Expected Output
A compliance report with PASS/FAIL verdict for each check, citing specific regulation clauses. Auto-leveling must be flagged as required for all LED sources.

## 4. Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip auto-leveling check for LED — legally required
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
- ❌ Do not reference clauses from memory — load from Regulation API

## 5. Lessons Learnt
(System-maintained area, initially empty.)
