import type { AgentResponse, ChatRequestFile, ToolCallRecord, ReasoningStep } from "@/lib/agent/schemas";

export type { ReasoningStep };

export interface ChatTurn {
  /** What the user typed */
  userMessage: string;
  /** Files attached for this turn */
  attachedFiles: ChatRequestFile[];
  /** null = still loading; undefined = errored */
  response: AgentResponse | null;
  /** Reasoning steps parsed during streaming */
  reasoningSteps: ReasoningStep[];
  /** Tool call records from the response */
  toolCalls: ToolCallRecord[];
  /** Tool results that arrived during live streaming (before response) */
  liveToolResults: { stepNumber: number; results: { name: string; value: number; limit: number | string; comparison: string; status: "pass" | "fail"; note?: string }[] }[];
  /** Error message if the request failed */
  error: string | null;
}
