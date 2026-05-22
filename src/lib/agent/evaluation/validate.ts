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
              mutableCitations.push(entry as any);
              citationRefs.add(entry.id);
            } else {
              errors.push({
                type: "citation-mismatch",
                message: `Claim "${claim.statement.slice(0, 80)}" cites [${part}] which is not in the citation palette`,
              });
            }
          }
        } else if (part.startsWith("S")) {
          const num = parseInt(part.slice(1), 10);
          if (!isNaN(num) && !sourceRefs.has(num)) {
            const entry = sourcePalette.find((e) => e.id === num);
            if (entry) {
              mutableSourceCitations.push(entry as any);
              sourceRefs.add(entry.id);
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

  const sourceMarkers = [...reportContent.matchAll(/\[S(\d+)\]/g)].map((m) => parseInt(m[1], 10));
  for (const marker of [...new Set(sourceMarkers)]) {
    if (!sourceRefs.has(marker)) {
      errors.push({
        type: "source-mismatch",
        message: `[S${marker}] appears in content but not in compiledSourceCitations`,
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
    if (!claim.chunkRef) continue;
    const match = claim.chunkRef.match(/^S(\d+)\.(.+)$/);
    if (!match) {
      errors.push({
        type: "chunk-mismatch",
        message: `Claim "${claim.statement.slice(0, 80)}" has invalid chunkRef "${claim.chunkRef}"`,
      });
      continue;
    }
    const fileRef = parseInt(match[1], 10);
    const chunkId = match[2];
    const sourceEntry = sourcePalette.find((e) => e.id === fileRef);
    if (!sourceEntry) {
      errors.push({ type: "chunk-missing", message: `Claim references S${fileRef} not in source palette` });
      continue;
    }
    if (!sourceEntry.chunks) continue;

    const chunk = sourceEntry.chunks.find((c) => c.id === chunkId);
    if (!chunk) {
      errors.push({ type: "chunk-missing", message: `Claim references chunk ${claim.chunkRef} which does not exist` });
      continue;
    }
    // Word overlap check
    const claimWords = claim.statement.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
    const chunkLower = chunk.text.toLowerCase();
    const matchCount = claimWords.filter((w) => chunkLower.includes(w)).length;
    if (claimWords.length >= 3 && matchCount < Math.ceil(claimWords.length * 0.25)) {
      errors.push({
        type: "chunk-mismatch",
        message: `Claim "${claim.statement.slice(0, 80)}" may not match chunk ${claim.chunkRef}`,
      });
    }
  }
  return errors;
}
