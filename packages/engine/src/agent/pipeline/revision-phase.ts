import { logPipeline } from "../pipeline/logger";
import type { ParsedCheck } from "../loading/skill/check-parser";

/**
 * Map explicit field names to step numbers for targeted revision.
 * Steps are generated 1:1 from checks in order.
 */
export function identifyRevisionTargets(
  revisionFields: string[],
  checks: ParsedCheck[]
): number[] {
  const stepNumbers: number[] = [];
  for (const field of revisionFields) {
    const idx = checks.findIndex((c) => c.field === field);
    if (idx !== -1) {
      stepNumbers.push(idx + 1);
    }
  }
  const unique = [...new Set(stepNumbers)].sort((a, b) => a - b);
  logPipeline(`[REVISION] explicit targets: fields=${revisionFields.join(",")} → steps=${unique.join(",")}`);
  return unique;
}
