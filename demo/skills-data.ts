export interface SkillRow {
  id: string;
  name: string;
  description: string;
  standards: string[];
  lastUsed: string;
  usedCount: number;
  triggers: string[];
  references: { name: string; clauses: string }[];
  scripts: { name: string; desc: string; params: string }[];
  template: string;
  skillmd: string;
}

export const demoSkills: SkillRow[] = [
  {
    id: "eu-vwta-lighting",
    name: "EU VWTA Lighting",
    description: "Vehicle lighting compliance check covering UN R48 (installation) and UN R112 (headlamp performance). Verifies LED auto-leveling, mounting height, beam cutoff angle, and colour temperature.",
    standards: ["UN R48", "UN R112"],
    lastUsed: "2h ago",
    usedCount: 47,
    triggers: ["VWTA", "lighting", "headlamp", "R48", "R112", "type approval"],
    references: [
      { name: "un-r48.md", clauses: "§5.11, §6.1, §6.2" },
      { name: "un-r112.md", clauses: "§5.3, §5.5" },
      { name: "common-pitfalls.md", clauses: "General" },
    ],
    scripts: [
      {
        name: "compliance-check.py",
        desc: "Numerical pass/fail for beam cutoff, colour temperature, mounting height",
        params: "checks[]",
      },
    ],
    template: `{"sections":[{"id":"vehicle-info","title":"Vehicle Info","type":"fields"},{"id":"assessment","title":"Compliance Assessment","type":"markdown"},{"id":"checks","title":"Detailed Checks","type":"table"}]}`,
    skillmd: `---
name: eu-vwta-lighting
description: EU VWTA compliance review for vehicle lighting systems
triggers: ["VWTA", "lighting", "R48", "R112"]
---

## 1. Role Definition
Senior EU VWTA certification expert specializing in vehicle lighting systems.

## 2. Execution Flow
1. Identify vehicle specs and lighting configuration
2. Load applicable regulation references per §6
3. For each check: evaluate vs regulation + call compliance-check.py for numerics
4. Compile report with clause citations as [1], [2] markers
5. Issue PASS/FAIL with rationale

## 3. Key Decision Points
- LED → auto-leveling MANDATORY (R48 §5.11)
- Mounting height: 500-1200mm (R48 §6.2)
- Beam cutoff ≤ 0.57° (R112 §5.3)
- Colour temperature ≤ 6000K (R112 §5.5)

## 4. Red Lines
- No PASS with insufficient data
- No skip auto-leveling for LED
- Numerical checks MUST go through compliance-check.py`,
  },
  {
    id: "eu-vwta-emissions",
    name: "EU VWTA Emissions",
    description: "Light vehicle emissions compliance covering UN R83 (exhaust emissions) and UN R154 (WLTP). Verifies CO2, NOx, particulate limits and OBD requirements.",
    standards: ["UN R83", "UN R154"],
    lastUsed: "3d ago",
    usedCount: 23,
    triggers: ["VWTA", "emissions", "R83", "R154", "WLTP", "exhaust"],
    references: [
      { name: "un-r83.md", clauses: "§5.3, §5.4, Annex 4" },
      { name: "un-r154.md", clauses: "§6.2, §7.1" },
      { name: "common-pitfalls.md", clauses: "General" },
    ],
    scripts: [
      { name: "emissions-calc.py", desc: "CO2/NOx limit calculation based on vehicle mass and fuel type", params: "mass, fuel_type" },
      { name: "obd-check.py", desc: "OBD compliance verification", params: "diagnostic_codes" },
    ],
    template: `{"sections":[{"id":"vehicle-info","title":"Vehicle Info","type":"fields"},{"id":"emission-results","title":"Emission Test Results","type":"table"},{"id":"assessment","title":"Compliance Assessment","type":"markdown"}]}`,
    skillmd: `## EU VWTA Emissions\n\n### Execution Flow\n1. Identify vehicle powertrain and fuel type\n2. Load applicable R83/R154 references\n3. Calculate emission limits via scripts\n4. Compare measured vs limit values\n5. Issue PASS/FAIL`,
  },
  {
    id: "un-r13-braking",
    name: "UN R13 Braking",
    description: "Braking system type approval for passenger vehicles and light commercial vehicles per UN R13.",
    standards: ["UN R13"],
    lastUsed: "1w ago",
    usedCount: 12,
    triggers: ["braking", "R13", "brake", "ABS"],
    references: [
      { name: "un-r13.md", clauses: "§5.2, §5.3, Annex 3" },
      { name: "common-pitfalls.md", clauses: "General" },
    ],
    scripts: [
      { name: "brake-calc.py", desc: "Braking efficiency and deceleration calculation", params: "mass, speeds, brake_force" },
    ],
    template: `{"sections":[{"id":"vehicle-info","title":"Vehicle Info","type":"fields"},{"id":"brake-tests","title":"Brake Test Results","type":"table"},{"id":"assessment","title":"Compliance Assessment","type":"markdown"}]}`,
    skillmd: `## UN R13 Braking\n\n### Execution Flow\n1. Identify vehicle category and mass\n2. Load R13 references\n3. Run brake efficiency calculation\n4. Check ABS / secondary brake requirements\n5. Issue PASS/FAIL`,
  },
];
