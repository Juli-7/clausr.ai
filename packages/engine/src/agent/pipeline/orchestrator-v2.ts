import { executeLlmToolStep } from "./executors/llm-executor";
import { restoreContext } from "./pipeline-context";
import { getDocStore } from "../user-info/vector-store";
import { loadRegulationSummaries } from "./builtins";
import { initPipelineTurn } from "../loading/phases/init-phase";
import { identifyRevisionTargets } from "../pipeline/revision-phase";
import { saveContextSnapshot, getResponseCount } from "../shared/memory/repository";
import { finalizePhase } from "../present/phases/finalize-phase";
import { generateCorrelationId } from "./errors";
import { logPipeline, truncate } from "./logger";
import type { PipelineEvent, ExecutableStep, StepResult } from "./types";
import type { PipelineContext, CheckResult } from "./pipeline-context";
import type { ParsedCheck } from "../loading/skill/check-parser";

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
    logPipeline(`[PIPELINE] storedFiles from doc store: ${storedFiles.map(f => `"${f.filename}" extractedText=${f.extractedText.length}chars chunks=${f.chunks?.length ?? 0}`).join(", ")}`);
    ctx.files.loadFiles(storedFiles);
    logPipeline(`[PIPELINE] after loadFiles: ctx.files has ${ctx.files.getFiles().length} file(s), first file extractedText="${(ctx.files.getFiles()[0]?.extractedText ?? "").slice(0, 80)}..."`);
  } else {
    logPipeline(`[PIPELINE] store.getFiles returned 0 files for session=${sessionId}`);
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

  // ── Step execution loop (dependency-ordered batches with concurrency limit) ──
  const CONCURRENCY = Math.max(1, Math.min(50, Number(process.env.LLM_CONCURRENCY) || 20));

  // Collect steps that need execution (filter out cached/reused ones first)
  const pending: { step: ExecutableStep; saved: CheckResult[] }[] = [];
  for (const step of steps) {
    const existingOutput = ctx.steps.read(step.number);
    const isTarget = revisionTargets.has(step.number);

    if (existingOutput !== undefined && !isTarget) {
      logPipeline(`→ STEP ${step.number}: using previous output (${revisionTargets.size} target(s))`);
      yield { type: "status", phase: `step-${step.number}`, stepTitle: step.title + " (reused)" };
      continue;
    }

    const checkField = ctx.skill.checks[step.number - 1]?.field;
    const saved = checkField ? ctx.checks.removeResultsForField(checkField) : [];
    pending.push({ step, saved });
  }

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  if (pending.length > 0) {
    // Compute topological depths for pending steps
    const pendingDepths = computePendingDepths(pending, ctx.skill.checks);
    const maxDepth = Math.max(...pendingDepths);

    // Execute by dependency depth — each depth level waits for prior levels to complete
    for (let depth = 1; depth <= maxDepth; depth++) {
      const levelSteps = pending.filter((_, i) => pendingDepths[i] === depth);
      if (levelSteps.length === 0) continue;

      // Chunk within this depth level for concurrency control
      for (let i = 0; i < levelSteps.length; i += CONCURRENCY) {
        const batch = levelSteps.slice(i, i + CONCURRENCY);

        yield { type: "status", phase: `depth-${depth}-batch-${Math.floor(i / CONCURRENCY) + 1}-of-${Math.ceil(levelSteps.length / CONCURRENCY)}` };

        // Phase 1: run all LLM calls in this batch concurrently
        const completed = await Promise.all(
          batch.map(async ({ step }) => {
            logPipeline(`→ STEP ${step.number}: "${step.title}"${revisionTargets.has(step.number) ? " [REVISION]" : ""}`);
            return {
              step,
              result: await executeStepWithRetry(step, ctx, 1, revisionTargets.has(step.number) ? message : undefined),
            };
          })
        );

        // Phase 2: process results sequentially (yield events, citation cross-check, snapshots)
        for (const { step, result } of completed) {
          if (result.usage) {
            totalPromptTokens += result.usage.promptTokens;
            totalCompletionTokens += result.usage.completionTokens;
          }

          if (!result.success) {
            logPipeline(`✗ STEP ${step.number} FAILED: ${result.error}`);
            const saved = pending.find(p => p.step.number === step.number)?.saved ?? [];
            if (saved.length > 0) {
              ctx.checks.addResults(saved);
              logPipeline(`→ STEP ${step.number}: restored ${saved.length} previous result(s) after failure`);
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

            const checkRefs = ctx.checks.getResults().flatMap((r) => r.citationRef);
            await ctx.palette.resolveMissingRefs(checkRefs);

            const fullContent = result.streamedTokens?.join("") ?? "";
            if (fullContent) {
              const contentRefs = [...fullContent.matchAll(/\[(R\d+\.\d+(?:\.\d+)*)\]/g)].map((m) => m[1]!);
              await ctx.palette.resolveMissingRefs(contentRefs);
            }

            ctx.checks.compileCitations(
              [...ctx.palette.getCitationPalette()],
              ctx.files.getSourcePalette()
            );

            if (fullContent) {
              ctx.checks.supplementFromContent(
                fullContent,
                [...ctx.palette.getCitationPalette()],
                ctx.files.getSourcePalette()
              );
            }

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
      }
    }
  }

  // ── Final citation compilation across ALL CheckResults ──
  ctx.checks.compileCitations(
    [...ctx.palette.getCitationPalette()],
    ctx.files.getSourcePalette()
  );

  // ── Yield aggregated usage ──
  yield { type: "usage", promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens };

  // ── Evaluate + finalize ──
  yield { type: "status", phase: "evaluating" };
  const result = await finalizePhase(ctx, steps, sessionId);

  if (result.validationErrors.length > 0) {
    yield { type: "status", phase: "validated-with-issues" };
  }

  yield { type: "done", response: result.response };
}

/**
 * Compute topological depth for each pending step.
 *
 * Depth 1 = no dependencies (roots). Depth N = depends on a step at depth N-1.
 * Steps that share the same depth are independent and can run concurrently.
 * Steps at greater depths only execute after all shallower levels finish,
 * ensuring their dependencies' results are in ctx.checks.
 */
function computePendingDepths(
  pending: { step: ExecutableStep; saved: CheckResult[] }[],
  checks: ParsedCheck[]
): number[] {
  // Map field name -> check index (0-based)
  const fieldToStep = new Map<string, number>();
  checks.forEach((c, i) => fieldToStep.set(c.field, i));

  // Map dependsOn value (e.g. "c02") -> step number (1-based), or undefined
  function resolveDepStepNum(depField: string): number | undefined {
    for (const [field, idx] of fieldToStep) {
      if (field.startsWith(depField)) return idx + 1;
    }
    return undefined;
  }

  // Build set of pending step numbers for quick lookup
  const pendingNums = new Set(pending.map(p => p.step.number));

  // Memoized depth per step number (1-indexed)
  const memo = new Map<number, number>();
  const visiting = new Set<number>();

  function getDepth(stepNum: number): number {
    const existing = memo.get(stepNum);
    if (existing !== undefined) return existing;
    if (visiting.has(stepNum)) return 1; // cycle guard

    const check = checks[stepNum - 1];
    if (!check || !check.dependsOn) {
      memo.set(stepNum, 1);
      return 1;
    }

    const depStepNum = resolveDepStepNum(check.dependsOn);
    if (depStepNum === undefined || depStepNum === stepNum) {
      memo.set(stepNum, 1);
      return 1;
    }

    // Only wait if the dependency is also pending (needs execution this turn)
    if (!pendingNums.has(depStepNum)) {
      memo.set(stepNum, 1);
      return 1;
    }

    visiting.add(stepNum);
    const depDepth = getDepth(depStepNum);
    visiting.delete(stepNum);

    const depth = depDepth + 1;
    memo.set(stepNum, depth);
    return depth;
  }

  return pending.map(p => getDepth(p.step.number));
}

async function executeStepWithRetry(
  step: ExecutableStep,
  ctx: PipelineContext,
  maxRetries = 1,
  revisionUserMessage?: string
): Promise<StepResult> {
  let lastError = "";
  let lastCode = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const revisionContext = revisionUserMessage ? { userFeedback: revisionUserMessage } : undefined;
    const result = await executeLlmToolStep(step, ctx, lastError, revisionContext);

    if (result.usage) {
      totalPromptTokens += result.usage.promptTokens;
      totalCompletionTokens += result.usage.completionTokens;
    }

    if (result.success) {
      return {
        ...result,
        usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
      };
    }

    lastError = result.error ?? "";
    lastCode = result.errorCode ?? "";
    if (attempt < maxRetries) {
      logPipeline(`  RETRY step=${step.number} attempt=${attempt + 1}/${maxRetries + 1} tokens=${totalPromptTokens + totalCompletionTokens} error="${lastError}"`);
    }
  }

  return {
    success: false,
    error: `Step ${step.number} failed after ${maxRetries + 1} attempts. Last error: ${lastError}`,
    errorCode: lastCode || "STEP_FAILED",
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
  };
}
