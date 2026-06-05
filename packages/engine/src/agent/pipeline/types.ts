import type { AgentResponse } from "../shared/types";

export interface ExecutableStep {
  number: number;
  title: string;
  type: "llm+tool";
  instructions: string;
  attention?: string;
  dependsOn?: string;
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

export type PipelineEvent =
  | { type: "status"; phase: string; stepTitle?: string }
  | { type: "token"; text: string; stepNumber: number }
  | { type: "tool-result"; stepNumber: number; results: { name: string; value: number; limit: number | string; comparison: string; status: "pass" | "fail"; note?: string }[] }
  | { type: "done"; response: AgentResponse }
  | { type: "error"; error: string; code?: string; correlationId?: string };
