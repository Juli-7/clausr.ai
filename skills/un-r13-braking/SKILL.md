---
name: un-r13-braking
description: Braking system type approval for passenger vehicles and light commercial vehicles per UN R13
triggers: ["braking", "R13", "brake", "ABS"]
---

## Checks
| Field | Type | Constraint | Clause | Depends On | Notes |
|-------|------|------------|--------|------------|-------|
| vehicle_category | enum(m1|m2|n1|n2) | | | | M1=passenger, N1=light commercial |
| service_brake_efficiency | number(0-100) | >= 50 | R13.5.2 | | Percentage |
| secondary_brake_efficiency | number(0-100) | >= 22 | R13.5.3 | | Independent of service brake |
| abs_present | enum(required|present|absent) | | R13.5.6 | vehicle_category | Required for M1, optional for some N1 |
| parking_brake_efficiency | number(0-100) | >= 16 | R13.5.4 | | Must hold on 18% gradient |
| brake_fade_test | enum(pass|fail|not_tested) | | R13.5.7 | | Hot brake performance |

## Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip secondary brake check
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
- ❌ Do not reference clauses from memory — load from Regulation API

## Lessons Learnt
(System-maintained area, initially empty.)
