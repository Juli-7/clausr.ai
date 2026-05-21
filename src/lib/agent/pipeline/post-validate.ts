import type { PipelineContext, CheckResult } from "./pipeline-context";
import type { ParsedStep } from "@/lib/agent/skill/step-parser";

export interface ValidationError {
  type:
    | "citation-mismatch"
    | "verdict-inconsistent"
    | "source-mismatch"
    | "chunk-mismatch"
    | "chunk-missing"
    | "step-missing";
  message: string;
}

export function postValidate(
  ctx: PipelineContext,
  steps?: ParsedStep[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Step completeness check
  if (steps && steps.length > 0) {
    for (const step of steps) {
      const output = ctx.steps.read(step.number);
      if (output === undefined || output === null) {
        errors.push({
          type: "step-missing",
          message: `Step ${step.number} "${step.title}" produced no output`,
        });
      }
    }
  }

  const checks = ctx.checks;
  const palette = ctx.palette;
  const sourcePalette = ctx.files.getSourcePalette();
  const citations = [...checks.getCitations()];
  const sourceCitations = [...checks.getSourceCitations()];
  const claims = checks.getClaims();

  if (claims.length > 0) {
    const citationRefs = new Set(citations.map(c => c.ref));
    const sourceRefs = new Set(sourceCitations.map(c => c.ref));

    for (const claim of claims) {
      const parts = claim.citationRef.split(/[,\s]+/).filter(Boolean);
      if (parts.length > 1) {
        console.warn(`[DEPRECATED] citationRef "${claim.citationRef}" uses comma-separated format — move S-refs to sourceRef/chunkRef`);
      }
      for (const part of parts) {
        if (part.startsWith("R")) {
          if (!citationRefs.has(part)) {
            const entry = palette.getCitationPalette().find(e => e.id === part);
            if (entry) {
              citations.push({
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
            const entry = sourcePalette.find(e => e.id === num);
            if (entry) {
              sourceCitations.push({
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
      if (claim.sourceRef && !sourceRefs.has(claim.sourceRef)) {
        const entry = sourcePalette.find(e => e.id === claim.sourceRef);
        if (entry) {
          sourceCitations.push({
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

  const chunkErrors = validateClaimChunks(ctx);
  errors.push(...chunkErrors);

  const sections = ctx.report.getSections();
  if (!sections) return errors;

  const allContent = Object.values(sections)
    .map((s) => (typeof s === "string" ? s : Object.values(s).join(" ")))
    .join(" ");

  const regulationMarkers = [...allContent.matchAll(/\[(R\d+\.\d+(?:\.\d+)*)\]/g)].map((m) => m[1]);
  const uniqueRegulationMarkers = [...new Set(regulationMarkers)];
  const citationRefs = new Set(citations.map((c) => c.ref));

  for (const marker of uniqueRegulationMarkers) {
    if (!citationRefs.has(marker)) {
      errors.push({
        type: "citation-mismatch",
        message: `[${marker}] appears in content but not in compiledCitations (available: ${[...citationRefs].join(", ")})`,
      });
    }
  }

  const sourceMarkers = [...allContent.matchAll(/\[S(\d+)\]/g)].map((m) => parseInt(m[1], 10));
  const uniqueSourceMarkers = [...new Set(sourceMarkers)];
  const sourceRefs = new Set(sourceCitations.map((c) => c.ref));

  for (const marker of uniqueSourceMarkers) {
    if (!sourceRefs.has(marker)) {
      errors.push({
        type: "source-mismatch",
        message: `[S${marker}] appears in content but not in compiledSourceCitations`,
      });
    }
  }

  const verdict = ctx.report.getVerdict();
  if (verdict) {
    const reportVerdict = sections["verdict"];
    if (typeof reportVerdict === "string" && reportVerdict !== verdict) {
      errors.push({
        type: "verdict-inconsistent",
        message: `Report says "${reportVerdict}" but computed verdict is "${verdict}"`,
      });
    }
  }

  return errors;
}

export function validateClaimChunks(ctx: PipelineContext): ValidationError[] {
  const errors: ValidationError[] = [];
  const claims = ctx.checks.getClaims();
  if (claims.length === 0) return errors;
  const sourcePalette = ctx.files.getSourcePalette();

  for (const claim of claims) {
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
    const sourceEntry = sourcePalette.find(e => e.id === fileRef);
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
