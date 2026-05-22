import { loadReferences } from "./builtins";
import { executeLlmToolStep } from "./executors/llm-executor";
import { generateStepsFromChecks } from "@/lib/agent/loading/generate-steps";
import { saveContextSnapshot, getResponseCount } from "@/lib/agent/shared/memory/repository";
import { PipelineError, formatPipelineError } from "./errors";
import { logPipeline, truncate } from "./logger";
import { initPhase } from "@/lib/agent/loading/phases/init-phase";
import { inputPhase } from "@/lib/agent/loading/phases/input-phase";
import { skillGenPhase } from "@/lib/agent/loading/phases/skill-gen-phase";
import { identifyRevisionTarget, identifyRevisionTargets } from "@/lib/agent/loading/phases/revision-phase";
import { enforceChecks } from "@/lib/agent/evaluation/enforce-checks";
import { finalizePhase } from "@/lib/agent/present/phases/finalize-phase";
import type { PipelineEvent, ExecutableStep, StepResult } from "./types";
import type { PipelineContext } from "./pipeline-context";

export async function* orchestratePipeline(
  message: string,
  skillName: string | undefined,
  sessionId: string,
  files?: {
    name: string;
    size: number;
    type: string;
    dataUrl?: string;
  }[],
  revisionFields?: string[]
): AsyncGenerator<PipelineEvent> {
  // ── Phase 1: Init ──
  let ctx;
  let correlationId: string;
  let isAutoSkill: boolean;
  try {
    const initResult = await initPhase(skillName, sessionId, message);
    ctx = initResult.ctx;
    correlationId = initResult.correlationId;
    isAutoSkill = initResult.isAutoSkill;
  } catch (err) {
    yield { type: "error", error: formatPipelineError(err), code: err instanceof PipelineError ? err.code : "SKILL_NOT_FOUND" };
    return;
  }

  // ── Phase 2: Input ──
  yield { type: "status", phase: "processing-files" };
  await inputPhase(ctx, { files, sessionId });

  // ── Phase 2.5: Skill Generation (auto-mode only) ──
  if (isAutoSkill) {
    yield { type: "status", phase: "generating-skill" };
    try {
      await skillGenPhase(ctx, message);
    } catch (err) {
      yield {
        type: "error",
        error: formatPipelineError(err, correlationId),
        code: err instanceof PipelineError ? err.code : "SKILL_GENERATION_FAILED",
        correlationId,
      };
      return;
    }
  }

  // ── Phase 3: Load regulation references into palette ──
  yield { type: "status", phase: "loading-references" };
  await loadReferences(ctx);

  // ── Phase 4: Generate steps from Checks table ──
  const steps = generateStepsFromChecks(ctx.skill.checks);
  yield { type: "status", phase: `executing-${steps.length}-steps` };
  const turnNumber = getResponseCount(sessionId) + 1;

  // ── Phase 3a: Revision identification (follow-up turns only) ──
  let revisionTargets = new Set<number>();
  if (revisionFields && revisionFields.length > 0) {
    // Explicit field targets from frontend checkbox selection
    const stepNums = identifyRevisionTargets(revisionFields, ctx.skill.checks);
    revisionTargets = new Set(stepNums);
    if (revisionTargets.size > 0) {
      yield { type: "status", phase: `revising-${revisionTargets.size}-steps` };
    }
  } else if (ctx.previousTurns.length > 0) {
    // Fallback: LLM guess from message text (original behavior)
    try {
      const target = await identifyRevisionTarget(ctx, message);
      if (target > 0) {
        revisionTargets = new Set([target]);
        yield { type: "status", phase: `revising-step-${target}` };
      }
    } catch (err) {
      logPipeline(`revision identification failed: ${err instanceof Error ? err.message : String(err)}`);
      revisionTargets = new Set();
    }
  }

  // ── Phase 3b: Step execution loop ──
  for (const step of steps) {
    const existingOutput = ctx.steps.read(step.number);
    const isTarget = revisionTargets.has(step.number);

    // Skip steps that already have output and are NOT a revision target
    if (existingOutput !== undefined && !isTarget) {
      logPipeline(`→ STEP ${step.number}: using previous output (${revisionTargets.size} target(s))`);
      yield { type: "status", phase: `step-${step.number}`, stepTitle: step.title + " (reused)" };
      continue;
    }

    yield { type: "status", phase: `step-${step.number}`, stepTitle: step.title };
    logPipeline(`→ STEP ${step.number}: "${step.title}" (type=${step.type})${isTarget ? " [REVISION]" : ""}`);

    // Save old CheckResults for this step's field before clearing
    // (restored on failure per clear-after-success pattern)
    const checkField = ctx.skill.checks[step.number - 1]?.field;
    const savedResults = checkField ? ctx.checks.removeResultsForField(checkField) : [];

    const result = await executeStepWithRetry(step, ctx, 1);

    if (!result.success) {
      logPipeline(`✗ STEP ${step.number} FAILED: ${result.error}`);
      // Restore old results on failure (clear-before pattern)
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
      ctx.checks.compileCitations(
        [...ctx.palette.getCitationPalette()],
        ctx.files.getSourcePalette()
      );
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

  // ── Phase 3c: Enforce checks (fill gaps before evaluation) ──
  enforceChecks(ctx);

  // ── Phase 4: Evaluate ──
  yield { type: "status", phase: "evaluating" };
  const result = await finalizePhase(ctx, steps, sessionId);

  if (result.validationErrors.length > 0) {
    yield { type: "status", phase: "validated-with-issues" };
  }

  yield { type: "done", response: result.response };
}

// ── Step execution with retry ──

async function executeStepWithRetry(
  step: ExecutableStep,
  ctx: PipelineContext,
  maxRetries = 1
): Promise<StepResult> {
  let lastError = "";
  let lastCode = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await executeLlmToolStep(step, ctx, lastError);
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
