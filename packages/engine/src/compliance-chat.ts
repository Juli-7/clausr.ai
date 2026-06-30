import { streamText, stepCountIs, tool } from "ai";
import { createModel } from "./agent/llm/factory";
import { addAssistantMessage } from "./agent/shared/memory/repository";
import { logInfo } from "./agent/pipeline/logger";
import { COMPLIANCE_SYSTEM_PROMPTS } from "./agent/pipeline/prompts";
import { TOOL_DEFS } from "./compliance-tools";

export type ComplianceChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: "finish"; finishReason: string }
  | { type: "error"; error: string }
  | { type: "done"; response: string; usage: { promptTokens: number; completionTokens: number } };

export interface ComplianceChatParams {
  messages: { role: "user" | "assistant"; content: string }[];
  step?: number;
  systemPrompt?: string;
}

export async function* complianceChat(
  sessionId: string,
  params: ComplianceChatParams
): AsyncGenerator<ComplianceChatEvent> {
  const { messages, step, systemPrompt: customPrompt } = params;
  const systemPrompt = customPrompt ?? (step ? COMPLIANCE_SYSTEM_PROMPTS[step] : undefined);
  if (!systemPrompt) {
    yield { type: "error", error: step ? `No system prompt for step ${step}` : "systemPrompt is required when step is not provided" };
    return;
  }

  let llmModel;
  try {
    llmModel = createModel({ cache: true });
  } catch (err) {
    yield { type: "error", error: err instanceof Error ? err.message : "LLM config error" };
    return;
  }

  const allTools: Record<string, { description: string; parameters: typeof import("zod").ZodTypeAny; execute: (input: Record<string, unknown>) => Promise<unknown> }> = {};
  for (const [name, def] of Object.entries(TOOL_DEFS)) {
    allTools[name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: (input) => def.execute(sessionId, input as Record<string, unknown>),
    });
  }

  const result = streamText({
    model: llmModel,
    system: systemPrompt,
    stopWhen: stepCountIs(20),
    onStepFinish: ({ text, finishReason, toolCalls, toolResults, stepNumber }) => {
      logInfo(`step=${stepNumber} finish=${finishReason} textLen=${text?.length} toolCalls=${toolCalls?.length} toolResults=${toolResults?.length}`);
    },
    onFinish: ({ finishReason, text, usage, steps }) => {
      logInfo(`finish=${finishReason} textLen=${text?.length} steps=${steps?.length} prompt=${usage?.promptTokens} completion=${usage?.completionTokens}`);
    },
    messages,
    tools: allTools,
  });

  let fullText = "";
  let finalUsage: { promptTokens: number; completionTokens: number } = { promptTokens: 0, completionTokens: 0 };
  try {
    for await (const event of result.fullStream) {
      if (event.type === "text-delta") {
        const chunk = event.text ?? "";
        fullText += chunk;
        yield { type: "text-delta", text: chunk };
      } else if (event.type === "tool-call") {
        yield { type: "tool-call", toolName: event.toolName, args: event.input };
      } else if (event.type === "tool-result") {
        yield { type: "tool-result", toolName: event.toolName, result: event.result };
      } else if (event.type === "finish") {
        yield { type: "finish", finishReason: event.finishReason };
      } else if (event.type === "error") {
        const errMsg = event.error instanceof Error ? event.error.message : typeof event.error === "string" ? event.error : "Tool execution failed";
        yield { type: "error", error: errMsg };
      }
    }

    finalUsage = await result.usage;
    if (fullText) {
      addAssistantMessage(sessionId, fullText);
    }
    yield { type: "done", response: fullText, usage: finalUsage };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    yield { type: "error", error: msg };
  }
}
