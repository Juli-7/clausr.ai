import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { logger } from "../logger";

const OLD_LOG_LEVEL = process.env.LOG_LEVEL;

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.LOG_LEVEL = "debug";
  });

  afterAll(() => {
    process.env.LOG_LEVEL = OLD_LOG_LEVEL;
  });

  it("logs info messages", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]!).toContain("[INFO]");
    expect(spy.mock.calls[0]![0]!).toContain("test message");
  });

  it("logs error messages", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("error message", { code: 500 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]!).toContain("[ERROR]");
    expect(spy.mock.calls[0]![0]!).toContain("error message");
    expect(spy.mock.calls[0]![0]!).toContain('{"code":500}');
  });

  it("logs warn messages", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("warn message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]!).toContain("[WARN]");
    expect(spy.mock.calls[0]![0]!).toContain("warn message");
  });

  it("logs debug messages", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("debug message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]!).toContain("[DEBUG]");
    expect(spy.mock.calls[0]![0]!).toContain("debug message");
  });

  it("includes optional meta in output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("with meta", { userId: "u1", action: "test" });
    const output = spy.mock.calls[0]![0]! as string;
    expect(output).toContain('"userId":"u1"');
    expect(output).toContain('"action":"test"');
  });

  it("formats timestamp correctly", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("timestamp test");
    const output = spy.mock.calls[0]![0]! as string;
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
