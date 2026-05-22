import type { PipelineContext } from "./pipeline-context";
import { executeLlmToolStep } from "./executors/llm-executor";
import { PipelineError } from "./errors";
import { logPipeline } from "./logger";

export type StepType = "llm+tool";

export interface ExecutableStep {
  number: number;
  title: string;
  type: StepType;
  instructions: string;
  temperature?: number;
}

export interface StepResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  contextSnapshot?: {
    systemPrompt: string;
    userMessage: string;
    contextSummary: string;
  };
  streamedTokens?: string[];
  toolResults?: {
    name: string;
    value: number;
    limit: number | string;
    comparison: string;
    status: "pass" | "fail";
    note?: string;
  }[];
}

export async function executeStep(
  step: ExecutableStep,
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
  step: ExecutableStep,
  ctx: PipelineContext,
  previousError: string
): Promise<StepResult> {
  logPipeline(`  [DISPATCH] step=${step.number} → llm+tool`);
  return executeLlmToolStep(step, ctx, previousError);
}
