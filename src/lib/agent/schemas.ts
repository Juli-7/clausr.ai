import { z } from "zod";

// ── Citations ──

export const CitationSchema = z.object({
  ref: z.string().min(1),
  regulation: z.string().min(1),
  clause: z.string().min(1),
});

export const SourceChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  wordBoxes: z.array(z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })).optional(),
  pageNumber: z.number().optional(),
});

export const SourceCitationSchema = z.object({
  ref: z.number().int().positive(),
  fileId: z.string(),
  filename: z.string(),
  fileUrl: z.string().optional(),
  extractedText: z.string(),
  keyExcerpt: z.string(),
  chunks: z.array(SourceChunkSchema).optional(),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  pageNumber: z.number().optional(),
});

// ── Response ──

export const VerdictSchema = z.enum(["PASS", "FAIL"]);

export const ValidationErrorSchema = z.object({
  type: z.enum(["citation-mismatch", "template-incomplete", "verdict-inconsistent", "source-mismatch", "chunk-mismatch", "chunk-missing", "step-missing"]),
  message: z.string(),
});

export const ReasoningStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  subStep: z.number().int().positive().optional(),
  title: z.string(),
  body: z.string(),
});

export const LessonSchema = z.object({
  text: z.string(),
  confidence: z.number().min(1).max(10),
  sourceSkill: z.string(),
});

// ── Tool call records (for render in reasoning panel) — must be before AgentResponseSchema ──

export const ClaimSchema = z.object({
  statement: z.string().min(1),
  citationRef: z.string().min(1),
  chunkRef: z.string().optional(),
  sourceRef: z.number().int().positive().optional(),
});

export const ToolCallRecordSchema = z.object({
  step: z.number().int().positive(),
  toolName: z.string(),
  summary: z.string(),
  status: z.enum(["success", "error"]),
});

export const ConfidenceSchema = z.object({
  score: z.number().min(0).max(100),
  ocrConfidence: z.number().min(0).max(100),
  dataCompleteness: z.number().min(0).max(100),
  llmMultiplier: z.number().min(0.5).max(1),
  llmReasoning: z.string(),
  needsExpert: z.boolean(),
});

export const AgentResponseSchema = z.object({
  content: z.string(),
  reasoning: z.string(),
  citations: z.array(CitationSchema),
  sourceCitations: z.array(SourceCitationSchema).optional(),
  round: z.number().int().positive(),
  sessionId: z.string(),
  verdict: VerdictSchema,
  lesson: LessonSchema.optional(),
  clauseTexts: z.record(z.string(), z.string()).optional(),
  toolCalls: z.array(ToolCallRecordSchema).optional(),
  reasoningSteps: z.array(ReasoningStepSchema).optional(),
  claims: z.array(ClaimSchema).optional(),
  confidence: ConfidenceSchema.optional(),
  validationErrors: z.array(ValidationErrorSchema).optional(),
  sections: z.record(
    z.string(),
    z.union([z.record(z.string(), z.string()), z.string()])
  ).optional(),
});

// ── Request ──

export const ChatRequestFileSchema = z.object({
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().min(1),
  dataUrl: z.string().optional(),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  skillName: z.string(),
  sessionId: z.string().min(1, "Session ID is required"),
  files: z.array(ChatRequestFileSchema).optional(),
});

// ── Script tools ──

export const ComplianceCheckSchema = z.object({
  checks: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      limit: z.union([z.number(), z.string()]),
      operator: z.enum([">=", ">", "<=", "<", "range"]),
      clause: z.string(),
    })
  ),
});

// ── Reference map (e.g. references.json) ──

export const ReferenceMapSchema = z.record(z.string(), z.string());
export type ReferenceMap = z.infer<typeof ReferenceMapSchema>;

// ── Derived types (keeps TypeScript types in sync with schemas) ──

export type Citation = z.infer<typeof CitationSchema>;
export type SourceChunk = z.infer<typeof SourceChunkSchema>;
export type SourceCitation = z.infer<typeof SourceCitationSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatRequestFile = z.infer<typeof ChatRequestFileSchema>;
export type ComplianceCheckInput = z.infer<typeof ComplianceCheckSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;
