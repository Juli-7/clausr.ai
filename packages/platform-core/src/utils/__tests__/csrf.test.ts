import { describe, it, expect } from "vitest";
import { validateOrigin } from "../csrf";

describe("validateOrigin", () => {
  it("accepts prod origin", () => {
    const req = new Request("https://app.raipple.com", {
      headers: { origin: "https://app.raipple.com" },
    });
    expect(validateOrigin(req)).toEqual({ valid: true });
  });

  it("accepts prod origin with trailing slash", () => {
    const req = new Request("https://app.raipple.com", {
      headers: { origin: "https://app.raipple.com/" },
    });
    expect(validateOrigin(req)).toEqual({ valid: true });
  });

  it("rejects invalid origin", () => {
    const req = new Request("http://localhost:3000", {
      headers: { origin: "https://evil.com" },
    });
    const result = validateOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid origin");
  });

  it("rejects missing origin and referer", () => {
    const req = new Request("http://localhost:3000");
    const result = validateOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing origin or referer header");
  });

  it("accepts valid referer when origin is missing", () => {
    const req = new Request("https://app.raipple.com/settings", {
      headers: { referer: "https://app.raipple.com/settings" },
    });
    expect(validateOrigin(req)).toEqual({ valid: true });
  });

  it("rejects invalid referer", () => {
    const req = new Request("http://localhost:3000", {
      headers: { referer: "https://evil.com/login" },
    });
    const result = validateOrigin(req);
    expect(result.valid).toBe(false);
  });

  it("accepts prod origin sub-path", () => {
    const req = new Request("https://app.raipple.com/compliance", {
      headers: { origin: "https://app.raipple.com" },
    });
    expect(validateOrigin(req)).toEqual({ valid: true });
  });

  it("rejects different domain", () => {
    const req = new Request("https://app.raipple.com", {
      headers: { origin: "https://app.raipple.co" },
    });
    const result = validateOrigin(req);
    expect(result.valid).toBe(false);
  });
});
