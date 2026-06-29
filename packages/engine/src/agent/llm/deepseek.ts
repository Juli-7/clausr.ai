/**
 * DeepSeek API compatibility wrapper.
 *
 * DeepSeek's `deepseek-v4-flash` returns `reasoning_content` on assistant messages
 * with tool_calls, and requires it present on subsequent requests. The `@ai-sdk/openai`
 * SDK doesn't include this field in its serialization, so we inject it at the fetch
 * layer before the body is sent over the wire.
 *
 * Usage: createOpenAI({ fetch: createDeepSeekFetch() })
 */

export function createDeepSeekFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (!isChatCompletionRequest(input) || !init || typeof init.body !== "string") {
      return originalFetch(input, init);
    }

    const body = parseBody(init.body);
    if (!body || !needsReasoningContent(body)) {
      return originalFetch(input, init);
    }

    injectReasoningContent(body);
    init = { ...init, body: JSON.stringify(body) };
    return originalFetch(input, init);
  };
}

function isChatCompletionRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
  return url.includes("/chat/completions");
}

function needsReasoningContent(body: Record<string, unknown>): boolean {
  return (body.messages as any[])?.some(
    (m) => m.role === "assistant" && m.tool_calls && !("reasoning_content" in m)
  );
}

function injectReasoningContent(body: Record<string, unknown>): void {
  const messages = body.messages as any[];
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls && !("reasoning_content" in msg)) {
      msg.reasoning_content = "";
    }
  }
}

function parseBody(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
