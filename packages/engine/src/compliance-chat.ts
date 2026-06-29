import { streamText, stepCountIs } from "ai";
import { createModel } from "./agent/llm/factory";
import { addUserMessage } from "./agent/shared/memory/repository";
import { logInfo } from "./agent/pipeline/logger";

export type ComplianceChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-result"; toolName: string }
  | { type: "finish"; finishReason: string }
  | { type: "error"; error: string }
  | { type: "done"; response: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolRecord = Record<string, any>;

export interface ComplianceChatParams {
  messages: { role: "user" | "assistant"; content: string }[];
  systemPrompt: string;
  tools: ToolRecord;
}

export async function* complianceChat(
  sessionId: string,
  params: ComplianceChatParams
): AsyncGenerator<ComplianceChatEvent> {
  const { messages, systemPrompt, tools } = params;

  let llmModel;
  try {
    llmModel = createModel({ cache: true });
  } catch (err) {
    yield { type: "error", error: err instanceof Error ? err.message : "LLM config error" };
    return;
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
    tools: Object.keys(tools).length > 0 ? tools : undefined,
  });

  let fullText = "";
  try {
    for await (const event of result.fullStream) {
      if (event.type === "text-delta") {
        const chunk = event.text ?? "";
        fullText += chunk;
        yield { type: "text-delta", text: chunk };
      } else if (event.type === "tool-call") {
        yield { type: "tool-call", toolName: event.toolName, args: event.input };
      } else if (event.type === "tool-result") {
        yield { type: "tool-result", toolName: event.toolName };
      } else if (event.type === "finish") {
        yield { type: "finish", finishReason: event.finishReason };
      } else if (event.type === "error") {
        const errMsg = event.error instanceof Error ? event.error.message : typeof event.error === "string" ? event.error : "Tool execution failed";
        yield { type: "error", error: errMsg };
      }
    }

    if (fullText) {
      addUserMessage(sessionId, fullText);
    }
    yield { type: "done", response: fullText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    yield { type: "error", error: msg };
  }
}
