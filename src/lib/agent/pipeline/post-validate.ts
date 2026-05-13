import type { PipelineContext } from "./pipeline-context";

export interface ValidationError {
  type:
    | "citation-mismatch"
    | "template-incomplete"
    | "verdict-inconsistent"
    | "source-mismatch"
    | "chunk-mismatch"
    | "chunk-missing"
    | "step-missing";
  message: string;
}

/**
 * Post-validate the pipeline output after all steps complete.
 * Checks cross-cutting concerns that span multiple steps.
 */
export function postValidate(ctx: PipelineContext): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Layer 4+5: Claims-based validation (structural) ──
  if (ctx.claims && ctx.claims.length > 0) {
    const citationRefs = new Set(ctx.compiledCitations.map(c => c.ref));
    const sourceRefs = new Set(ctx.compiledSourceCitations.map(c => c.ref));

    for (const claim of ctx.claims) {
      // citationRef may be comma-separated: "R48.6.2, S1" — deprecated; use dedicated sourceRef/chunkRef
      const parts = claim.citationRef.split(/[,\s]+/).filter(Boolean);
      if (parts.length > 1) {
        console.warn(`[DEPRECATED] citationRef "${claim.citationRef}" uses comma-separated format — move S-refs to sourceRef/chunkRef`);
      }
      for (const part of parts) {
        if (part.startsWith("R")) {
          if (!citationRefs.has(part)) {
            const entry = ctx.citationPalette.find(e => e.id === part);
            if (entry) {
              ctx.compiledCitations.push({
                ref: entry.id, regulation: entry.regulation, clause: entry.clause,
              });
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
            const entry = ctx.sourcePalette.find(e => e.id === num);
            if (entry) {
              ctx.compiledSourceCitations.push({
                ref: entry.id, fileId: entry.fileId, filename: entry.filename,
                fileUrl: entry.dataUrl, extractedText: entry.extractedText,
                keyExcerpt: entry.keyExcerpt, pageNumber: entry.pageNumber,
              });
              sourceRefs.add(entry.id);
            } else {
              errors.push({
                type: "source-mismatch",
                message: `Claim "${claim.statement.slice(0, 80)}" cites [${part}] which is not in the source palette`,
              });
            }
          }
        }
      }
      // Also check the dedicated sourceRef field
      if (claim.sourceRef && !sourceRefs.has(claim.sourceRef)) {
        const entry = ctx.sourcePalette.find(e => e.id === claim.sourceRef);
        if (entry) {
          ctx.compiledSourceCitations.push({
            ref: entry.id, fileId: entry.fileId, filename: entry.filename,
            fileUrl: entry.dataUrl, extractedText: entry.extractedText,
            keyExcerpt: entry.keyExcerpt, pageNumber: entry.pageNumber,
          });
          sourceRefs.add(entry.id);
        } else {
          errors.push({
            type: "source-mismatch",
            message: `Claim "${claim.statement.slice(0, 80)}" cites [S${claim.sourceRef}] which is not in the source palette`,
          });
        }
      }
    }
  }

  // ── ChunkRef validation (Phase 4) ──
  const chunkErrors = validateClaimChunks(ctx);
  errors.push(...chunkErrors);

  if (!ctx.reportSections) return errors;

  // Flatten all text content from report sections
  const allContent = Object.values(ctx.reportSections)
    .map((s) => (typeof s === "string" ? s : Object.values(s).join(" ")))
    .join(" ");

  // 1. Extract all [R48.5.11] markers → cross-reference with compiledCitations
  const regulationMarkers = [...allContent.matchAll(/\[(R\d+\.\d+(?:\.\d+)*)\]/g)].map((m) =>
    m[1]
  );
  const uniqueRegulationMarkers = [...new Set(regulationMarkers)];
  const citationRefs = new Set(ctx.compiledCitations.map((c) => c.ref));

  for (const marker of uniqueRegulationMarkers) {
    if (!citationRefs.has(marker)) {
      errors.push({
        type: "citation-mismatch",
        message: `[${marker}] appears in content but not in compiledCitations (available: ${[...citationRefs].join(", ")})`,
      });
    }
  }

  // 2. Extract all [SN] markers → cross-reference with compiledSourceCitations
  const sourceMarkers = [...allContent.matchAll(/\[S(\d+)\]/g)].map((m) =>
    parseInt(m[1], 10)
  );
  const uniqueSourceMarkers = [...new Set(sourceMarkers)];
  const sourceRefs = new Set(ctx.compiledSourceCitations.map((c) => c.ref));

  for (const marker of uniqueSourceMarkers) {
    if (!sourceRefs.has(marker)) {
      errors.push({
        type: "source-mismatch",
        message: `[S${marker}] appears in content but not in compiledSourceCitations`,
      });
    }
  }

  // 3. Verify template completeness
  if (ctx.skill.template) {
    for (const section of ctx.skill.template.sections) {
      const sectionValue = ctx.reportSections[section.id];
      if (sectionValue === undefined || sectionValue === null) {
        errors.push({
          type: "template-incomplete",
          message: `Template section "${section.id}" is missing`,
        });
      }
    }
  }

  // 4. Verify verdict consistency
  if (ctx.verdict) {
    const reportVerdict = ctx.reportSections["verdict"];
    if (
      typeof reportVerdict === "string" &&
      reportVerdict !== ctx.verdict
    ) {
      errors.push({
        type: "verdict-inconsistent",
        message: `Report says "${reportVerdict}" but computed verdict is "${ctx.verdict}"`,
      });
    }
  }

  return errors;
}

/**
 * Validate chunkRefs on claims only — used for retry decisions.
 * Checks format, existence, and cross-checks chunk text against claim statement.
 * Returns errors without mutating context.
 */
export function validateClaimChunks(ctx: PipelineContext): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!ctx.claims || ctx.claims.length === 0) return errors;

  for (const claim of ctx.claims) {
    if (!claim.chunkRef) continue;
    const match = claim.chunkRef.match(/^S(\d+)\.(.+)$/);
    if (!match) {
      errors.push({
        type: "chunk-mismatch",
        message: `Claim "${claim.statement.slice(0, 80)}" has invalid chunkRef "${claim.chunkRef}" — expected format S{file}.c{chunk}`,
      });
      continue;
    }
    const fileRef = parseInt(match[1], 10);
    const chunkId = match[2];
    const sourceEntry = ctx.sourcePalette.find(e => e.id === fileRef);
    if (!sourceEntry) {
      errors.push({
        type: "chunk-missing",
        message: `Claim "${claim.statement.slice(0, 80)}" references S${fileRef} which is not in the source palette`,
      });
      continue;
    }
    if (!sourceEntry.chunks) {
      continue;
    }
    const chunk = sourceEntry.chunks.find(c => c.id === chunkId);
    if (!chunk) {
      errors.push({
        type: "chunk-missing",
        message: `Claim "${claim.statement.slice(0, 80)}" references chunk ${claim.chunkRef} which does not exist (file has ${sourceEntry.chunks.length} chunks)`,
      });
      continue;
    }
    const claimWords = claim.statement.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    const chunkLower = chunk.text.toLowerCase();
    const matchCount = claimWords.filter(w => chunkLower.includes(w)).length;
    const chunkWordCount = chunkLower.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2).length;
    // Skip fuzzy match when claim is much longer than chunk — extra context (VIN, regulation refs, values)
    // naturally appears in the claim but not in the source chunk
    const skipValidation = claimWords.length > 15 && claimWords.length > chunkWordCount * 3;
    if (!skipValidation && claimWords.length >= 3 && matchCount < Math.ceil(claimWords.length * 0.25)) {
      errors.push({
        type: "chunk-mismatch",
        message: `Claim "${claim.statement.slice(0, 80)}" may not match chunk ${claim.chunkRef} text: "${chunk.text.slice(0, 80)}"`,
      });
    }
  }
  return errors;
}
