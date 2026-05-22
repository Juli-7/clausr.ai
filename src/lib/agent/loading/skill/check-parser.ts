import { z } from "zod";

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
 * e.g. "R48 §6.2" → "R48", "R112 §5.5" → "R112"
 */
export function extractRegulationIds(checks: ParsedCheck[]): string[] {
  const ids = new Set<string>();
  for (const check of checks) {
    if (check.clause) {
      const match = check.clause.match(/R(\d+)/);
      if (match) ids.add(`R${match[1]}`);
    }
  }
  return [...ids].sort();
}

/**
 * Build a Zod schema from the Checks table.
 * Generates an object schema from field paths like "vehicle.make" → nested object.
 */
export function deriveDomainSchema(checks: ParsedCheck[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const grouped = groupFieldsByPrefix(checks);

  for (const [prefix, fields] of Object.entries(grouped)) {
    if (prefix === "") {
      for (const check of fields) {
        shape[check.field] = fieldTypeToZod(check);
      }
    } else {
      shape[prefix] = z.object(buildNestedShape(fields));
    }
  }

  return z.object(shape);
}

/**
 * Try to match a field path against the Checks table to find the relevant check definition.
 */
export function findCheck(fieldPath: string, checks: ParsedCheck[]): ParsedCheck | undefined {
  return checks.find((c) => c.field === fieldPath);
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

function groupFieldsByPrefix(checks: ParsedCheck[]): Record<string, ParsedCheck[]> {
  const groups: Record<string, ParsedCheck[]> = {};
  for (const check of checks) {
    const dot = check.field.indexOf(".");
    const prefix = dot > 0 ? check.field.slice(0, dot) : "";
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push({
      ...check,
      field: dot > 0 ? check.field.slice(dot + 1) : check.field,
    });
  }
  return groups;
}

function buildNestedShape(fields: ParsedCheck[]): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const check of fields) {
    shape[check.field] = fieldTypeToZod(check);
  }
  return shape;
}

function fieldTypeToZod(check: ParsedCheck): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (check.type.kind) {
    case "string":
      schema = z.string();
      break;
    case "number":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "enum":
      schema = z.enum(check.type.values as [string, ...string[]]);
      break;
    default:
      schema = z.any();
  }

  if (check.constraint === "required") {
    // keep as required (no .optional())
  } else {
    schema = schema.optional();
  }

  return schema;
}


