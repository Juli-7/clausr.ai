---
name: eu-vwta-emissions
description: Light vehicle emissions compliance covering UN R83 (exhaust emissions) and UN R154 (WLTP)
triggers: ["VWTA", "emissions", "R83", "R154", "WLTP", "exhaust"]
regulation_ids:
  - R83
  - R154
---

## Checks

### powertrain_type
1. **type**: enum(ice, hybrid, electric, other)
2. **description**: Powertrain type determines which emission limits apply
3. **clause**: (none)
4. **depends_on**: (none)
5. **sample**: The vehicle has an internal combustion engine [S1.c1], so ICE emission limits under R83 apply.

### vehicle_mass_kg
1. **type**: number(0-5000)
2. **description**: Vehicle mass used for CO2 limit calculation
3. **clause**: R83.5.3
4. **depends_on**: (none)
5. **sample**: The vehicle mass is 1450 kg [S1.c2] as documented in the type approval application.

### co2_limit_gkm
1. **type**: number(0-300)
2. **description**: CO2 emissions in g/km must not exceed the limit
3. **clause**: R83.5.3
4. **constraint**: <= 95
5. **depends_on**: powertrain_type
6. **sample**: For ICE powertrain, the CO2 emissions measured are 88 g/km [S1.c3], within the 95 g/km limit under R83.5.3.

### nox_limit_mgkm
1. **type**: number(0-200)
2. **description**: NOx emissions in mg/km, stricter limits for diesel
3. **clause**: R83.5.4
4. **constraint**: <= 80
5. **depends_on**: powertrain_type
6. **sample**: NOx emissions are 45 mg/km [S1.c4], below the 80 mg/km limit under R83.5.4.

### wltp_cycle_compliant
1. **type**: enum(pass, fail, not_tested)
2. **description**: Whether the vehicle passes WLTP test cycle requirements
3. **clause**: R154.6.2
4. **depends_on**: (none)
5. **sample**: The WLTP test cycle was completed with a pass result [S1.c5], conforming to R154.6.2.

### obd_present
1. **type**: boolean
2. **description**: On-board diagnostics must be present
3. **clause**: R83.5.5
4. **depends_on**: (none)
5. **sample**: On-board diagnostics (OBD) are confirmed present in the vehicle documentation [S1.c6], meeting R83.5.5 requirements.

## Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip OBD check for emissions
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
- ❌ Do not reference clauses from memory — load from Regulation API

## Lessons Learnt
(System-maintained area, initially empty.)
