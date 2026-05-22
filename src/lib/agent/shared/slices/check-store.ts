import type { Citation, Claim, SourceCitation } from "@/lib/agent/shared/schemas";
import type { CheckResult, CitationPaletteEntry, SourcePaletteEntry } from "@/lib/agent/pipeline/pipeline-context";
import { logPipeline } from "@/lib/agent/pipeline/logger";

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
    const sourceMap = new Map<number, SourceCitation>();

    for (const check of this.checkResults) {
      if (!citationMap.has(check.citationRef)) {
        const entry = citationPalette.find((e) => e.id === check.citationRef);
        if (entry) {
          citationMap.set(check.citationRef, {
            ref: entry.id,
            regulation: entry.regulation,
            clause: entry.clause,
          });
        }
      }

      if (check.sourceRef && !sourceMap.has(check.sourceRef)) {
        const entry = sourcePalette.find((e) => e.id === check.sourceRef);
        if (entry) {
          sourceMap.set(check.sourceRef, {
            ref: entry.id,
            fileId: entry.fileId,
            filename: entry.filename,
            fileUrl: entry.dataUrl,
            extractedText: entry.extractedText,
            keyExcerpt: entry.keyExcerpt,
            pageNumber: entry.pageNumber,
          });
        }
      }
    }

    if (sourceMap.size === 0 && sourcePalette.length > 0) {
      for (const entry of sourcePalette) {
        sourceMap.set(entry.id, {
          ref: entry.id,
          fileId: entry.fileId,
          filename: entry.filename,
          fileUrl: entry.dataUrl,
          extractedText: entry.extractedText,
          keyExcerpt: entry.keyExcerpt,
          pageNumber: entry.pageNumber,
        });
      }
    }

    this.compiledCitations = Array.from(citationMap.values()).sort((a, b) =>
      a.ref.localeCompare(b.ref)
    );
    this.compiledSourceCitations = Array.from(sourceMap.values()).sort((a, b) =>
      a.ref - b.ref
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

    const referencedChunks = new Map<number, Set<string>>();
    const firstChunkPerFile = new Map<number, string>();

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
      if (claim.sourceRef && !sourceMap.has(claim.sourceRef)) {
        const entry = sourcePalette.find((e) => e.id === claim.sourceRef);
        if (entry) {
          sourceMap.set(claim.sourceRef, {
            ref: entry.id,
            fileId: entry.fileId,
            filename: entry.filename,
            fileUrl: entry.dataUrl,
            extractedText: entry.extractedText,
            keyExcerpt: entry.keyExcerpt,
            pageNumber: entry.pageNumber,
          });
        }
      }
      if (claim.chunkRef) {
        const match = claim.chunkRef.match(/^S(\d+)\.(.+)$/);
        if (match) {
          const fileRef = parseInt(match[1], 10);
          const chunkId = match[2];
          if (!referencedChunks.has(fileRef)) referencedChunks.set(fileRef, new Set());
          referencedChunks.get(fileRef)!.add(chunkId);
          if (!firstChunkPerFile.has(fileRef)) {
            firstChunkPerFile.set(fileRef, chunkId);
          }
        }
      } else if (claim.sourceRef && !referencedChunks.has(claim.sourceRef)) {
        const refMatch = claim.citationRef.match(/S(\d+)\.?(\S+)?/);
        if (refMatch) {
          const fileRef = parseInt(refMatch[1], 10);
          const chunkId = refMatch[2] || undefined;
          if (!referencedChunks.has(fileRef)) referencedChunks.set(fileRef, new Set());
          if (chunkId) referencedChunks.get(fileRef)!.add(chunkId);
        }
      }
    }

    for (const [ref, source] of sourceMap) {
      const paletteEntry = sourcePalette.find((e) => e.id === ref);
      if (!paletteEntry?.chunks) continue;
      const refIds = referencedChunks.get(ref);
      if (refIds && refIds.size > 0) {
        const filteredChunks = paletteEntry.chunks.filter((c) => refIds.has(c.id));
        source.chunks = filteredChunks;
        const firstId = firstChunkPerFile.get(ref);
        const firstChunk = firstId ? filteredChunks.find((c) => c.id === firstId) : filteredChunks[0];
        if (firstChunk) {
          source.keyExcerpt = firstChunk.text;
        }
      }
    }

    this.compiledCitations = Array.from(citationMap.values()).sort((a, b) =>
      a.ref.localeCompare(b.ref)
    );
    this.compiledSourceCitations = Array.from(sourceMap.values()).sort((a, b) =>
      a.ref - b.ref
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
    const sourceMarkers = [...content.matchAll(/\[S(\d+)\]/g)].map((m) => parseInt(m[1], 10));

    for (const marker of [...new Set(sourceMarkers)]) {
      if (!sourceRefs.has(marker)) {
        const entry = sourcePalette.find((e) => e.id === marker);
        if (entry) {
          this.compiledSourceCitations.push({
            ref: entry.id,
            fileId: entry.fileId,
            filename: entry.filename,
            fileUrl: entry.dataUrl,
            extractedText: entry.extractedText,
            keyExcerpt: entry.keyExcerpt,
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
