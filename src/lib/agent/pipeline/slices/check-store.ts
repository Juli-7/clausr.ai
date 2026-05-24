import type { Citation, Claim, SourceCitation } from "@/lib/agent/shared/schemas";
import type { CheckResult, CitationPaletteEntry, SourcePaletteEntry } from "../pipeline-context";
import { logPipeline } from "../logger";

export class CheckStore {
  private checkResults: CheckResult[] = [];
  private claims: Claim[] = [];
  private compiledCitations: Citation[] = [];
  private compiledSourceCitations: SourceCitation[] = [];

  addCheck(result: CheckResult): void {
    this.checkResults.push(result);
  }

  addResults(results: CheckResult[]): void {
    this.checkResults.push(...results);
  }

  removeResultsForField(field: string): CheckResult[] {
    const removed: CheckResult[] = [];
    this.checkResults = this.checkResults.filter((r) => {
      if (r.name === field) {
        removed.push(r);
        return false;
      }
      return true;
    });
    return removed;
  }

  getResults(): readonly CheckResult[] {
    return this.checkResults;
  }

  addClaims(claims: Claim[]): void {
    this.claims = claims;
  }

  getClaims(): readonly Claim[] {
    return this.claims;
  }

  getCitations(): readonly Citation[] {
    return this.compiledCitations;
  }

  getSourceCitations(): readonly SourceCitation[] {
    return this.compiledSourceCitations;
  }

  /**
   * Compile citations from check results + palette (deterministic).
   * Call after checkResults are populated.
   */
  compileCitations(
    citationPalette: CitationPaletteEntry[],
    sourcePalette: SourcePaletteEntry[]
  ): void {
    const citationMap = new Map<string, Citation>();
    const sourceMap = new Map<string, SourceCitation>();

    for (const check of this.checkResults) {
      for (const ref of check.citationRef) {
        if (!citationMap.has(ref)) {
          const entry = citationPalette.find((e) => e.id === ref);
          if (entry) {
            citationMap.set(ref, {
              ref: entry.id,
              regulation: entry.regulation,
              clause: entry.clause,
            });
          }
        }
      }

      for (const ref of check.sourceCitation) {
        if (!sourceMap.has(ref)) {
          const entry = sourcePalette.find((e) => e.id === ref);
          if (entry) {
            sourceMap.set(ref, {
              ref,
              fileId: entry.fileId,
              filename: entry.filename,
              fileUrl: entry.dataUrl,
              extractedText: entry.extractedText,
              keyExcerpt: entry.keyExcerpt,
              chunks: entry.chunks,
              boundingBox: entry.chunks?.[0]?.bbox,
              pageNumber: entry.pageNumber,
            });
          }
        }
      }
    }


    this.compiledCitations = Array.from(citationMap.values()).sort((a, b) =>
      a.ref.localeCompare(b.ref)
    );
    this.compiledSourceCitations = Array.from(sourceMap.values()).sort((a, b) =>
      a.ref.localeCompare(b.ref)
    );

    if (this.compiledCitations.length > 0 || this.compiledSourceCitations.length > 0) {
      logPipeline(
        `  [CHECK-STORE] compiled ${this.compiledCitations.length} regulation + ${this.compiledSourceCitations.length} source citations`
      );
    }
  }

  /**
   * Build citations from structured claims (Layer 5).
   * Merges with existing entries — never removes.
   */
  buildCitationsFromClaims(
    citationPalette: CitationPaletteEntry[],
    sourcePalette: SourcePaletteEntry[]
  ): void {
    if (this.claims.length === 0) return;

    const citationMap = new Map(this.compiledCitations.map((c) => [c.ref, c]));
    const sourceMap = new Map(this.compiledSourceCitations.map((s) => [s.ref, s]));

    for (const claim of this.claims) {
      if (claim.citationRef.startsWith("R") && !citationMap.has(claim.citationRef)) {
        const entry = citationPalette.find((e) => e.id === claim.citationRef);
        if (entry) {
          citationMap.set(claim.citationRef, {
            ref: entry.id,
            regulation: entry.regulation,
            clause: entry.clause,
          });
          logPipeline(`  [CHECK-STORE] added citation ${claim.citationRef} from claims`);
        }
      }
      if (claim.sourceCitation && !sourceMap.has(claim.sourceCitation)) {
        const entry = sourcePalette.find((e) => e.id === claim.sourceCitation);
        if (entry) {
          sourceMap.set(claim.sourceCitation, {
            ref: claim.sourceCitation,
            fileId: entry.fileId,
            filename: entry.filename,
            fileUrl: entry.dataUrl,
            extractedText: entry.extractedText,
            keyExcerpt: entry.keyExcerpt,
            chunks: entry.chunks,
            boundingBox: entry.chunks?.[0]?.bbox,
            pageNumber: entry.pageNumber,
          });
        }
      }
    }

    this.compiledCitations = Array.from(citationMap.values()).sort((a, b) =>
      a.ref.localeCompare(b.ref)
    );
    this.compiledSourceCitations = Array.from(sourceMap.values()).sort((a, b) =>
      a.ref.localeCompare(b.ref)
    );
  }

  /**
   * Supplement citations by scanning report content for [R48.x.x] and [SN] markers.
   * Backfills any missing entries.
   */
  supplementFromContent(
    content: string,
    citationPalette: CitationPaletteEntry[],
    sourcePalette: SourcePaletteEntry[]
  ): void {
    const citationRefs = new Set(this.compiledCitations.map((c) => c.ref));
    const regulationMarkers = [...content.matchAll(/\[(R\d+\.\d+(?:\.\d+)*)\]/g)].map((m) => m[1]);

    for (const marker of [...new Set(regulationMarkers)]) {
      if (!citationRefs.has(marker)) {
        const entry = citationPalette.find((e) => e.id === marker);
        if (entry) {
          this.compiledCitations.push({
            ref: entry.id,
            regulation: entry.regulation,
            clause: entry.clause,
          });
          logPipeline(`  [CHECK-STORE] supplemented citation ${marker} from content`);
        }
      }
    }

    const sourceRefs = new Set(this.compiledSourceCitations.map((c) => c.ref));
    const sourceMarkers = [...content.matchAll(/\[(S\d+\.\S+?)\]/g)].map((m) => m[1]);

    for (const marker of [...new Set(sourceMarkers)]) {
      if (!sourceRefs.has(marker)) {
        const entry = sourcePalette.find((e) => e.id === marker);
        if (entry) {
          this.compiledSourceCitations.push({
            ref: marker,
            fileId: entry.fileId,
            filename: entry.filename,
            fileUrl: entry.dataUrl,
            extractedText: entry.extractedText,
            keyExcerpt: entry.keyExcerpt,
            chunks: entry.chunks,
            boundingBox: entry.chunks?.[0]?.bbox,
            pageNumber: entry.pageNumber,
          });
        }
      }
    }
  }

  computeVerdict(): "PASS" | "FAIL" {
    if (this.checkResults.length === 0) return "PASS";
    return this.checkResults.some((c) => c.verdict === "FAIL") ? "FAIL" : "PASS";
  }

  get failureCount(): number {
    return this.checkResults.filter((c) => c.verdict === "FAIL").length;
  }
}
