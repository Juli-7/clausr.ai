import { parseSteps, type ParsedStep } from "@/lib/agent/skill/step-parser";
import { createPipelineContext } from "./pipeline-context";
import { executeStep } from "./step-executor";
import type { StepResult } from "./step-executor";
import { executeLlmStep } from "./executors/llm-executor";
import { postValidate, validateClaimChunks } from "./post-validate";
import { getSkill } from "@/lib/agent/skill/registry";
import {
  getOrCreateSession,
  addUserMessage,
  addAssistantResponse,
  getResponseCount,
  getConversationHistory,
  saveFileContents,
  saveFileChunks,
  saveContextSnapshot,
} from "@/lib/agent/memory/repository";
import { pruneOldSessions } from "@/lib/agent/memory/cleanup";
import { extractFileContent } from "@/lib/agent/extractors";
import { AgentResponseSchema, ClaimSchema } from "@/lib/agent/schemas";
import { buildClauseTextsFromPalette } from "./clause-texts";
import { logPipeline, truncate } from "./logger";
import {
  PipelineError,
  SkillLoadError,
  generateCorrelationId,
  formatPipelineError,
} from "./errors";
import type { AgentResponse } from "@/lib/agent/types";
import type { Citation, SourceCitation, Claim } from "@/lib/agent/schemas";
import type { PipelineContext, CitationPaletteEntry } from "./pipeline-context";

export async function* orchestratePipeline(
  message: string,
  skillName: string,
  sessionId: string,
  useTemplate?: boolean,
  files?: {
    name: string;
    size: number;
    type: string;
    dataUrl?: string;
  }[]
): AsyncGenerator<
  | { type: "status"; phase: string; stepTitle?: string }
  | { type: "token"; text: string; stepNumber: number }
  | { type: "tool-result"; stepNumber: number; results: { name: string; value: number; limit: number | string; comparison: string; status: "pass" | "fail"; note?: string }[] }
  | { type: "done"; response: AgentResponse }
  | { type: "error"; error: string; code?: string; correlationId?: string }
> {
  const correlationId = generateCorrelationId();
  logPipeline(`=== PIPELINE START === cid=${correlationId} skill="${skillName}" session="${sessionId}" msg="${truncate(message, 100)}"`);

  // ── Load skill ──
  let skill;
  try {
    skill = getSkill(skillName);
  } catch (err) {
    logPipeline(`ERROR loading skill "${skillName}": ${err}`);
    yield {
      type: "error",
      error: formatPipelineError(err, correlationId),
      code: err instanceof PipelineError ? err.code : "SKILL_NOT_FOUND",
      correlationId,
    };
    return;
  }

  if (!skill) {
    logPipeline(`ERROR: skill "${skillName}" not found`);
    yield {
      type: "error",
      error: `Skill "${skillName}" not found`,
      code: "SKILL_NOT_FOUND",
      correlationId,
    };
    return;
  }
  logPipeline(`skill loaded: "${skill.name}" template="${skill.template?.name ?? "none"}" scripts=${skill.scripts.length} refs=${skill.references.length}`);

  getOrCreateSession(sessionId, skillName);
  addUserMessage(sessionId, message);

  // ── Retention cleanup ──
  try { pruneOldSessions(); } catch { /* best-effort */ }

  // ── Create pipeline context ──
  const ctx = createPipelineContext(
    skill.name,
    skill.skillmd,
    skill.template,
    sessionId,
    correlationId,
    useTemplate
  );

  // ── Process uploaded files ──
  if (files && files.length > 0) {
    yield { type: "status", phase: "processing-files" };
    logPipeline(`processing ${files.length} file(s)`);

    for (const f of files) {
      try {
        const extracted = await extractFileContent(f);
        logPipeline(`  extracted "${f.name}": ${extracted.text.length} chars, ${extracted.chunks.length} chunks, pageCount=${extracted.pageCount ?? "n/a"}`);
        ctx.uploadedFiles.push({
          fileId: f.name,
          filename: f.name,
          extractedText: extracted.text,
          chunks: extracted.chunks,
          dataUrl: f.dataUrl,
          pageCount: extracted.pageCount,
          ocrConfidence: extracted.ocrConfidence,
          extractorUsed: extracted.extractorUsed,
        });
      } catch (err) {
        logPipeline(`  extraction FAILED "${f.name}": ${err}`);
        ctx.uploadedFiles.push({
          fileId: f.name,
          filename: f.name,
          extractedText: `[Extraction failed: ${err}]`,
          chunks: [],
        });
      }
    }

    const combinedContent = ctx.uploadedFiles
      .map((f) => `[File: ${f.filename}]\n${f.extractedText}`)
      .join("\n\n");
    saveFileContents(sessionId, combinedContent);

    const chunksData = ctx.uploadedFiles.map(f => ({
      fileId: f.fileId,
      filename: f.filename,
      chunks: f.chunks ?? [],
    }));
    saveFileChunks(sessionId, JSON.stringify(chunksData));
  }

  // ── Parse SKILL.md into steps ──
  let steps;
  try {
    steps = parseSteps(skill.skillmd);
    logPipeline(`parsed ${steps.length} steps: ${steps.map(s => `${s.number}.${s.title}(${s.type})`).join(" → ")}`);
  } catch (err) {
    logPipeline(`ERROR: failed to parse steps: ${err}`);
    yield {
      type: "error",
      error: formatPipelineError(err, correlationId),
      code: err instanceof PipelineError ? err.code : "SKILL_PARSE_FAILED",
      correlationId,
    };
    return;
  }

  yield { type: "status", phase: `executing-${steps.length}-steps` };

  const turnNumber = getResponseCount(sessionId) + 1;

  // ── Execute each step in order ──
  for (const step of steps) {
    yield { type: "status", phase: `step-${step.number}`, stepTitle: step.title };
    logPipeline(`→ STEP ${step.number}: "${step.title}" (type=${step.type})`);

    const result: StepResult = await executeStep(step, ctx, 1);

    if (!result.success) {
      logPipeline(`✗ STEP ${step.number} FAILED: ${result.error}`);
      yield {
        type: "error",
        error: `Step ${step.number} failed: ${result.error}`,
        code: result.errorCode ?? "STEP_FAILED",
        correlationId,
      };
      return;
    }

    // Flush buffered stream tokens for this step
    if (result.streamedTokens && result.streamedTokens.length > 0) {
      for (const token of result.streamedTokens) {
        yield { type: "token", text: token, stepNumber: step.number };
      }
    }

    // Flush tool results for this step (per-check, not aggregate)
    if (result.toolResults && result.toolResults.length > 0) {
      yield { type: "tool-result", stepNumber: step.number, results: result.toolResults };
    }

    const output = ctx.stepOutputs[String(step.number)];
    logPipeline(`✓ STEP ${step.number} done. output: ${output ? truncate(JSON.stringify(output), 200) : "(none)"}`);

    // Post-step: populate typed fields from step output
    if (output && typeof output === "object" && !Array.isArray(output)) {
      const obj = output as Record<string, unknown>;
      // Check if this looks like vehicle data (flat or nested under "vehicle")
      if (!ctx.vehicleData) {
        const flatObj = flattenObjectForVehicleData(obj);
        if (isVehicleData(flatObj)) {
          ctx.vehicleData = {
            make: String(flatObj.make ?? ""),
            model: String(flatObj.model ?? ""),
            lightSource: String(flatObj.lightSource ?? ""),
            mountingHeight: String(flatObj.mountingHeight ?? ""),
            beamPattern: String(flatObj.beamPattern ?? ""),
            luminousFlux: String(flatObj.luminousFlux ?? ""),
            colorTemp: String(flatObj.colorTemp ?? ""),
            cutoffSharpness: String(flatObj.cutoffSharpness ?? ""),
            levelingDeviation: String(flatObj.levelingDeviation ?? ""),
          };
          logPipeline(`  → populated ctx.vehicleData from step ${step.number} output`);
        }
      }
    }

    // Check if checkResults were populated by the step executor (tool step)
    if (ctx.checkResults.length > 0) {
      logPipeline(`  → ctx.checkResults now has ${ctx.checkResults.length} entries (from step ${step.number})`);
      // Compile citations from check results + palette (deterministic)
      compileCitationsFromCheckResults(ctx);
    }

    // ── Capture context snapshot for audit ──
    if (result.contextSnapshot) {
      try {
        saveContextSnapshot({
          sessionId,
          turnNumber,
          stepNumber: step.number,
          stepTitle: step.title,
          stepType: step.type,
          systemPrompt: result.contextSnapshot.systemPrompt,
          userMessage: result.contextSnapshot.userMessage,
          contextSummary: result.contextSnapshot.contextSummary,
          skillmd: ctx.skill.skillmd,
          templateJson: ctx.skill.template ? JSON.stringify(ctx.skill.template) : null,
          loadedReferences: JSON.stringify(ctx.loadedReferences.map(r => ({ filename: r.filename, content: r.content.slice(0, 5000) }))),
          uploadedFilesJson: JSON.stringify(ctx.uploadedFiles.map(f => ({
            fileId: f.fileId, filename: f.filename, extractedText: f.extractedText?.slice(0, 3000) ?? "(none)",
            chunkCount: f.chunks?.length ?? 0,
            chunkIds: f.chunks?.slice(0, 10).map(c => c.id) ?? [],
            hasPositionData: f.chunks?.some(c => c.wordBoxes && c.wordBoxes.length > 0) ?? false,
          }))),
          stepOutputsJson: JSON.stringify(ctx.stepOutputs),
        });
      } catch { /* snapshot is best-effort, never block pipeline */ }
    }
  }

  // ── Auto-trigger: compile compliance report (if template mode, after all checks done) ──
  const maxStepNum = steps.length > 0 ? Math.max(...steps.map(s => s.number)) : 0;

  if (ctx.useTemplate && ctx.skill.template && ctx.checkResults.length > 0) {
    yield { type: "status", phase: "compiling-report" };
    logPipeline("→ AUTO: compiling compliance report");

    const reportStep: ParsedStep = {
      number: maxStepNum + 1,
      title: "Compile compliance report with clause citations",
      type: "llm",
      instructions: "Compile the final compliance report using the check results, citation palette, and template format above. Output valid JSON with content and sections matching the template structure. Every field value MUST end with citation markers.",
      temperature: 0.2,
    };

    const reportResult = await executeStep(reportStep, ctx, 1);
    if (reportResult.success) {
      const output = ctx.stepOutputs[String(reportStep.number)];
      if (output && typeof output === "object") {
        const obj = output as Record<string, unknown>;
        if (obj.sections && typeof obj.sections === "object") {
          ctx.reportSections = obj.sections as Record<string, Record<string, string> | string>;
          logPipeline(`  ✓ auto report: sections=${Object.keys(ctx.reportSections).join(", ")}`);
        }
        // Layer 5: Extract structured claims from LLM output (Zod validated)
        if (obj.claims && Array.isArray(obj.claims)) {
          const parsed = ClaimSchema.array().safeParse(obj.claims);
          if (parsed.success) {
            ctx.claims = parsed.data;
            logPipeline(`  ✓ auto report: ${ctx.claims.length} claims extracted`);
            buildCitationsFromClaims(ctx);
          } else {
            logPipeline(`  ⚠ claims validation: ${parsed.error.issues.length} issue(s) — ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
          }
        }
      }

      // ── Chunk validation retry (Phase 4.3) ──
      if (reportResult.success && ctx.claims.length > 0) {
        const chunkErrors = validateClaimChunks(ctx);
        if (chunkErrors.length > 0) {
          logPipeline(`  ⚠ chunk validation: ${chunkErrors.length} issue(s), retrying report step once`);
          const retryErrorMsg = "Chunk reference validation errors in previous attempt:\n" +
            chunkErrors.map(e => `- ${e.message}`).join("\n") +
            "\n\nPlease fix the chunkRef values on the claims to match the actual chunk IDs shown in the source files.";
          const retryResult = await executeLlmStep(reportStep, ctx, retryErrorMsg);
          if (retryResult.success) {
            const retryOutput = ctx.stepOutputs[String(reportStep.number)];
            if (retryOutput && typeof retryOutput === "object") {
              const robj = retryOutput as Record<string, unknown>;
              if (robj.sections && typeof robj.sections === "object") {
                ctx.reportSections = robj.sections as Record<string, Record<string, string> | string>;
                logPipeline(`  ✓ retry report: sections=${Object.keys(ctx.reportSections).join(", ")}`);
              }
              if (robj.claims && Array.isArray(robj.claims)) {
                const retryParsed = ClaimSchema.array().safeParse(robj.claims);
                if (retryParsed.success) {
                  ctx.claims = retryParsed.data;
                  logPipeline(`  ✓ retry report: ${ctx.claims.length} claims extracted`);
                  buildCitationsFromClaims(ctx);
                } else {
                  logPipeline(`  ⚠ retry claims validation: ${retryParsed.error.issues.length} issue(s)`);
                }
              }
            }
            const retryChunkErrors = validateClaimChunks(ctx);
            if (retryChunkErrors.length > 0) {
              logPipeline(`  ⚠ retry still has ${retryChunkErrors.length} chunk issue(s) — surfacing as validation errors`);
            } else {
              logPipeline(`  ✓ chunk validation passed after retry`);
            }
          } else {
            logPipeline(`  ⚠ retry failed: ${retryResult.error}`);
          }
        }
      }
      // Don't yield tokens — auto steps don't go to reasoning panel
    } else {
      logPipeline(`  ⚠ auto report failed: ${reportResult.error}`);
    }
  } else if (ctx.checkResults.length > 0) {
    // No template: build plain report from check results with deterministic citation markers (Layer 2)
    const lines = ctx.checkResults.map(c =>
      `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef}]${c.sourceRef ? ` [S${c.sourceRef}]` : ""}`
    );
    if (ctx.sourcePalette.length > 0) {
      const sourceMarkers = ctx.sourcePalette.map(s => `[S${s.id}]`).join(" ");
      lines.push(`\nSources: ${sourceMarkers}`);
    }
    ctx.reportSections = {
      assessment: lines.join("\n\n"),
    };
  }

  // ── Layer 3: Supplementation — scan report content for unregistered citation markers ──
  supplementCitationsFromContent(ctx);

  // ── Auto-trigger: compute verdict ──
  yield { type: "status", phase: "computing-verdict" };
  logPipeline("→ AUTO: computing verdict");
  {
    const failureCount = ctx.checkResults.filter(c => c.verdict === "FAIL").length;
    ctx.verdict = ctx.checkResults.length > 0 && ctx.checkResults.some(c => c.verdict === "FAIL")
      ? "FAIL"
      : "PASS";
    logPipeline(`  ✓ auto verdict=${ctx.verdict} (${ctx.checkResults.length} checks, ${failureCount} failures)`);
  }

  // ── Confidence scoring ──
  yield { type: "status", phase: "computing-confidence" };
  logPipeline("→ AUTO: computing confidence");
  const confidence = computeObjectiveConfidence(ctx);
  logPipeline(`  ✓ confidence=${confidence.score.toFixed(1)}% (ocr=${confidence.ocrConfidence.toFixed(0)}% data=${confidence.dataCompleteness.toFixed(0)}% llm×${confidence.llmMultiplier.toFixed(2)})${confidence.needsExpert ? " NEEDS_EXPERT" : ""}`);

  // ── Post-validation ──
  yield { type: "status", phase: "validating" };
  const validationErrors = postValidate(ctx);

  if (validationErrors.length > 0) {
    logPipeline(`⚠ POST-VALIDATION found ${validationErrors.length} issue(s): ${validationErrors.map(e => e.message).join("; ")}`);
    yield { type: "status", phase: "validated-with-issues" };
  } else {
    logPipeline("✓ post-validation passed");
  }

  // ── Build final response ──
  const round = getResponseCount(sessionId) + 1;

  const clauseTexts = buildClauseTextsFromPalette(ctx.citationPalette);

  const responseData: Record<string, unknown> = {
    content: formatContent(ctx, steps),
    reasoning: buildReasoningFromSteps(ctx, steps),
    citations: ctx.compiledCitations,
    sourceCitations:
      ctx.compiledSourceCitations.length > 0
        ? ctx.compiledSourceCitations
        : undefined,
    round,
    sessionId,
    verdict: ctx.verdict ?? "PASS",
    clauseTexts: Object.keys(clauseTexts).length > 0
      ? clauseTexts
      : undefined,
    sections: ctx.reportSections ?? undefined,
  };

  // Include tool call records if any
  const toolCalls = ctx.stepOutputs["toolCalls"];
  if (toolCalls) {
    responseData.toolCalls = toolCalls;
    logPipeline(`tool calls in response: ${JSON.stringify(toolCalls)}`);
  }

  // Include reasoning steps (for session restore)
  const reasoningSteps = buildReasoningSteps(ctx, steps);
  if (reasoningSteps.length > 0) {
    responseData.reasoningSteps = reasoningSteps;
  }

  // Include structured claims (Layer 5)
  if (ctx.claims.length > 0) {
    responseData.claims = ctx.claims;
  }

  // Include confidence score
  responseData.confidence = confidence;

  // Include validation errors if any
  if (validationErrors.length > 0) {
    responseData.validationErrors = validationErrors;
  }

  logPipeline(`final response: content=${(responseData.content as string).length}chars citations=${(responseData.citations as any[])?.length} verdict=${responseData.verdict}`);

  const agentResponse = AgentResponseSchema.parse(responseData);
  addAssistantResponse(sessionId, agentResponse);

  logPipeline(`=== PIPELINE DONE === round=${round}`);
  yield { type: "done", response: agentResponse };
}

// ── Helpers ──

function formatContent(
  ctx: PipelineContext,
  steps: ReturnType<typeof parseSteps>
): string {
  if (ctx.reportSections) {
    const parts: string[] = [];
    for (const [sectionId, value] of Object.entries(ctx.reportSections)) {
      if (typeof value === "string") {
        parts.push(`## ${sectionId}\n${value}`);
      } else if (typeof value === "object" && value !== null) {
        const tableRows = Object.entries(value)
          .map(([k, v]) => `| ${k} | ${v} |`)
          .join("\n");
        parts.push(`## ${sectionId}\n| Field | Value |\n| --- | --- |\n${tableRows}`);
      }
    }
    return parts.join("\n\n");
  }

  // Fallback: use last LLM step output
  const llmSteps = steps.filter(
    (s) => s.type === "llm" || s.type === "llm+tool"
  );
  const lastLlm = llmSteps[llmSteps.length - 1];
  if (lastLlm) {
    const output = ctx.stepOutputs[String(lastLlm.number)];
    if (typeof output === "string") return output;
    if (output) return JSON.stringify(output, null, 2);
  }

  return "Assessment not available.";
}

/**
 * Check if a parsed step output looks like vehicle data.
 * Matches on the presence of vehicle-related keys.
 */
function isVehicleData(obj: Record<string, unknown>): boolean {
  const vehicleKeys = ["make", "model", "lightSource", "mountingHeight", "beamPattern"];
  const matches = vehicleKeys.filter((k) => k in obj).length;
  return matches >= 3; // at least 3 vehicle keys present
}

/**
 * Flatten a potentially nested step output to find vehicle data keys.
 * Handles: { vehicle: { make: "Audi", ... }, lighting_system: { ... } }
 * by checking first-level nested objects for the vehicle keys.
 */
function flattenObjectForVehicleData(obj: Record<string, unknown>): Record<string, unknown> {
  // First check if the top-level object already has the keys
  const vehicleKeys = ["make", "model", "lightSource", "mountingHeight", "beamPattern"];
  const topLevelMatches = vehicleKeys.filter((k) => k in obj).length;
  if (topLevelMatches >= 2) return obj;

  // Try common nested paths
  const nestedPaths = ["vehicle", "lighting_system", "specs", "data", "vehicleData"];
  for (const path of nestedPaths) {
    const nested = obj[path];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedObj = nested as Record<string, unknown>;
      const matches = vehicleKeys.filter((k) => k in nestedObj).length;
      if (matches >= 2) return nestedObj;
    }
  }

  // Deep search any nested object
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nestedObj = val as Record<string, unknown>;
      const matches = vehicleKeys.filter((k) => k in nestedObj).length;
      if (matches >= 2) return nestedObj;
    }
  }

  return obj;
}

/**
 * Compute confidence score from objective data + optional LLM assessment.
 * OCR quality, data completeness, and extractor path form the base penalty.
 * LLM provides a multiplier (0.5-1.0) for subjective factors.
 */
function computeObjectiveConfidence(ctx: PipelineContext): {
  score: number;
  ocrConfidence: number;
  dataCompleteness: number;
  llmMultiplier: number;
  llmReasoning: string;
  needsExpert: boolean;
} {
  // ── OCR confidence (average across all uploaded files) ──
  let avgOcr = 100;
  const withOcr = ctx.uploadedFiles.filter(f => f.ocrConfidence !== undefined);
  if (withOcr.length > 0) {
    avgOcr = withOcr.reduce((s, f) => s + (f.ocrConfidence ?? 100), 0) / withOcr.length;
  }
  const ocrPenalty = (1 - avgOcr / 100) * 30;

  // ── Data completeness (vehicle fields populated) ──
  const vehicleFields = ctx.vehicleData ? Object.keys(ctx.vehicleData).filter(k => {
    const v = (ctx.vehicleData as unknown as Record<string, unknown>)[k];
    return v !== null && v !== undefined && v !== "" && v !== "unknown";
  }) : [];
  const totalFields = ctx.vehicleData ? Object.keys(ctx.vehicleData).length : 10;
  const filledCount = vehicleFields.length;
  const completeness = totalFields > 0 ? (filledCount / totalFields) * 100 : 100;
  const dataPenalty = ((totalFields - filledCount) / totalFields) * 30;

  // ── PDF quality penalty ──
  let pdfPenalty = 0;
  for (const f of ctx.uploadedFiles) {
    if (f.extractorUsed === "pdf-parse") pdfPenalty = Math.max(pdfPenalty, 5);
    else if (f.extractorUsed === "fallback") pdfPenalty = Math.max(pdfPenalty, 10);
    // pdfjs-dist: 0% penalty (default)
  }

  const baseScore = Math.max(0, 100 - ocrPenalty - dataPenalty - pdfPenalty);

  // ── LLM adjustment — extract from report step output if available ──
  let llmMultiplier = 1.0;
  let llmReasoning = "No LLM assessment available";
  const stepKeys = Object.keys(ctx.stepOutputs);
  for (const key of stepKeys) {
    const output = ctx.stepOutputs[key];
    if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      if (obj.confidence && typeof obj.confidence === "object") {
        const c = obj.confidence as Record<string, unknown>;
        if (typeof c.llmMultiplier === "number") llmMultiplier = c.llmMultiplier;
        if (typeof c.llmReasoning === "string") llmReasoning = c.llmReasoning;
      }
    }
  }
  // Clamp LLM multiplier
  llmMultiplier = Math.max(0.5, Math.min(1.0, llmMultiplier));

  const finalScore = Math.round(baseScore * llmMultiplier * 10) / 10; // 1 decimal

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    ocrConfidence: Math.round(avgOcr),
    dataCompleteness: Math.round(completeness),
    llmMultiplier: Math.round(llmMultiplier * 100) / 100,
    llmReasoning,
    needsExpert: finalScore < 50,
  };
}

/**
 * Deterministically compile citations from check results and palette.
 * Runs after checkResults are populated (after Step 3 or later tool steps).
 */
function compileCitationsFromCheckResults(ctx: PipelineContext): void {
  const citationMap = new Map<string, Citation>();
  const sourceMap = new Map<number, SourceCitation>();

  for (const check of ctx.checkResults) {
    if (!citationMap.has(check.citationRef)) {
      const entry = ctx.citationPalette.find(
        (e) => e.id === check.citationRef
      );
      if (entry) {
        citationMap.set(check.citationRef, {
          ref: entry.id,
          regulation: entry.regulation,
          clause: entry.clause,
        });
      }
    }

    if (check.sourceRef && !sourceMap.has(check.sourceRef)) {
      const entry = ctx.sourcePalette.find(
        (e) => e.id === check.sourceRef
      );
      if (entry) {
        sourceMap.set(check.sourceRef, {
          ref: entry.id,
          fileId: entry.fileId,
          filename: entry.filename,
          fileUrl: entry.dataUrl,
          extractedText: entry.extractedText,
          keyExcerpt: entry.keyExcerpt,
          pageNumber: entry.pageNumber,
        });
      }
    }
  }

  ctx.compiledCitations = Array.from(citationMap.values()).sort(
    (a, b) => a.ref.localeCompare(b.ref)
  );

  // If source palette has entries but none were referenced by checks, include all
  if (sourceMap.size === 0 && ctx.sourcePalette.length > 0) {
    for (const entry of ctx.sourcePalette) {
      sourceMap.set(entry.id, {
        ref: entry.id,
        fileId: entry.fileId,
        filename: entry.filename,
        fileUrl: entry.dataUrl,
        extractedText: entry.extractedText,
        keyExcerpt: entry.keyExcerpt,
        pageNumber: entry.pageNumber,
      });
    }
  }

  ctx.compiledSourceCitations = Array.from(sourceMap.values()).sort(
    (a, b) => a.ref - b.ref
  );

  if (ctx.compiledCitations.length > 0 || ctx.compiledSourceCitations.length > 0) {
    logPipeline(`  → compiled ${ctx.compiledCitations.length} regulation + ${ctx.compiledSourceCitations.length} source citations`);
  }
}

function buildReasoningSteps(
  ctx: PipelineContext,
  steps: ReturnType<typeof parseSteps>
): { stepNumber: number; title: string; body: string }[] {
  const result: { stepNumber: number; title: string; body: string }[] = [];
  for (const step of steps) {
    const output = ctx.stepOutputs[String(step.number)];
    if (output === undefined || output === null) continue;
    const body = typeof output === "string" ? output : JSON.stringify(output, null, 2);
    result.push({ stepNumber: step.number, title: step.title, body });
  }
  return result;
}

function buildReasoningFromSteps(
  ctx: PipelineContext,
  steps: ReturnType<typeof parseSteps>
): string {
  const parts: string[] = [];

  for (const step of steps) {
    const output = ctx.stepOutputs[String(step.number)];
    if (!output) continue;

    parts.push(`---STEP ${step.number}---`);
    parts.push(`${step.title}`);
    parts.push("");

    if (typeof output === "string") {
      parts.push(output.slice(0, 500));
    } else if (typeof output === "object") {
      parts.push(JSON.stringify(output, null, 2).slice(0, 500));
    }
  }

  return parts.join("\n");
}

/**
 * Layer 7 (structural path): Build compiledCitations + compiledSourceCitations
 * from structured claims extracted from LLM output.
 * Merges with existing entries (from checkResults) — never removes.
 */
function buildCitationsFromClaims(ctx: PipelineContext): void {
  if (!ctx.claims || ctx.claims.length === 0) return;

  const citationMap = new Map(ctx.compiledCitations.map(c => [c.ref, c]));
  const sourceMap = new Map(ctx.compiledSourceCitations.map(s => [s.ref, s]));

  // Collect referenced chunk IDs per file from claims' chunkRef
  const referencedChunks = new Map<number, Set<string>>();
  // First chunk ref per file — use for keyExcerpt
  const firstChunkPerFile = new Map<number, string>();

  for (const claim of ctx.claims) {
    if (claim.citationRef.startsWith("R") && !citationMap.has(claim.citationRef)) {
      const entry = ctx.citationPalette.find(e => e.id === claim.citationRef);
      if (entry) {
        citationMap.set(claim.citationRef, {
          ref: entry.id,
          regulation: entry.regulation,
          clause: entry.clause,
        });
        logPipeline(`  [CLAIMS] added citation ${claim.citationRef} from claims`);
      }
    }
    if (claim.sourceRef && !sourceMap.has(claim.sourceRef)) {
      const entry = ctx.sourcePalette.find(e => e.id === claim.sourceRef);
      if (entry) {
        sourceMap.set(claim.sourceRef, {
          ref: entry.id,
          fileId: entry.fileId,
          filename: entry.filename,
          fileUrl: entry.dataUrl,
          extractedText: entry.extractedText,
          keyExcerpt: entry.keyExcerpt,
          pageNumber: entry.pageNumber,
        });
      }
    }
    // Track referenced chunks
    if (claim.chunkRef) {
      const match = claim.chunkRef.match(/^S(\d+)\.(.+)$/);
      if (match) {
        const fileRef = parseInt(match[1], 10);
        const chunkId = match[2];
        if (!referencedChunks.has(fileRef)) referencedChunks.set(fileRef, new Set());
        referencedChunks.get(fileRef)!.add(chunkId);
        if (!firstChunkPerFile.has(fileRef)) {
          firstChunkPerFile.set(fileRef, chunkId);
        }
      }
    } else if (claim.sourceRef && !referencedChunks.has(claim.sourceRef)) {
      // Backward compat: extract chunkRef from comma-separated citationRef (e.g. "R48.6.2, S1.c3")
      const refMatch = claim.citationRef.match(/S(\d+)\.?(\S+)?/);
      if (refMatch) {
        logPipeline(`  [DEPRECATED] citationRef "${claim.citationRef}" uses comma-separated S-ref — move to chunkRef field`);
        const fileRef = parseInt(refMatch[1], 10);
        const chunkId = refMatch[2] || undefined;
        if (!referencedChunks.has(fileRef)) referencedChunks.set(fileRef, new Set());
        if (chunkId) referencedChunks.get(fileRef)!.add(chunkId);
      }
    }
  }

  // Filter source citation chunks to only include referenced ones + set keyExcerpt
  for (const [ref, source] of sourceMap) {
    const paletteEntry = ctx.sourcePalette.find(e => e.id === ref);
    if (!paletteEntry?.chunks) continue;
    const refIds = referencedChunks.get(ref);
    if (refIds && refIds.size > 0) {
      const filteredChunks = paletteEntry.chunks.filter(c => refIds.has(c.id));
      source.chunks = filteredChunks;
      // Set keyExcerpt from first referenced chunk
      const firstId = firstChunkPerFile.get(ref);
      const firstChunk = firstId ? filteredChunks.find(c => c.id === firstId) : filteredChunks[0];
      if (firstChunk) {
        source.keyExcerpt = firstChunk.text;
      }
    }
  }

  ctx.compiledCitations = Array.from(citationMap.values()).sort(
    (a, b) => a.ref.localeCompare(b.ref)
  );
  ctx.compiledSourceCitations = Array.from(sourceMap.values()).sort(
    (a, b) => a.ref - b.ref
  );
}

/**
 * Layer 3 (supplementation): Scan report section content for [R48.x.x] and [SN]
 * markers, backfill any missing entries into compiledCitations / compiledSourceCitations.
 * Runs after the auto-report step so content markers are visible before post-validation.
 */
function supplementCitationsFromContent(ctx: PipelineContext): void {
  if (!ctx.reportSections) return;

  const allContent = Object.values(ctx.reportSections)
    .map(s => (typeof s === "string" ? s : Object.values(s).join(" ")))
    .join(" ");

  const citationRefs = new Set(ctx.compiledCitations.map(c => c.ref));
  const regulationMarkers = [...allContent.matchAll(/\[(R\d+\.\d+(?:\.\d+)*)\]/g)]
    .map(m => m[1]);

  for (const marker of [...new Set(regulationMarkers)]) {
    if (!citationRefs.has(marker)) {
      const entry = ctx.citationPalette.find(e => e.id === marker);
      if (entry) {
        ctx.compiledCitations.push({
          ref: entry.id,
          regulation: entry.regulation,
          clause: entry.clause,
        });
        logPipeline(`  [SUPPLEMENT] added citation ${marker} from content scan`);
      }
    }
  }

  const sourceRefs = new Set(ctx.compiledSourceCitations.map(c => c.ref));
  const sourceMarkers = [...allContent.matchAll(/\[S(\d+)\]/g)]
    .map(m => parseInt(m[1], 10));

  for (const marker of [...new Set(sourceMarkers)]) {
    if (!sourceRefs.has(marker)) {
      const entry = ctx.sourcePalette.find(e => e.id === marker);
      if (entry) {
        ctx.compiledSourceCitations.push({
          ref: entry.id,
          fileId: entry.fileId,
          filename: entry.filename,
          fileUrl: entry.dataUrl,
          extractedText: entry.extractedText,
          keyExcerpt: entry.keyExcerpt,
          pageNumber: entry.pageNumber,
        });
      }
    }
  }
}
