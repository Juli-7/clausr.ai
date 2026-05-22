import type { ParsedCheck } from "@/lib/agent/loading/skill/check-parser";
import type { ExecutableStep } from "@/lib/agent/pipeline/types";

export function generateStepsFromChecks(checks: ParsedCheck[]): ExecutableStep[] {
  return checks.map((c, i) => ({
    number: i + 1,
    title: `Evaluate: ${c.field}`,
    type: "llm+tool" as const,
    instructions: buildFieldInstructions(c),
  }));
}

function buildFieldInstructions(c: ParsedCheck): string {
  const parts: string[] = [];
  parts.push(`Extract the value for '${c.field}' from the uploaded documents.`);
  parts.push(`Type: ${c.type.kind}${c.type.kind === "enum" ? ` (${c.type.values.join("|")})` : ""}`);
  if (c.constraint) parts.push(`Constraint: ${c.constraint}`);
  if (c.clause) parts.push(`Regulation clause: ${c.clause}`);
  if (c.dependsOn) parts.push(`Conditional on: ${c.dependsOn} — check this field's value first`);
  if (c.notes) parts.push(`Notes: ${c.notes}`);
  if (c.constraint || c.type.kind === "number") {
    parts.push("You MUST call the compliance-check tool to validate numerical constraints.");
  }
  parts.push("Output the result as structured data with citation markers like [R48.5.11].");
  return parts.join("\n");
}
