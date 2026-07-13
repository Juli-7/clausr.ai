import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetConfig } = vi.hoisted(() => ({ mockGetConfig: vi.fn() }));
vi.mock("../llm/config", () => ({
  getConfig: mockGetConfig,
  setLLMConfig: vi.fn(),
  setRetentionConfig: vi.fn(),
}));

const { mockCreateDeepSeekFetch } = vi.hoisted(() => ({ mockCreateDeepSeekFetch: vi.fn(() => vi.fn()) }));
vi.mock("../llm/deepseek", () => ({
  createDeepSeekFetch: mockCreateDeepSeekFetch,
}));

const { mockCreateOpenAI, mockCreateAnthropic } = vi.hoisted(() => ({
  mockCreateOpenAI: vi.fn(),
  mockCreateAnthropic: vi.fn(),
}));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}));

import { createModel } from "../llm/factory";

describe("createModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;

    mockCreateOpenAI.mockReturnValue({
      chat: vi.fn(() => ({ modelId: "openai-model" })),
    });
    mockCreateAnthropic.mockReturnValue(vi.fn(() => ({ modelId: "anthropic-model" })));
  });

  it("throws for unknown provider", () => {
    mockGetConfig.mockImplementation((key: string) => {
      if (key === "provider") return "unknown";
      if (key === "model") return "gpt-4";
      return "";
    });
    expect(() => createModel()).toThrow("Unknown provider");
  });

  it("throws when no API key found", () => {
    mockGetConfig.mockImplementation((key: string) => {
      if (key === "provider") return "openai";
      if (key === "model") return "gpt-4";
      return "";
    });
    expect(() => createModel()).toThrow("No API key found");
  });

  it("creates OpenAI model", () => {
    process.env.OPENAI_API_KEY = "sk-openai-123";
    mockGetConfig.mockImplementation((key: string, fallback: string) => {
      if (key === "provider") return "openai";
      if (key === "model") return "gpt-4";
      return fallback;
    });

    const model = createModel();
    expect(model).toBeTruthy();
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-openai-123",
      baseURL: "https://api.openai.com/v1",
    });
  });

  it("creates DeepSeek model with custom fetch", () => {
    process.env.DEEPSEEK_API_KEY = "sk-ds-123";
    mockGetConfig.mockImplementation((key: string, fallback: string) => {
      if (key === "provider") return "deepseek";
      if (key === "model") return fallback;
      return fallback;
    });

    const model = createModel();
    expect(model).toBeTruthy();
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-ds-123",
      baseURL: "https://api.deepseek.com",
      fetch: expect.any(Function),
    });
    expect(mockCreateDeepSeekFetch).toHaveBeenCalled();
  });

  it("creates Anthropic model", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-123";
    mockGetConfig.mockImplementation((key: string, fallback: string) => {
      if (key === "provider") return "anthropic";
      if (key === "model") return "claude-3-opus";
      return fallback;
    });

    createModel();
    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: "sk-ant-123",
      baseURL: "https://api.anthropic.com/v1",
    });
  });

  it("applies caching middleware for Anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-123";
    mockGetConfig.mockImplementation((key: string, fallback: string) => {
      if (key === "provider") return "anthropic";
      if (key === "model") return "claude-3-opus";
      return fallback;
    });

    const model = createModel({ cache: true });
    expect(model).toBeTruthy();
    expect(mockCreateAnthropic).toHaveBeenCalled();
  });

  it("reads LLM_API_KEY as fallback when provider-specific key missing", () => {
    process.env.LLM_API_KEY = "sk-fallback-123";
    mockGetConfig.mockImplementation((key: string, fallback: string) => {
      if (key === "provider") return "openai";
      if (key === "model") return "gpt-4";
      return fallback;
    });

    createModel();
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-fallback-123",
      baseURL: "https://api.openai.com/v1",
    });
  });

  it("uses custom base URL from env", () => {
    process.env.OPENAI_API_KEY = "sk-123";
    process.env.LLM_BASE_URL = "https://custom.api.com/v1";
    mockGetConfig.mockImplementation((key: string, fallback: string) => {
      if (key === "provider") return "openai";
      if (key === "model") return "gpt-4";
      return fallback;
    });

    createModel();
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-123",
      baseURL: "https://custom.api.com/v1",
    });
  });
});
