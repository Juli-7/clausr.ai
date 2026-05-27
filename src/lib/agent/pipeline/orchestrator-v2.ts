import { executeLlmToolStep } from "./executors/llm-executor";
import { restoreContext } from "./pipeline-context";
import { getDocStore } from "@/lib/agent/user-info/vector-store";
import { loadRegulationSummaries } from "./builtins";
import { initPipelineTurn } from "@/lib/agent/loading/phases/init-phase";
import { identifyRevisionTargets } from "@/lib/agent/pipeline/revision-phase";
import { saveContextSnapshot, getResponseCount } from "@/lib/agent/shared/memory/repository";
import { finalizePhase } from "@/lib/agent/present/phases/finalize-phase";
import { generateCorrelationId } from "./errors";
import { logPipeline, truncate } from "./logger";
import type { PipelineEvent, ExecutableStep, StepResult } from "./types";
import type { PipelineContext } from "./pipeline-context";

/**
 * Pipeline entry point — runs the LLM step-execution loop, evaluation,
 * and presentation for an already-set-up session.
 *
 * Loading layer sets up skill + steps + stores files in doc store.
 * Pipeline restores context, then loads regulation references +
 * file chunks from the doc store before executing steps.
 */
export async function* orchestratePipeline(
  sessionId: string,
  message: string,
  revisionFields?: string[]
): AsyncGenerator<PipelineEvent> {
  const correlationId = generateCorrelationId();

  // ── Restore context from DB (set up by loading layer) ──
  const restored = await restoreContext(sessionId, correlationId);
  if (!restored) {
    yield { type: "error", error: "Session has no setup data. Call POST /api/setup first.", code: "NO_SETUP" };
    return;
  }

  const { ctx, steps } = restored;
  logPipeline(`=== PIPELINE START === cid=${correlationId} session="${sessionId}" msg="${truncate(message, 100)}"`);

  const store = getDocStore();
  const storedFiles = await store.getFiles(sessionId);
  if (storedFiles.length > 0) {
    ctx.files.loadFiles(storedFiles);
    logPipeline(`loaded ${storedFiles.length} file(s) with ${storedFiles.reduce((s, f) => s + f.chunks.length, 0)} chunk(s) from doc store`);
  }

  await loadRegulationSummaries(ctx);
  logPipeline(`loaded ${ctx.palette.getSummaries().length} regulation summaries + ${ctx.palette.getCitationPalette().length} pre-loaded citation(s)`);

  // ── Per-turn initialization ──
  await initPipelineTurn(ctx, sessionId, message, correlationId);
  const turnNumber = getResponseCount(sessionId);

  // ── Revision identification (user-driven only) ──
  yield { type: "status", phase: `executing-${steps.length}-steps` };
  let revisionTargets = new Set<number>();
  if (revisionFields && revisionFields.length > 0) {
    const stepNums = identifyRevisionTargets(revisionFields, ctx.skill.checks);
    revisionTargets = new Set(stepNums);
    if (revisionTargets.size > 0) {
      yield { type: "status", phase: `revising-${revisionTargets.size}-steps` };
    }
  }

  // ── Step execution loop ──
  for (const step of steps) {
    const existingOutput = ctx.steps.read(step.number);
    const isTarget = revisionTargets.has(step.number);

    if (existingOutput !== undefined && !isTarget) {
      logPipeline(`→ STEP ${step.number}: using previous output (${revisionTargets.size} target(s))`);
      yield { type: "status", phase: `step-${step.number}`, stepTitle: step.title + " (reused)" };
      continue;
    }

    yield { type: "status", phase: `step-${step.number}`, stepTitle: step.title };
    logPipeline(`→ STEP ${step.number}: "${step.title}"${isTarget ? " [REVISION]" : ""}`);

    const checkField = ctx.skill.checks[step.number - 1]?.field;
    const savedResults = checkField ? ctx.checks.removeResultsForField(checkField) : [];

    const result = await executeStepWithRetry(step, ctx, 1, isTarget ? message : undefined);

    if (!result.success) {
      logPipeline(`✗ STEP ${step.number} FAILED: ${result.error}`);
      if (savedResults.length > 0) {
        ctx.checks.addResults(savedResults);
        logPipeline(`→ STEP ${step.number}: restored ${savedResults.length} previous result(s) after failure`);
      }
      yield {
        type: "error",
        error: `Step ${step.number} failed: ${result.error}`,
        code: result.errorCode ?? "STEP_FAILED",
        correlationId,
      };
      return;
    }

    if (result.streamedTokens && result.streamedTokens.length > 0) {
      for (const token of result.streamedTokens) {
        yield { type: "token", text: token, stepNumber: step.number };
      }
    }

    if (result.toolResults && result.toolResults.length > 0) {
      yield { type: "tool-result", stepNumber: step.number, results: result.toolResults };
    }

    const output = ctx.steps.read(step.number);
    logPipeline(`✓ STEP ${step.number} done. output: ${output ? truncate(JSON.stringify(output), 200) : "(none)"}`);

    if (ctx.checks.getResults().length > 0) {
      logPipeline(`  → ctx.checks now has ${ctx.checks.getResults().length} entries (from step ${step.number})`);

      // Tier 3: Lazily resolve any citationRefs from check results that aren't in the palette yet
      const checkRefs = ctx.checks.getResults().flatMap((r) => r.citationRef);
      await ctx.palette.resolveMissingRefs(checkRefs);

      // Also resolve any [R48.x.x] markers from the narrative text
      const fullContent = result.streamedTokens?.join("") ?? "";
      if (fullContent) {
        const contentRefs = [...fullContent.matchAll(/\[(R\d+\.\d+(?:\.\d+)*)\]/g)].map((m) => m[1]);
        await ctx.palette.resolveMissingRefs(contentRefs);
      }

      // Compile citations (deterministic — already resolved above)
      ctx.checks.compileCitations(
        [...ctx.palette.getCitationPalette()],
        ctx.files.getSourcePalette()
      );

      // Backfill any chunk references in the narrative that the LLM forgot to include in sourceCitation
      if (fullContent) {
        ctx.checks.supplementFromContent(
          fullContent,
          [...ctx.palette.getCitationPalette()],
          ctx.files.getSourcePalette()
        );
      }

      // Cross-check: expected vs declared vs value refs
      ctx.checks.crossCheck(ctx.skill.checks, ctx.palette, fullContent, step.number);
    }

    if (result.contextSnapshot) {
      try {
        saveContextSnapshot({
          sessionId,
          turnNumber,
          stepNumber: step.number,
          stepTitle: step.title,
          stepType: step.type,
          systemPrompt: result.contextSnapshot.systemPrompt,
          userMessage: result.contextSnapshot.userMessage,
          contextSummary: result.contextSnapshot.contextSummary,
          skillmd: ctx.skill.skillmd,
          templateJson: null,
          loadedReferences: JSON.stringify(ctx.palette.getReferences().map(r => ({ filename: r.filename, content: r.content.slice(0, 5000) }))),
          uploadedFilesJson: JSON.stringify(ctx.files.getFiles().map(f => ({
            fileId: f.fileId, filename: f.filename, extractedText: f.extractedText?.slice(0, 3000) ?? "(none)",
            chunkCount: f.chunks?.length ?? 0,
            chunkIds: f.chunks?.slice(0, 10).map(c => c.id) ?? [],
            hasPositionData: f.chunks?.some(c => c.wordBoxes && c.wordBoxes.length > 0) ?? false,
          }))),
          stepOutputsJson: JSON.stringify(ctx.steps.entries()),
        });
      } catch (err) {
        logPipeline(`context snapshot failed (non-critical): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Final citation compilation across ALL CheckResults ──
  ctx.checks.compileCitations(
    [...ctx.palette.getCitationPalette()],
    ctx.files.getSourcePalette()
  );

  // ── Evaluate + finalize ──
  yield { type: "status", phase: "evaluating" };
  const result = await finalizePhase(ctx, steps, sessionId);

  if (result.validationErrors.length > 0) {
    yield { type: "status", phase: "validated-with-issues" };
  }

  yield { type: "done", response: result.response };
}

async function executeStepWithRetry(
  step: ExecutableStep,
  ctx: PipelineContext,
  maxRetries = 1,
  revisionUserMessage?: string
): Promise<StepResult> {
  let lastError = "";
  let lastCode = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const revisionContext = revisionUserMessage ? { userFeedback: revisionUserMessage } : undefined;
    const result = await executeLlmToolStep(step, ctx, lastError, revisionContext);
    if (result.success) return result;

    lastError = result.error ?? "";
    lastCode = result.errorCode ?? "";
    if (attempt < maxRetries) {
      logPipeline(`  RETRY step=${step.number} attempt=${attempt + 1}/${maxRetries + 1} error="${lastError}"`);
    }
  }

  return {
    success: false,
    error: `Step ${step.number} failed after ${maxRetries + 1} attempts. Last error: ${lastError}`,
    errorCode: lastCode || "STEP_FAILED",
  };
}
