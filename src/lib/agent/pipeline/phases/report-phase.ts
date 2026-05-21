import { executeStep } from "../step-executor";
import { executeLlmStep } from "../executors/llm-executor";
import { ClaimSchema } from "@/lib/agent/schemas";
import { validateClaimChunks } from "../post-validate";
import { logPipeline } from "../logger";
import type { PipelineContext } from "../pipeline-context";
import type { ParsedStep } from "@/lib/agent/skill/step-parser";

export async function reportPhase(
  ctx: PipelineContext,
  steps: ParsedStep[],
  maxStepNum: number
): Promise<void> {
  if (ctx.useTemplate && ctx.skill.template && ctx.checks.getResults().length > 0) {
    logPipeline("→ AUTO: compiling compliance report");

    const reportStep: ParsedStep = {
      number: maxStepNum + 1,
      title: "Compile compliance report with clause citations",
      type: "llm",
      instructions: "Compile the final compliance report using the check results, citation palette, and template format above. Output valid JSON with content and sections matching the template structure. Every field value MUST end with citation markers.",
      temperature: 0.2,
    };

    const reportResult = await executeStep(reportStep, ctx, 1);
    if (reportResult.success) {
      const output = ctx.steps.read(reportStep.number);
      if (output && typeof output === "object") {
        const obj = output as Record<string, unknown>;
        if (obj.sections && typeof obj.sections === "object") {
          ctx.report.setContent(obj.sections as Record<string, Record<string, string> | string>);
          logPipeline(`  ✓ auto report: sections=${Object.keys(ctx.report.getSections() ?? {}).join(", ")}`);
        }
        if (obj.claims && Array.isArray(obj.claims)) {
          const parsed = ClaimSchema.array().safeParse(obj.claims);
          if (parsed.success) {
            ctx.checks.addClaims(parsed.data);
            logPipeline(`  ✓ auto report: ${ctx.checks.getClaims().length} claims extracted`);
            ctx.checks.buildCitationsFromClaims(
              [...ctx.palette.getCitationPalette()],
              ctx.files.getSourcePalette()
            );
          } else {
            logPipeline(`  ⚠ claims validation: ${parsed.error.issues.length} issue(s) — ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
          }
        }
      }

      if (reportResult.success && ctx.checks.getClaims().length > 0) {
        const chunkErrors = validateClaimChunks(ctx);
        if (chunkErrors.length > 0) {
          logPipeline(`  ⚠ chunk validation: ${chunkErrors.length} issue(s), retrying report step once`);
          const retryErrorMsg = "Chunk reference validation errors in previous attempt:\n" +
            chunkErrors.map(e => `- ${e.message}`).join("\n") +
            "\n\nPlease fix the chunkRef values on the claims to match the actual chunk IDs shown in the source files.";
          const retryResult = await executeLlmStep(reportStep, ctx, retryErrorMsg);
          if (retryResult.success) {
            const retryOutput = ctx.steps.read(reportStep.number);
            if (retryOutput && typeof retryOutput === "object") {
              const robj = retryOutput as Record<string, unknown>;
              if (robj.sections && typeof robj.sections === "object") {
                ctx.report.setContent(robj.sections as Record<string, Record<string, string> | string>);
                logPipeline(`  ✓ retry report: sections=${Object.keys(ctx.report.getSections() ?? {}).join(", ")}`);
              }
              if (robj.claims && Array.isArray(robj.claims)) {
                const retryParsed = ClaimSchema.array().safeParse(robj.claims);
                if (retryParsed.success) {
                  ctx.checks.addClaims(retryParsed.data);
                  logPipeline(`  ✓ retry report: ${ctx.checks.getClaims().length} claims extracted`);
                  ctx.checks.buildCitationsFromClaims(
                    [...ctx.palette.getCitationPalette()],
                    ctx.files.getSourcePalette()
                  );
                } else {
                  logPipeline(`  ⚠ retry claims validation: ${retryParsed.error.issues.length} issue(s)`);
                }
              }
            }
            const retryChunkErrors = validateClaimChunks(ctx);
            if (retryChunkErrors.length > 0) {
              logPipeline(`  ⚠ retry still has ${retryChunkErrors.length} chunk issue(s) — surfacing as validation errors`);
            } else {
              logPipeline(`  ✓ chunk validation passed after retry`);
            }
          } else {
            logPipeline(`  ⚠ retry failed: ${retryResult.error}`);
          }
        }
      }
    } else {
      logPipeline(`  ⚠ auto report failed: ${reportResult.error}`);
    }
  } else if (ctx.checks.getResults().length > 0) {
    const sourcePalette = ctx.files.getSourcePalette();
    const lines = ctx.checks.getResults().map(c =>
      `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef}]${c.sourceRef ? ` [S${c.sourceRef}]` : ""}`
    );
    if (sourcePalette.length > 0) {
      const sourceMarkers = sourcePalette.map(s => `[S${s.id}]`).join(" ");
      lines.push(`\nSources: ${sourceMarkers}`);
    }
    ctx.report.setContent({
      assessment: lines.join("\n\n"),
    });
  }

  const reportContent = ctx.report.getAllContentFlat();
  if (reportContent) {
    ctx.checks.supplementFromContent(
      reportContent,
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette()
    );
  }
}
