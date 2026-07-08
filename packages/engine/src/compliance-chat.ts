import { streamText, tool } from "ai";
import { createModel } from "./agent/llm/factory";
import { addAssistantMessage, addUserMessage } from "./agent/shared/memory/repository";
import { logInfo } from "./agent/pipeline/logger";
import { COMPLIANCE_SYSTEM_PROMPTS, buildComplianceStepPrompt, type SessionState } from "./agent/pipeline/prompts";
import type { SkillPack } from "./agent/loading/skill/loader";
import { TOOL_DEFS } from "./compliance-tools";

export type ComplianceChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolName: string; args: unknown }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: "finish"; finishReason: string }
  | { type: "error"; error: string }
  | { type: "done"; response: string; usage: { inputTokens?: number; outputTokens?: number } };

export interface ComplianceChatParams {
  messages: { role: "user" | "assistant"; content: string }[];
  step?: number;
  systemPrompt?: string;
  packs?: SkillPack[];
  sessionState?: SessionState;
}

export async function* complianceChat(
  sessionId: string,
  params: ComplianceChatParams
): AsyncGenerator<ComplianceChatEvent> {
  const { messages, step, systemPrompt: customPrompt, packs, sessionState } = params;
  const systemPrompt = customPrompt
    ?? (packs && step !== undefined ? buildComplianceStepPrompt(step, packs, sessionState) : undefined)
    ?? (step ? COMPLIANCE_SYSTEM_PROMPTS[step] : undefined);
  if (!systemPrompt) {
    yield { type: "error", error: step ? `No system prompt for step ${step}` : "systemPrompt is required when step is not provided" };
    return;
  }

  // Persist user message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    addUserMessage(sessionId, lastUserMsg.content);
  }

  let llmModel;
  try {
    llmModel = createModel({ cache: true });
  } catch (err) {
    yield { type: "error", error: err instanceof Error ? err.message : "LLM config error" };
    return;
  }

  const allTools = Object.fromEntries(
    Object.entries(TOOL_DEFS).map(([name, def]) => [
      name,
      tool({
        description: def.description,
        inputSchema: def.inputSchema!,
        execute: (input) => def.execute(sessionId, input as Record<string, unknown>),
      }),
    ])
  );

  const abortController = new AbortController();
  const llmTimeout = setTimeout(() => abortController.abort("LLM request timed out"), 120_000);

  const result = streamText({
    model: llmModel,
    system: systemPrompt,
    stopWhen: ({ steps }) => {
      if (steps.length >= 5) return true;
      if (steps.length < 2) return false;
      const prevSteps = steps.slice(0, -1);
      const seen = new Set<string>();
      for (const s of prevSteps) {
        for (const tc of s.toolCalls ?? []) {
          seen.add(tc.toolName);
        }
      }
      const cur = steps[steps.length - 1];
      for (const tc of cur.toolCalls ?? []) {
        if (seen.has(tc.toolName)) return true;
      }
      return false;
    },
    maxRetries: 3,
    abortSignal: abortController.signal,
    onStepFinish: ({ text, finishReason, toolCalls, toolResults, stepNumber }) => {
      logInfo(`step=${stepNumber} finish=${finishReason} textLen=${text?.length} toolCalls=${toolCalls?.length} toolResults=${toolResults?.length}`);
    },
    onFinish: ({ finishReason, text, usage, steps }) => {
      logInfo(`finish=${finishReason} textLen=${text?.length} steps=${steps?.length} prompt=${usage?.inputTokens} completion=${usage?.outputTokens}`);
    },
    messages,
    tools: allTools,
  });

  let fullText = "";
  let finalUsage: { inputTokens?: number; outputTokens?: number } = {};
  try {
    for await (const event of result.fullStream) {
      if (event.type === "text-delta") {
        const chunk = event.text ?? "";
        fullText += chunk;
        yield { type: "text-delta", text: chunk };
      } else if (event.type === "tool-call") {
        yield { type: "tool-call", toolName: event.toolName, args: event.input };
      } else if (event.type === "tool-result") {
        yield { type: "tool-result", toolName: event.toolName, result: event.output };
      } else if (event.type === "finish") {
        yield { type: "finish", finishReason: event.finishReason };
      } else if (event.type === "error") {
        const errMsg = event.error instanceof Error ? event.error.message : typeof event.error === "string" ? event.error : "Tool execution failed";
        yield { type: "error", error: errMsg };
      }
    }

    finalUsage = await result.usage;
    if (fullText) {
      await addAssistantMessage(sessionId, fullText);
    }
    yield { type: "done", response: fullText, usage: finalUsage };
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "request timed out" : err instanceof Error ? err.message : "Unknown";
    yield { type: "error", error: msg };
  } finally {
    clearTimeout(llmTimeout);
  }
}
