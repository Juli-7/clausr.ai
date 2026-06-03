import { describe, it, expect } from "vitest";
import {
  CitationSchema,
  AgentResponseSchema,
  ChatRequestSchema,
  ComplianceCheckSchema,
} from "../shared/schemas";

describe("CitationSchema", () => {
  it("accepts a valid citation", () => {
    const result = CitationSchema.safeParse({ ref: "R48.6.1", regulation: "R48", clause: "6.1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing regulation", () => {
    const result = CitationSchema.safeParse({ ref: "R48.6.1", regulation: "", clause: "6.1" });
    expect(result.success).toBe(false);
  });

  it("rejects missing clause", () => {
    const result = CitationSchema.safeParse({ ref: "R48.6.1", regulation: "R48", clause: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty ref", () => {
    const result = CitationSchema.safeParse({ ref: "", regulation: "R48", clause: "6.1" });
    expect(result.success).toBe(false);
  });
});

describe("AgentResponseSchema", () => {
  const validResponse = {
    content: "## Report\nPasses checks.",
    reasoning: "Step 1: Analysis\nBody here.",
    citations: [{ ref: "R48.6.1", regulation: "R48", clause: "6.1" }],
    round: 1,
    sessionId: "session-abc123",
    verdict: "PASS" as const,
  };

  it("accepts a minimal valid response", () => {
    const result = AgentResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it("accepts response with optional sections", () => {
    const result = AgentResponseSchema.safeParse({
      ...validResponse,
      sections: {
        fields: { "vehicle-make": "Audi Q6 [S1] [1]" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with lesson", () => {
    const result = AgentResponseSchema.safeParse({
      ...validResponse,
      lesson: { text: "Learned something new", confidence: 8, sourceSkill: "gdpr" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with tool calls", () => {
    const result = AgentResponseSchema.safeParse({
      ...validResponse,
      toolCalls: [{ step: 1, toolName: "compliance-check.py", summary: "5/5 passed", status: "success" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with source citations", () => {
    const result = AgentResponseSchema.safeParse({
      ...validResponse,
      sourceCitations: [{
        ref: "S1.c1", fileId: "test.pdf", filename: "test.pdf",
        extractedText: "Some text", keyExcerpt: "Key excerpt",
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing content", () => {
    const { content: _, ...rest } = validResponse;
    void _;
    const result = AgentResponseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty citations entry", () => {
    const result = AgentResponseSchema.safeParse({
      ...validResponse,
      citations: [{ ref: "R48.6.1", regulation: "", clause: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid verdict", () => {
    const result = AgentResponseSchema.safeParse({
      ...validResponse,
      verdict: "MAYBE",
    });
    expect(result.success).toBe(false);
  });
});

describe("ChatRequestSchema", () => {
  it("accepts a valid chat request", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
      sessionId: "session-123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a chat request with revision fields", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
      sessionId: "session-123",
      revisionFields: ["mounting-height", "beam-pattern"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = ChatRequestSchema.safeParse({
      message: "",
      sessionId: "session-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing session ID", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
      sessionId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing session ID entirely", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
    });
    expect(result.success).toBe(false);
  });
});

describe("ComplianceCheckSchema", () => {
  it("accepts valid compliance check", () => {
    const result = ComplianceCheckSchema.safeParse({
      value: 650,
      limit: 500,
      operator: ">=",
    });
    expect(result.success).toBe(true);
  });

  it("accepts range operator with string limit", () => {
    const result = ComplianceCheckSchema.safeParse({
      value: 15,
      limit: "10-20",
      operator: "range",
    });
    expect(result.success).toBe(true);
  });

  it("accepts tolerance operator with percent", () => {
    const result = ComplianceCheckSchema.safeParse({
      value: 104,
      limit: "100±5%",
      operator: "tolerance",
    });
    expect(result.success).toBe(true);
  });

  it("accepts tolerance operator with absolute", () => {
    const result = ComplianceCheckSchema.safeParse({
      value: 101,
      limit: "100±2",
      operator: "tolerance",
    });
    expect(result.success).toBe(true);
  });

  it("accepts rounding field as number", () => {
    const result = ComplianceCheckSchema.safeParse({
      value: 1.234,
      limit: 1.2,
      operator: ">=",
      rounding: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts rounding field as string with mode", () => {
    const result = ComplianceCheckSchema.safeParse({
      value: 1.234,
      limit: 1.2,
      operator: ">=",
      rounding: "2:ceil",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid operator", () => {
    const result = ComplianceCheckSchema.safeParse({
      value: 10,
      limit: 10,
      operator: "==",
    });
    expect(result.success).toBe(false);
  });
});
