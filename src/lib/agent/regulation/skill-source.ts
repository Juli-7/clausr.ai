import { getRegulationApi } from "./regulation-api";
import type { Regulation } from "./regulation-types";

/**
 * Load full regulations by their IDs (e.g. "R48", "R112").
 * Uses the Regulation API (currently MockRegulationApi).
 * Throws if a regulation is not found — no file-based fallback.
 */
export async function loadRegulations(regulationIds: string[]): Promise<Regulation[]> {
  const api = getRegulationApi();
  const results: Regulation[] = [];

  for (const regId of regulationIds) {
    const resolved = api.resolveCode(regId);
    if (!resolved) continue;

    const result = await api.getRegulation({ code: resolved });
    if (result.success && result.data) {
      results.push(result.data);
    }
  }

  return results;
}

/**
 * Look up a single clause text from a regulation via the Regulation API.
 */
export async function getClauseTextAsync(
  regulation: string,
  clause: string
): Promise<string | null> {
  const api = getRegulationApi();
  const resolved = api.resolveCode(regulation);
  if (!resolved) return null;

  const result = await api.getClause({ regulationCode: resolved, clauseNumber: clause });
  if (result.success && result.data) {
    return result.data.text;
  }
  return null;
}
