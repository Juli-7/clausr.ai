import type { ParsedCheck } from "../loading/skill/check-parser";
import type { ExecutableStep } from "../pipeline/types";

export function generateStepsFromChecks(
  checks: ParsedCheck[],
  regulationIds?: string[]
): ExecutableStep[] {
  return checks.map((c, i) => ({
    number: i + 1,
    title: `Evaluate: ${c.field}`,
    type: "llm+tool" as const,
    instructions: buildFieldInstructions(c, regulationIds),
    attention: c.attention ?? undefined,
    dependsOn: c.dependsOn ?? undefined,
  }));
}

function buildFieldInstructions(c: ParsedCheck, regulationIds?: string[]): string {
  const searchTerm = c.attention || c.field;
  const parts: string[] = [];
  parts.push(`Retrieve relevant chunks. Search the context for "${searchTerm}".`);
  parts.push(`Type: ${c.type.kind}${c.type.kind === "enum" ? ` (${c.type.values.join("|")})` : ""}`);
  if (c.constraint) parts.push(`Constraint: ${c.constraint}`);
  if (c.rounding !== null) parts.push(`Rounding: ${c.rounding} — pass this as the "rounding" field to the compliance-check tool (e.g., "2" for standard, "2:ceil" for ceiling, "2:floor" for floor)`);
  if (c.clause) {
    parts.push(`Regulation clause: ${c.clause}`);
  } else if (regulationIds && regulationIds.length > 0) {
    parts.push(`Relevant regulations: ${regulationIds.join(", ")} — cite the most applicable clause from the Available Regulations.`);
  }
  if (c.dependsOn) parts.push(`Conditional on: ${c.dependsOn} — check this field's value first`);
  if (c.description) parts.push(`Description: ${c.description}`);
  if (c.sample) parts.push(`Example output:\n\`\`\`json\n{"${c.field}": {"value": "${c.sample.replace(/"/g, "'")}", "sourceCitation": ["S1.c1", "S1.c2"], "citationRef": ["${c.clause || regulationIds?.[0] || ""}"], "verdict": "PASS"}}\n\`\`\``);
  return parts.join("\n");
}
