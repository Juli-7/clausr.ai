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
2. **attention**: vehicle category classification M1 M2 N1 N2
3. **description**: The vehicle category determines which braking requirements apply
4. **clause**: R13.5.1
5. **depends_on**: (none)
6. **sample**: The vehicle is classified as M1 (passenger vehicle) [S1.c1], which requires full braking compliance.

### service_brake_efficiency
1. **type**: number(0-100)
2. **attention**: service brake efficiency performance percentage
3. **description**: Service brake efficiency as a percentage
4. **clause**: R13.5.2
5. **constraint**: >= 50
6. **depends_on**: (none)
7. **sample**: The service brake efficiency measured is 65% [S1.c2], exceeding the minimum requirement of 50% under R13.5.2.

### secondary_brake_efficiency
1. **type**: number(0-100)
2. **attention**: secondary brake emergency brake efficiency
3. **description**: Secondary brake efficiency as a percentage, independent of service brake
4. **clause**: R13.5.3
5. **constraint**: >= 22
6. **depends_on**: (none)
7. **sample**: The secondary brake efficiency is 28% [S1.c3], meeting the minimum of 22% required by R13.5.3.

### abs_present
1. **type**: enum(required, present, absent)
2. **attention**: ABS anti-lock braking system
3. **description**: Is ABS present on the vehicle?
4. **clause**: R13.5.6
5. **depends_on**: vehicle_category
6. **sample**: For vehicle category M1, ABS is required under R13.5.6. The document confirms ABS is fitted [S1.c4].

### parking_brake_efficiency
1. **type**: number(0-100)
2. **attention**: parking brake handbrake gradient hold
3. **description**: Parking brake efficiency must hold on 18% gradient
4. **clause**: R13.5.4
5. **constraint**: >= 16
6. **depends_on**: (none)
7. **sample**: The parking brake efficiency is 18% [S1.c5], meeting the minimum of 16% under R13.5.4.

### brake_fade_test
1. **type**: enum(pass, fail, not_tested)
2. **attention**: brake fade hot brake performance test
3. **description**: Hot brake performance test result
4. **clause**: R13.5.7
5. **depends_on**: (none)
6. **sample**: The brake fade test result is pass [S1.c6], confirming hot brake performance meets R13.5.7 requirements.

## Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip secondary brake check
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
- ❌ Do not reference clauses from memory — load from Regulation API

## Lessons Learnt
(System-maintained area, initially empty.)
