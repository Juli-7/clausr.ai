import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel } from "ai";
import type { LanguageModel } from "ai";
import { getConfig } from "./config";
import { createDeepSeekFetch } from "./deepseek";

export type ProviderName = "openai" | "anthropic" | "deepseek";

interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface CreateModelOptions {
  cache?: boolean;
}

const DEFAULT_CONFIGS: Record<ProviderName, { baseURL: string }> = {
  openai: { baseURL: "https://api.openai.com/v1" },
  anthropic: { baseURL: "https://api.anthropic.com/v1" },
  deepseek: { baseURL: "https://api.deepseek.com" },
};

function getProvider(): ProviderName {
  const raw = getConfig("provider", "deepseek").toLowerCase();
  if (raw !== "openai" && raw !== "anthropic" && raw !== "deepseek") {
    throw new Error(
      `Unknown provider "${raw}". Valid providers: openai, anthropic, deepseek.`
    );
  }
  return raw;
}

function getProviderConfig(): ProviderConfig {
  const provider = getProvider();
  const envKeyName = `${provider.toUpperCase()}_API_KEY`;
  const apiKey = process.env[envKeyName] || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${provider}". Set ${envKeyName}=sk-... or LLM_API_KEY=sk-... in your environment.`
    );
  }
  const defaults = DEFAULT_CONFIGS[provider];
  const baseURL = process.env.LLM_BASE_URL || defaults.baseURL;
  const model = getConfig("model", "deepseek-v4-flash");
  return { provider, apiKey, baseURL, model };
}

function buildBaseModel(config: ProviderConfig): LanguageModel {
  if (config.provider === "deepseek") {
    const client = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      fetch: createDeepSeekFetch(fetch),
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

function applyCaching(model: LanguageModel, provider: ProviderName): LanguageModel {
  if (provider !== "anthropic") return model;

  return wrapLanguageModel({
    model,
    middleware: {
      transformInput: async ({ input }) => ({
        ...input,
        providerMetadata: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      }),
    },
  });
}

export function createModel(options?: CreateModelOptions): LanguageModel {
  const config = getProviderConfig();
  const model = buildBaseModel(config);

  if (options?.cache) {
    return applyCaching(model, config.provider);
  }

  return model;
}
