---
name: un-r13-braking
description: Braking system type approval for passenger vehicles and light commercial vehicles per UN R13
triggers: ["braking", "R13", "brake", "ABS"]
regulation_ids:
  - R13
---

## Checks

### vehicle_category
1. **type**: enum(m1, m2, n1, n2)
2. **description**: The vehicle category determines which braking requirements apply
3. **clause**: (none)
4. **depends_on**: (none)
5. **sample**: The vehicle is classified as M1 (passenger vehicle) [S1.c1], which requires full braking compliance.

### service_brake_efficiency
1. **type**: number(0-100)
2. **description**: Service brake efficiency as a percentage
3. **clause**: R13.5.2
4. **constraint**: >= 50
5. **depends_on**: (none)
6. **sample**: The service brake efficiency measured is 65% [S1.c2], exceeding the minimum requirement of 50% under R13.5.2.

### secondary_brake_efficiency
1. **type**: number(0-100)
2. **description**: Secondary brake efficiency as a percentage, independent of service brake
3. **clause**: R13.5.3
4. **constraint**: >= 22
5. **depends_on**: (none)
6. **sample**: The secondary brake efficiency is 28% [S1.c3], meeting the minimum of 22% required by R13.5.3.

### abs_present
1. **type**: enum(required, present, absent)
2. **description**: Is ABS present on the vehicle?
3. **clause**: R13.5.6
4. **depends_on**: vehicle_category
5. **sample**: For vehicle category M1, ABS is required under R13.5.6. The document confirms ABS is fitted [S1.c4].

### parking_brake_efficiency
1. **type**: number(0-100)
2. **description**: Parking brake efficiency must hold on 18% gradient
3. **clause**: R13.5.4
4. **constraint**: >= 16
5. **depends_on**: (none)
6. **sample**: The parking brake efficiency is 18% [S1.c5], meeting the minimum of 16% under R13.5.4.

### brake_fade_test
1. **type**: enum(pass, fail, not_tested)
2. **description**: Hot brake performance test result
3. **clause**: R13.5.7
4. **depends_on**: (none)
5. **sample**: The brake fade test result is pass [S1.c6], confirming hot brake performance meets R13.5.7 requirements.

## Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip secondary brake check
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
- ❌ Do not reference clauses from memory — load from Regulation API

## Lessons Learnt
(System-maintained area, initially empty.)
