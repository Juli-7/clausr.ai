// ── Parsed check type ──

export interface ParsedCheck {
  field: string;
  type: CheckFieldType;
  constraint: string | null;
  clause: string | null;
  dependsOn: string | null;
  notes: string | null;
}

export type CheckFieldType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "enum"; values: string[] };

/**
 * Parse ## Checks table from SKILL.md into an array of ParsedCheck.
 *
 * Recognizes a markdown table with columns:
 *   field | type | constraint | clause | depends_on | notes
 *
 * Only the first two columns (field, type) are required.
 */
export function parseChecks(skillmd: string): ParsedCheck[] {
  const sectionMatch = skillmd.match(
    /##\s*Checks\s*\n([\s\S]*?)(?=\n##\s|\n*$)/
  );
  if (!sectionMatch) return [];

  const section = sectionMatch[1];

  const rowRegex = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/gm;
  const checks: ParsedCheck[] = [];

  let match;
  while ((match = rowRegex.exec(section)) !== null) {
    const field = match[1].trim();
    const rawType = match[2].trim();
    const constraint = match[3].trim();
    const clause = match[4].trim();
    const dependsOn = match[5].trim();
    const notes = match[6].trim();

    if (!field || rawType === "-") continue;

    const fieldType = parseFieldType(rawType);
    if (!fieldType) continue;

    checks.push({
      field,
      type: fieldType,
      constraint: constraint && constraint !== "-" ? constraint : null,
      clause: clause && clause !== "-" ? clause : null,
      dependsOn: dependsOn && dependsOn !== "-" ? dependsOn : null,
      notes: notes && notes !== "-" ? notes : null,
    });
  }

  return checks;
}

/**
 * Extract unique regulation IDs from the clause column.
 * e.g. "R48 §6.2" → "R48", "R112 §5.5" → "R112", "Art 6" → "GDPR"
 */
export function extractRegulationIds(checks: ParsedCheck[]): string[] {
  const ids = new Set<string>();
  for (const check of checks) {
    if (check.clause) {
      const rMatch = check.clause.match(/R(\d+)/);
      if (rMatch) {
        ids.add(`R${rMatch[1]}`);
      } else {
        const artMatch = check.clause.match(/Art\s*(\d+)/i);
        if (artMatch) ids.add("GDPR");
      }
    }
  }
  return [...ids].sort();
}

// ── Helpers ──

function parseFieldType(raw: string): CheckFieldType | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "string") return { kind: "string" };
  if (trimmed === "number") return { kind: "number" };
  if (trimmed === "boolean") return { kind: "boolean" };

  const enumMatch = raw.match(/^enum\s*\(([^)]+)\)/i);
  if (enumMatch) {
    const values = enumMatch[1].split(",").map((v) => v.trim()).filter(Boolean);
    return { kind: "enum", values };
  }

  return null;
}


