import type { AgentResponse } from "@/lib/agent/shared/types";

export type PipelineEvent =
  | { type: "status"; phase: string; stepTitle?: string }
  | { type: "token"; text: string; stepNumber: number }
  | { type: "tool-result"; stepNumber: number; results: { name: string; value: number; limit: number | string; comparison: string; status: "pass" | "fail"; note?: string }[] }
  | { type: "done"; response: AgentResponse }
  | { type: "error"; error: string; code?: string; correlationId?: string };
