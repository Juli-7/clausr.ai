---
name: eu-vwta-lighting
description: EU VWTA compliance review for vehicle lighting systems. Covers UN R48 (installation) and UN R112 (headlamp performance).
triggers: ["VWTA", "lighting", "headlamp", "R48", "R112", "type approval"]
regulation_ids:
  - R48
  - R112
---

## Checks

### light_source
1. **type**: enum(led, halogen, xenon, other)
2. **attention**: headlamp light source type LED halogen xenon
3. **description**: Determines which clauses apply for headlamp requirements
4. **clause**: (none)
5. **depends_on**: (none)
6. **sample**: The vehicle uses LED headlamps [S1.c1], which require auto-leveling under R48.5.11.

### auto_leveling
1. **type**: enum(required, not_required, na)
2. **attention**: headlamp auto leveling adjustment levelling
3. **description**: Auto-leveling is mandatory if the light source is LED
4. **clause**: R48.5.11
5. **depends_on**: light_source
6. **sample**: Since the light source is LED, auto-leveling is required under R48.5.11. The document confirms it is fitted [S1.c2].

### mounting_height
1. **type**: number(0-2000)
2. **attention**: headlamp mounting height position installation
3. **description**: Headlamp mounting height measured in mm from ground
4. **clause**: R48.6.2
5. **constraint**: range(500-1200)
6. **depends_on**: (none)
7. **sample**: The headlamp mounting height is 650 mm [S1.c3], within the required range of 500-1200 mm under R48.6.2.

### colour_temperature
1. **type**: number(3000-8000)
2. **attention**: headlamp colour temperature Kelvin
3. **description**: Colour temperature in Kelvin
4. **clause**: R112.5.5
5. **constraint**: <= 6000
6. **depends_on**: (none)
7. **sample**: The colour temperature is 5000 K [S1.c4], below the 6000 K limit under R112.5.5.

### beam_cutoff_angle
1. **type**: number(0-2)
2. **attention**: beam cutoff angle headlamp pattern aim
3. **description**: Beam cutoff angle in degrees
4. **clause**: R112.5.3
5. **constraint**: <= 0.57
6. **depends_on**: (none)
7. **sample**: The beam cutoff angle measured 0.4 degrees [S1.c5], within the 0.57 degree limit under R112.5.3.

### luminous_flux
1. **type**: number(0-500)
2. **attention**: luminous flux light output lumens
3. **description**: Luminous flux in lumens per lamp
4. **clause**: R112.5.2
5. **constraint**: >= 150
6. **depends_on**: (none)
7. **sample**: The luminous flux per lamp is 180 lumens [S1.c6], exceeding the 150 lumen minimum under R112.5.2.

## Red Lines
- ❌ Do not issue PASS where data is insufficient
- ❌ Do not skip auto-leveling check for LED — legally required
- ❌ Do not make numerical pass/fail without calling the compliance-check tool
- ❌ Do not reference clauses from memory — load from Regulation API

## Lessons Learnt
(System-maintained area, initially empty.)
