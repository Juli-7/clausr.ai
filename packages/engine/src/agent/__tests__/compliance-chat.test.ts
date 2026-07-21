import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAddUserMessage, mockAddAssistantMessage, mockLogInfo } = vi.hoisted(() => ({
  mockAddUserMessage: vi.fn(),
  mockAddAssistantMessage: vi.fn(),
  mockLogInfo: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((config: { execute: (...args: unknown[]) => unknown }) => ({
    type: "function",
    function: { execute: config.execute },
    execute: config.execute,
  })),
}));

vi.mock("../llm/factory", () => ({
  createModel: vi.fn(() => ({ modelId: "test-model" })),
}));

vi.mock("../shared/memory/repository", () => ({
  addUserMessage: mockAddUserMessage,
  addAssistantMessage: mockAddAssistantMessage,
}));

vi.mock("../pipeline/logger", () => ({
  logInfo: mockLogInfo,
}));

vi.mock("../../orchestration/prompts", () => ({
  COMPLIANCE_SYSTEM_PROMPTS: {
    1: "Step 1 system prompt",
    2: "Step 2 system prompt",
  },
  buildComplianceStepPrompt: vi.fn((step: number, packs: unknown[]) =>
    `Custom prompt for step ${step} with ${packs.length} packs`),
}));

import { streamText } from "ai";
import { complianceChat } from "../../orchestration/chat";

function makeStreamMock(events: unknown[]) {
  const gen = (async function* () {
    for (const e of events) yield e;
  })();
  return {
    fullStream: gen,
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
  };
}

describe("complianceChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields error when no system prompt found for step number", async () => {
    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      step: 99,
    });
    const events: unknown[] = [];
    for await (const e of gen) events.push(e);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", error: "No system prompt for step 99" });
  });

  it("yields error when no systemPrompt and no step provided", async () => {
    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
    });
    const events: unknown[] = [];
    for await (const e of gen) events.push(e);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", error: "systemPrompt is required when step is not provided" });
  });

  it("persists user message and yields events in correct order", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeStreamMock([
      { type: "text-delta", text: "Hello" },
      { type: "text-delta", text: " world" },
      { type: "tool-call", toolName: "list_packs", input: {} },
      { type: "tool-result", toolName: "list_packs", output: { packs: [] } },
      { type: "finish", finishReason: "stop" },
    ]));

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "list packs" }],
      step: 1,
    });
    const events: { type: string; [key: string]: unknown }[] = [];
    for await (const e of gen) events.push(e as { type: string; [key: string]: unknown });

    expect(mockAddUserMessage).toHaveBeenCalledWith("session-1", "list packs");
    expect(mockAddAssistantMessage).toHaveBeenCalledWith("session-1", "Hello world");

    const types = events.map((e) => e.type);
    expect(types).toEqual(["text-delta", "text-delta", "tool-call", "tool-result", "finish", "done"]);
    expect(events[5]).toMatchObject({ type: "done", response: "Hello world" });
  });

  it("handles tool execution error events", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeStreamMock([
      { type: "text-delta", text: "Checking..." },
      { type: "error", error: new Error("Tool execution failed") },
    ]));

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "check" }],
      systemPrompt: "custom prompt",
    });
    const events: { type: string; [key: string]: unknown }[] = [];
    for await (const e of gen) events.push(e as { type: string; [key: string]: unknown });

    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toMatchObject({ error: "Tool execution failed" });
  });

  it("handles timeout/abort errors", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fullStream: (async function* () {
        throw Object.assign(new Error("Request timed out"), { name: "AbortError" });
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    });

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "test",
    });
    const events: { type: string; [key: string]: unknown }[] = [];
    for await (const e of gen) events.push(e as { type: string; [key: string]: unknown });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", error: "request timed out" });
  });

  it("handles LLM config error from createModel", async () => {
    const factory = await import("../llm/factory");
    vi.mocked(factory.createModel).mockImplementationOnce(() => {
      throw new Error("No API key found");
    });

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "test",
    });
    const events: { type: string; [key: string]: unknown }[] = [];
    for await (const e of gen) events.push(e as { type: string; [key: string]: unknown });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", error: "No API key found" });
  });

  it("filters disallowed tools from tool registry", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeStreamMock([
      { type: "text-delta", text: "ok" },
      { type: "finish", finishReason: "stop" },
    ]));

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "test",
      disallowedTools: ["export_document", "detach_file"],
    });
    const events: unknown[] = [];
    for await (const e of gen) events.push(e);

    const callArgs = (streamText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const toolNames = Object.keys(callArgs.tools);
    expect(toolNames).not.toContain("export_document");
    expect(toolNames).not.toContain("detach_file");
    expect(toolNames).toContain("list_packs");
    expect(toolNames).toContain("set_scope");
  });

  it("uses custom systemPrompt when provided", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeStreamMock([
      { type: "text-delta", text: "result" },
      { type: "finish", finishReason: "stop" },
    ]));

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "You are a custom assistant",
    });
    const events: unknown[] = [];
    for await (const e of gen) events.push(e);

    const callArgs = (streamText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.system).toBe("You are a custom assistant");
  });

  it("builds step prompt from packs when custom not provided", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeStreamMock([
      { type: "text-delta", text: "result" },
      { type: "finish", finishReason: "stop" },
    ]));

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      step: 2,
      packs: [{ id: "test-pack", title: "Test" }] as never[],
    });
    const events: unknown[] = [];
    for await (const e of gen) events.push(e);

    const callArgs = (streamText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.system).toContain("Custom prompt for step 2");
  });

  it("uses COMPLIANCE_SYSTEM_PROMPTS when no custom and no packs", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeStreamMock([
      { type: "text-delta", text: "result" },
      { type: "finish", finishReason: "stop" },
    ]));

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      step: 1,
    });
    const events: unknown[] = [];
    for await (const e of gen) events.push(e);

    const callArgs = (streamText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.system).toBe("Step 1 system prompt");
  });

  it("does not persist assistant message when empty text", async () => {
    (streamText as unknown as ReturnType<typeof vi.fn>).mockReturnValue(makeStreamMock([
      { type: "finish", finishReason: "stop" },
    ]));

    const gen = complianceChat("session-1", {
      messages: [{ role: "user", content: "hello" }],
      systemPrompt: "test",
    });
    const events: unknown[] = [];
    for await (const e of gen) events.push(e);

    expect(mockAddAssistantMessage).not.toHaveBeenCalled();
  });
});
