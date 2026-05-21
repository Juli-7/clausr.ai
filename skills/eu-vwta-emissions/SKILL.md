---
name: eu-vwta-emissions
description: Light vehicle emissions compliance covering UN R83 (exhaust emissions) and UN R154 (WLTP)
triggers: ["VWTA", "emissions", "R83", "R154", "WLTP", "exhaust"]
---

## Checks
| Field | Type | Constraint | Clause | Depends On | Notes |
|-------|------|------------|--------|------------|-------|
| powertrain_type | enum(ice|hybrid|electric|other) | | | | Determines which limits apply |
| vehicle_mass_kg | number(0-5000) | | R83.5.3 | | Used for CO2 limit calculation |
| co2_limit_gkm | number(0-300) | <= 95 | R83.5.3 | powertrain_type | For ICE; hybrid has different limits |
| nox_limit_mgkm | number(0-200) | <= 80 | R83.5.4 | powertrain_type | Diesel stricter than petrol |
| wltp_cycle_compliant | enum(pass|fail|not_tested) | | R154.6.2 | | WLTP test cycle requirements |
| obd_present | boolean | | R83.5.5 | | On-board diagnostics mandatory |

## Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip OBD check for emissions
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
- ❌ Do not reference clauses from memory — load from Regulation API

## Lessons Learnt
(System-maintained area, initially empty.)
