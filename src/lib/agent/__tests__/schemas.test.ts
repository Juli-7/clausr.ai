import { describe, it, expect } from "vitest";
import {
  CitationSchema,
  AgentResponseSchema,
  ChatRequestSchema,
  ComplianceCheckSchema,
} from "@/lib/agent/schemas";

describe("CitationSchema", () => {
  it("accepts a valid citation", () => {
    const result = CitationSchema.safeParse({ ref: 1, regulation: "R48", clause: "6.1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing regulation", () => {
    const result = CitationSchema.safeParse({ ref: 1, regulation: "", clause: "6.1" });
    expect(result.success).toBe(false);
  });

  it("rejects missing clause", () => {
    const result = CitationSchema.safeParse({ ref: 1, regulation: "R48", clause: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive ref", () => {
    const result = CitationSchema.safeParse({ ref: 0, regulation: "R48", clause: "6.1" });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer ref", () => {
    const result = CitationSchema.safeParse({ ref: 1.5, regulation: "R48", clause: "6.1" });
    expect(result.success).toBe(false);
  });
});

describe("AgentResponseSchema", () => {
  const validResponse = {
    content: "## Report\nPasses checks.",
    reasoning: "Step 1: Analysis\nBody here.",
    citations: [{ ref: 1, regulation: "R48", clause: "6.1" }],
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
      lesson: { text: "Learned something new", confidence: 8, sourceSkill: "eu-vwta-lighting" },
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
        ref: 1, fileId: "test.pdf", filename: "test.pdf",
        extractedText: "Some text", keyExcerpt: "Key excerpt",
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing content", () => {
    const { content, ...rest } = validResponse;
    const result = AgentResponseSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty citations entry", () => {
    const result = AgentResponseSchema.safeParse({
      ...validResponse,
      citations: [{ ref: 1, regulation: "", clause: "" }],
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
  it("accepts a valid chat request without files", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
      skillName: "eu-vwta-lighting",
      sessionId: "session-123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid chat request with files", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
      skillName: "eu-vwta-lighting",
      sessionId: "session-123",
      files: [{ name: "test.pdf", size: 1024, type: "application/pdf", dataUrl: "data:..." }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty message", () => {
    const result = ChatRequestSchema.safeParse({
      message: "",
      skillName: "eu-vwta-lighting",
      sessionId: "session-123",
    });
    expect(result.success).toBe(false);
  });

  it("allows empty skill name for no-skill chat mode", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
      skillName: "",
      sessionId: "session-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing session ID", () => {
    const result = ChatRequestSchema.safeParse({
      message: "Check compliance",
      skillName: "eu-vwta-lighting",
      sessionId: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ComplianceCheckSchema", () => {
  it("accepts valid compliance checks", () => {
    const result = ComplianceCheckSchema.safeParse({
      checks: [
        { name: "mounting-height", value: 650, limit: 500, operator: ">=", clause: "6.1" },
        { name: "colour-temp", value: 5500, limit: 6000, operator: "<=", clause: "5.11" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts range operator", () => {
    const result = ComplianceCheckSchema.safeParse({
      checks: [
        { name: "beam-cutoff", value: 15, limit: "10-20", operator: "range", clause: "6.2" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid operator", () => {
    const result = ComplianceCheckSchema.safeParse({
      checks: [
        { name: "test", value: 10, limit: 10, operator: "==", clause: "1.1" },
      ],
    });
    expect(result.success).toBe(false);
  });
});
