import { describe, it, expect, beforeEach } from "vitest";
import { t, setLang, getLang } from "../i18n";

describe("compliance i18n", () => {
  beforeEach(() => {
    setLang("en");
  });

  it("returns EN strings by default", () => {
    expect(getLang()).toBe("en");
    expect(t("chatTitle")).toBe("摇光合规助手 clausr.ai");
    expect(t("step1")).toBe("Scope");
    expect(t("step2")).toBe("Documents & Validation");
    expect(t("step3")).toBe("Audit");
  });

  it("returns CN strings after switching", () => {
    setLang("zh");
    expect(getLang()).toBe("zh");
    expect(t("chatTitle")).toBe("摇光合规助手 clausr.ai");
    expect(t("step1")).toBe("选范围");
    expect(t("step2")).toBe("文档与验证");
    expect(t("step3")).toBe("审核");
  });

  it("falls back to key for unknown keys", () => {
    expect(t("nonexistent_key" as any)).toBe("nonexistent_key");
  });

  it("supports template interpolation", () => {
    const result = t("scopeChangeMsg", { n: 3 });
    expect(result).toContain("3");
  });

  it("toggles language", () => {
    setLang("zh");
    expect(getLang()).toBe("zh");
    setLang("en");
    expect(getLang()).toBe("en");
  });

  it("has all required step keys", () => {
    const keys = ["chatTitle", "step1", "step2", "step3", "welcomeMsg", "inputPlaceholder"];
    for (const key of keys) {
      const val = t(key as any);
      expect(val).not.toBe("");
      expect(val).not.toBe(key);
    }
  });
});
