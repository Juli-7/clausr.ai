import type { CitationPaletteEntry } from "./pipeline-context";

/**
 * Build a map of regulation.clause → clause text from the citation palette.
 * Used for displaying regulation clause text in the response.
 */
export function buildClauseTextsFromPalette(
  palette: CitationPaletteEntry[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of palette) {
    const key = `${entry.regulation}.${entry.clause}`;
    if (!map[key]) {
      map[key] = entry.text;
    }
  }
  return map;
}
