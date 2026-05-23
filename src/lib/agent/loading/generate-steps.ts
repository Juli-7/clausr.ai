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
  if (c.description) parts.push(`Description: ${c.description}`);
  if (c.constraint || c.type.kind === "number") {
    parts.push("You MUST call the compliance-check tool to validate numerical constraints.");
  }
  if (c.sample) parts.push(`Example output:\n\`\`\`json\n{"${c.field}": {"value": "${c.sample.replace(/"/g, "'")}", "sourceCitation": ["S1.c1"], "citationRef": ["${c.clause || ""}"], "verdict": "PASS"}}\n\`\`\``);
  parts.push("Output your analysis as a narrative paragraph, then output a JSON code block with the structured result.");
  return parts.join("\n");
}
