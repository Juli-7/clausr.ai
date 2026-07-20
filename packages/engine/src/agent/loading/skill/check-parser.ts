// ── Parsed check type ──

export interface ParsedCheck {
  field: string;
  type: CheckFieldType;
  attention: string | null;
  constraint: string | null;
  clause: string | null;
  dependsOn: string | null;
  description: string | null;
  sample: string | null;
  rounding: string | null;
  testProcedure: string | null;
}

export type CheckFieldType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "enum"; values: string[] };

/**
 * Parse ## Checks section from SKILL.md into an array of ParsedCheck.
 *
 * Expected format:
 *   ## Checks
 *
 *   ### field_name
 *   1. **type**: boolean | string | number | number(0-100) | enum(a, b, c)
 *   2. **description**: Human-readable description
 *   3. **clause**: Art 4(7) | R13.5.2 | (none)
 *   4. **constraint**: >= 50 | <= 95 | range(500-1200) | (none)
 *   5. **depends_on**: other_field | (none)
 *   6. **sample**: Example narrative output for this field
 *
 * Lines are parsed by matching `**key**: value` pattern on numbered items.
 * Order does not matter — keys are matched by name.
 */
export function parseChecks(skillmd: string): ParsedCheck[] {
  const sectionStart = skillmd.indexOf("## Checks");
  if (sectionStart === -1) return [];

  let sectionEnd = skillmd.indexOf("\n## ", sectionStart + 1);
  if (sectionEnd === -1) sectionEnd = skillmd.length;

  const section = skillmd.substring(sectionStart, sectionEnd);
  const checks: ParsedCheck[] = [];

  const lines = section.split("\n");
  let current: Record<string, string> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("### ")) {
      if (current && current.field) {
        checks.push(buildCheck(current));
      }
      current = { field: line.substring(4).trim() };
    } else if (current && isNumberedItem(line)) {
      const parsed = parseNumberedLine(line);
      if (parsed) {
        current[parsed.key] = parsed.value;
      }
    }
  }

  if (current && current.field) {
    checks.push(buildCheck(current));
  }

  return checks;
}

// ── Helpers ──

function isNumberedItem(line: string): boolean {
  const t = line.trim();
  if (t.length < 5) return false;
  const first = t[0]!;
  if (first < "1" || first > "9") return false;
  return t.substring(1, 5) === ". **";
}

function parseNumberedLine(line: string): { key: string; value: string } | null {
  const colonIdx = line.indexOf("**:");
  if (colonIdx === -1) return null;

  const starStart = line.indexOf("**");
  if (starStart === -1 || starStart >= colonIdx) return null;

  const key = line.substring(starStart + 2, colonIdx).trim().toLowerCase().replace(/\s+/g, "_");
  const value = line.substring(colonIdx + 3).trim();

  if (value === "(none)" || value === "-" || value === "") {
    return { key, value: "" };
  }
  return { key, value };
}

function buildCheck(raw: Record<string, string>): ParsedCheck {
  const fieldType = parseFieldType(raw.type ?? "");

  return {
    field: raw.field ?? "",
    type: fieldType ?? { kind: "string" },
    attention: raw.attention || null,
    constraint: raw.constraint || null,
    clause: raw.clause || null,
    dependsOn: raw.depends_on || null,
    description: raw.description || null,
    sample: raw.sample || null,
    rounding: raw.rounding || null,
    testProcedure: raw.test_procedure || raw.testProcedure || null,
  };
}

function parseFieldType(raw: string): CheckFieldType | null {
  const trimmed = raw.trim().toLowerCase();

  if (trimmed === "boolean") return { kind: "boolean" };
  if (trimmed === "string") return { kind: "string" };

  if (trimmed.startsWith("number")) {
    const parenStart = trimmed.indexOf("(");
    if (parenStart !== -1) {
      const parenEnd = trimmed.indexOf(")", parenStart);
      if (parenEnd !== -1) {
        // number(0-100) -> constraint is the range, type is number
        // but constraint is stored separately; just return number type
        return { kind: "number" };
      }
    }
    return { kind: "number" };
  }

  if (trimmed.startsWith("enum")) {
    const parenStart = trimmed.indexOf("(");
    const parenEnd = trimmed.lastIndexOf(")");
    if (parenStart !== -1 && parenEnd !== -1 && parenEnd > parenStart) {
      const inner = trimmed.substring(parenStart + 1, parenEnd);
      const values = inner.split(",").map((v) => v.trim()).filter(Boolean);
      if (values.length > 0) return { kind: "enum", values };
    }
  }

  return null;
}

