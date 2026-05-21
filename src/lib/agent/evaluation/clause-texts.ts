import type { CitationPaletteEntry } from "@/lib/agent/pipeline/pipeline-context";

/**
 * Build a map of regulation.clause → clause text from the citation palette.
 * Used for displaying regulation clause text in popovers and exports.
 */
export function buildClauseTextsFromPalette(
  palette: readonly CitationPaletteEntry[]
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
