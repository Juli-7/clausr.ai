import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { getSetting } from "@/lib/agent/memory/database";

export type ProviderName = "openai" | "anthropic" | "deepseek";

interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
}

const DEFAULT_CONFIGS: Record<ProviderName, { baseURL: string }> = {
  openai: { baseURL: "https://api.openai.com/v1" },
  anthropic: { baseURL: "https://api.anthropic.com/v1" },
  deepseek: { baseURL: "https://api.deepseek.com" },
};

export function getProvider(): ProviderName {
  // Check DB override first, then fall back to env var
  const dbProvider = getSetting("llm_provider");
  const raw = (dbProvider ?? process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  if (raw !== "openai" && raw !== "anthropic" && raw !== "deepseek") {
    throw new Error(
      `Unknown LLM_PROVIDER "${raw}". Set LLM_PROVIDER=openai, anthropic, or deepseek.`
    );
  }
  return raw;
}

function getProviderConfig(): ProviderConfig {
  const provider = getProvider();
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Add it to .env.local or your environment."
    );
  }
  const defaults = DEFAULT_CONFIGS[provider];
  const baseURL = process.env.LLM_BASE_URL || defaults.baseURL;
  // Check DB override for model first, then env var, then default
  const dbModel = getSetting("llm_model");
  const model = dbModel ?? process.env.LLM_MODEL ?? "deepseek-v4-flash";
  return { provider, apiKey, baseURL, model };
}

/**
 * Custom fetch wrapper for DeepSeek's `reasoning_content` requirement.
 *
 * DeepSeek `deepseek-v4-flash` returns `reasoning_content` on assistant messages with
 * tool_calls, and requires it present on subsequent requests. The @ai-sdk/openai SDK
 * doesn't include `reasoning_content` in its message format, so we add it to outgoing
 * requests to keep DeepSeek's validation happy. The actual content is discarded since
 * we don't display it — this just satisfies the transport requirement.
 */
function deepseekFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
    const isChatCompletion = url.includes("/chat/completions");

    // Add reasoning_content placeholder to assistant messages with tool_calls
    if (isChatCompletion && init && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        let modified = false;
        for (const msg of body.messages) {
          if (msg.role === "assistant" && msg.tool_calls && !("reasoning_content" in msg)) {
            msg.reasoning_content = "";
            modified = true;
          }
        }
        if (modified) {
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch (e) {
        console.warn("Failed to inject reasoning_content into DeepSeek request", e);
      }
    }

    return originalFetch(input, init);
  };
}

export function createModel(): LanguageModelV3 {
  const config = getProviderConfig();

  if (config.provider === "deepseek") {
    const client = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      fetch: deepseekFetch(fetch),
    });
    return client.chat(config.model);
  }

  if (config.provider === "anthropic") {
    const client = createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL });
    return client(config.model);
  }

  const client = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  return client.chat(config.model);
}
