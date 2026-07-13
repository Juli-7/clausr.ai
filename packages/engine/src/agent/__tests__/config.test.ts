import { describe, it, expect, beforeEach } from "vitest";

type ConfigModule = {
  getConfig: (key: string, fallback: string) => string;
  setLLMConfig: (opts: { provider?: string; model?: string }) => void;
  setRetentionConfig: (opts: { retentionDays?: string; maxSessions?: string }) => void;
};

describe("config", () => {
  let mod: ConfigModule;

  beforeEach(async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_RETENTION_DAYS;
    delete process.env.LLM_MAX_SESSIONS;
    vi.resetModules();
    mod = await import("../llm/config");
  });

  describe("getConfig", () => {
    it("returns env var when no override", () => {
      process.env.LLM_PROVIDER = "openai";
      expect(mod.getConfig("provider", "deepseek")).toBe("openai");
    });

    it("returns fallback when no override or env var", () => {
      expect(mod.getConfig("provider", "deepseek")).toBe("deepseek");
    });

    it("returns override value when set via setLLMConfig", () => {
      mod.setLLMConfig({ provider: "anthropic" });
      expect(mod.getConfig("provider", "deepseek")).toBe("anthropic");
    });

    it("prefers override over env var", () => {
      process.env.LLM_PROVIDER = "openai";
      mod.setLLMConfig({ provider: "anthropic" });
      expect(mod.getConfig("provider", "deepseek")).toBe("anthropic");
    });
  });

  describe("setLLMConfig", () => {
    it("sets provider override", () => {
      mod.setLLMConfig({ provider: "anthropic" });
      expect(mod.getConfig("provider", "deepseek")).toBe("anthropic");
    });

    it("sets model override", () => {
      mod.setLLMConfig({ model: "claude-4" });
      expect(mod.getConfig("model", "gpt-4")).toBe("claude-4");
    });

    it("can set both at once", () => {
      mod.setLLMConfig({ provider: "anthropic", model: "claude-4" });
      expect(mod.getConfig("provider", "deepseek")).toBe("anthropic");
      expect(mod.getConfig("model", "gpt-4")).toBe("claude-4");
    });
  });

  describe("setRetentionConfig", () => {
    it("sets retention days", () => {
      mod.setRetentionConfig({ retentionDays: "90" });
      expect(mod.getConfig("retention_days", "30")).toBe("90");
    });

    it("sets max sessions", () => {
      mod.setRetentionConfig({ maxSessions: "500" });
      expect(mod.getConfig("max_sessions", "100")).toBe("500");
    });

    it("can set both at once", () => {
      mod.setRetentionConfig({ retentionDays: "90", maxSessions: "500" });
      expect(mod.getConfig("retention_days", "30")).toBe("90");
      expect(mod.getConfig("max_sessions", "100")).toBe("500");
    });
  });
});
