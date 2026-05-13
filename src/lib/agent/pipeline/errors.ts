export type PipelineErrorCode =
  | "SKILL_NOT_FOUND"
  | "SKILL_PARSE_FAILED"
  | "STEP_FAILED"
  | "LLM_ERROR"
  | "BUILTIN_ERROR"
  | "UNKNOWN_STEP_TYPE";

export class PipelineError extends Error {
  public readonly code: PipelineErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly correlationId?: string;

  constructor(
    code: PipelineErrorCode,
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string,
  ) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
  }
}

export class StepFailedError extends PipelineError {
  public readonly stepNumber: number;
  public readonly stepType: string;

  constructor(
    code: PipelineErrorCode,
    message: string,
    stepNumber: number,
    stepType: string,
    details?: Record<string, unknown>,
    correlationId?: string,
  ) {
    super(code, message, details, correlationId);
    this.name = "StepFailedError";
    this.stepNumber = stepNumber;
    this.stepType = stepType;
  }
}

export class SkillLoadError extends PipelineError {
  public readonly skillName: string;

  constructor(
    code: PipelineErrorCode,
    message: string,
    skillName: string,
    details?: Record<string, unknown>,
    correlationId?: string,
  ) {
    super(code, message, details, correlationId);
    this.name = "SkillLoadError";
    this.skillName = skillName;
  }
}

let counter = 0;
export function generateCorrelationId(): string {
  counter++;
  return `corr-${Date.now()}-${counter.toString(36)}`;
}

export function formatPipelineError(err: unknown, fallbackCorrelationId?: string): string {
  if (err instanceof PipelineError) {
    const cid = err.correlationId ?? fallbackCorrelationId;
    return `[${err.code}] ${err.message}${cid ? ` (cid: ${cid})` : ""}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
