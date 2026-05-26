import type { Claim, Citation, SourceCitation } from "@/lib/agent/shared/schemas";
import type { CitationPaletteEntry, SourcePaletteEntry } from "@/lib/agent/pipeline/pipeline-context";

export interface ValidationError {
  type:
    | "citation-mismatch"
    | "source-mismatch"
    | "chunk-mismatch"
    | "chunk-missing"
    | "step-missing";
  message: string;
}

/**
 * Validate the evaluation result for consistency and completeness.
 * Operates on plain data — no PipelineContext dependency.
 */
export function validate({
  claims,
  citations,
  sourceCitations,
  citationPalette,
  sourcePalette,
  reportContent,
}: {
  claims: readonly Claim[];
  citations: readonly Citation[];
  sourceCitations: readonly SourceCitation[];
  citationPalette: readonly CitationPaletteEntry[];
  sourcePalette: SourcePaletteEntry[];
  reportContent: string | null;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  const citationRefs = new Set(citations.map((c) => c.ref));
  const sourceRefs = new Set(sourceCitations.map((c) => c.ref));

  const mutableCitations = [...citations];
  const mutableSourceCitations = [...sourceCitations];

  if (claims.length > 0) {
    for (const claim of claims) {
      const parts = claim.citationRef.split(/[,\s]+/).filter(Boolean);
      for (const part of parts) {
        if (part.startsWith("R")) {
          if (!citationRefs.has(part)) {
            const entry = citationPalette.find((e) => e.id === part);
            if (entry) {
              mutableCitations.push({ ref: entry.id, regulation: entry.regulation, clause: entry.clause });
              citationRefs.add(entry.id);
            } else {
              errors.push({
                type: "citation-mismatch",
                message: `Claim "${claim.statement.slice(0, 80)}" cites [${part}] which is not in the citation palette`,
              });
            }
          }
        } else if (part.startsWith("S")) {
          if (!sourceRefs.has(part)) {
            const entry = sourcePalette.find((e) => e.id === part);
            if (entry) {
              mutableSourceCitations.push({
                ref: entry.id,
                fileId: entry.fileId,
                filename: entry.filename,
                fileUrl: entry.dataUrl,
                extractedText: entry.extractedText,
                keyExcerpt: entry.keyExcerpt,
                chunks: entry.chunks,
                boundingBox: entry.chunks?.[0]?.bbox,
                pageNumber: entry.pageNumber,
              } as SourceCitation);
              sourceRefs.add(part);
            }
          }
        }
      }
    }
  }

  const chunkErrors = validateClaimChunks(claims, sourcePalette);
  errors.push(...chunkErrors);

  if (!reportContent) return errors;

  const regulationMarkers = [...reportContent.matchAll(/\[(R\d+\.\d+(?:\.\d+)*)\]/g)].map((m) => m[1]);
  for (const marker of [...new Set(regulationMarkers)]) {
    if (!citationRefs.has(marker)) {
      errors.push({
        type: "citation-mismatch",
        message: `[${marker}] appears in content but not in compiledCitations`,
      });
    }
  }

  const sourceMarkers = [...reportContent.matchAll(/\[(S\d+\.\S+?)\]/g)].map((m) => m[1]);
  for (const marker of [...new Set(sourceMarkers)]) {
    if (!sourceRefs.has(marker)) {
      errors.push({
        type: "source-mismatch",
        message: `[${marker}] appears in content but not in compiledSourceCitations`,
      });
    }
  }

  return errors;
}

function validateClaimChunks(
  claims: readonly Claim[],
  sourcePalette: SourcePaletteEntry[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (claims.length === 0) return errors;

  for (const claim of claims) {
    if (!claim.sourceCitation) continue;
    const sourceEntry = sourcePalette.find((e) => e.id === claim.sourceCitation);
    if (!sourceEntry) {
      errors.push({ type: "chunk-missing", message: `Claim references ${claim.sourceCitation} not in source palette` });
      continue;
    }
    const chunkText = sourceEntry.keyExcerpt;
    if (!chunkText) continue;
    const claimWords = claim.statement.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
    const chunkLower = chunkText.toLowerCase();
    const matchCount = claimWords.filter((w) => chunkLower.includes(w)).length;
    if (claimWords.length >= 3 && matchCount < Math.ceil(claimWords.length * 0.25)) {
      errors.push({
        type: "chunk-mismatch",
        message: `Claim "${claim.statement.slice(0, 80)}" may not match chunk ${claim.sourceCitation}`,
      });
    }
  }
  return errors;
}
