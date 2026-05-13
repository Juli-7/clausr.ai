import type { ParsedStep } from "@/lib/agent/skill/step-parser";
import type { PipelineContext } from "./pipeline-context";
import { executeLlmStep, executeLlmToolStep } from "./executors/llm-executor";
import { executeBuiltin } from "./builtins";
import { PipelineError } from "./errors";
import { logPipeline } from "./logger";

export interface StepResult {
  success: boolean;
  error?: string;
  /** Machine-readable error code for the client */
  errorCode?: string;
  /** Context snapshot data captured during LLM execution (null for script steps) */
  contextSnapshot?: {
    systemPrompt: string;
    userMessage: string;
    contextSummary: string;
  };
  /** Buffered text tokens from LLM streaming — flushed to client after step succeeds */
  streamedTokens?: string[];
  /** Per-check tool results — flushed to client after step succeeds */
  toolResults?: {
    name: string;
    value: number;
    limit: number | string;
    comparison: string;
    status: "pass" | "fail";
    note?: string;
  }[];
}

/**
 * Execute a single pipeline step.
 *
 * Dispatch order:
 * 1. Check if the step matches a built-in handler (keyword-detected)
 * 2. Dispatch by step type (llm, script, llm+tool)
 *
 * Each step gets 1 retry on failure, with the previous error
 * passed as context for the retry.
 */
export async function executeStep(
  step: ParsedStep,
  ctx: PipelineContext,
  maxRetries = 1
): Promise<StepResult> {
  let lastError = "";
  let lastCode = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await tryExecute(step, ctx, lastError);
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

async function tryExecute(
  step: ParsedStep,
  ctx: PipelineContext,
  previousError: string
): Promise<StepResult> {
  logPipeline(`  [DISPATCH] step=${step.number} → type="${step.type}"`);

  // Dispatch by step type
  if (step.type.startsWith("builtin:")) {
    return executeBuiltin(step.type, ctx);
  }

  switch (step.type) {
    case "llm":
      return executeLlmStep(step, ctx, previousError);
    case "llm+tool":
      return executeLlmToolStep(step, ctx, previousError);
    default:
      return {
        success: false,
        error: `Step ${step.number}: unknown type "${step.type}"`,
        errorCode: "UNKNOWN_STEP_TYPE",
      };
  }
}
