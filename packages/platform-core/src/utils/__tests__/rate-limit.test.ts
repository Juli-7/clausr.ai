import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

// The rate-limit module uses a module-level Map as store.
// Since each test file gets its own module instance in vitest,
// we can rely on fresh state per test file.

describe("checkRateLimit", () => {
  it("allows first request", () => {
    const result = checkRateLimit("test-key", 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("allows requests within limit", () => {
    checkRateLimit("key-1", 3);
    checkRateLimit("key-1", 3);
    const result = checkRateLimit("key-1", 3);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks request exceeding limit", () => {
    for (let i = 0; i < 2; i++) checkRateLimit("burst-key", 2);
    const result = checkRateLimit("burst-key", 2);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    checkRateLimit("reset-key", 1, 50);
    const blocked = checkRateLimit("reset-key", 1, 50);
    expect(blocked.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 60));
    const allowed = checkRateLimit("reset-key", 1, 50);
    expect(allowed.allowed).toBe(true);
    expect(allowed.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    checkRateLimit("a", 1);
    const aBlocked = checkRateLimit("a", 1);
    expect(aBlocked.allowed).toBe(false);

    const bAllowed = checkRateLimit("b", 1);
    expect(bAllowed.allowed).toBe(true);
  });

  it("returns correct resetAt timestamp", () => {
    const before = Date.now();
    const result = checkRateLimit("timing", 5, 60_000);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt).toBeLessThan(before + 60_100);
  });
});
