import { parseSteps, type ParsedStep } from "@/lib/agent/skill/step-parser";
import { createPipelineContext } from "./pipeline-context";
import { executeStep } from "./step-executor";
import type { StepResult } from "./step-executor";
import { executeLlmStep } from "./executors/llm-executor";
import { postValidate, validateClaimChunks } from "./post-validate";
import { loadSkill } from "@/lib/agent/skill/loader";
import {
  getOrCreateSession,
  addUserMessage,
  addAssistantResponse,
  getResponseCount,
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
  generateCorrelationId,
  formatPipelineError,
} from "./errors";
import type { AgentResponse } from "@/lib/agent/types";
import type { PipelineContext } from "./pipeline-context";

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

  let skill;
  try {
    skill = loadSkill(skillName);
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

  try { pruneOldSessions(); } catch { /* best-effort */ }

  const ctx = createPipelineContext(
    skill.name,
    skill.skillmd,
    skill.template,
    sessionId,
    correlationId,
    useTemplate
  );

  if (files && files.length > 0) {
    yield { type: "status", phase: "processing-files" };
    logPipeline(`processing ${files.length} file(s)`);

    for (const f of files) {
      try {
        const extracted = await extractFileContent(f);
        logPipeline(`  extracted "${f.name}": ${extracted.text.length} chars, ${extracted.chunks.length} chunks, pageCount=${extracted.pageCount ?? "n/a"}`);
        ctx.files.addFile({
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
        ctx.files.addFile({
          fileId: f.name,
          filename: f.name,
          extractedText: `[Extraction failed: ${err}]`,
          chunks: [],
        });
      }
    }

    const combinedContent = ctx.files.getFiles()
      .map((f) => `[File: ${f.filename}]\n${f.extractedText}`)
      .join("\n\n");
    saveFileContents(sessionId, combinedContent);

    const chunksData = ctx.files.getFiles().map(f => ({
      fileId: f.fileId,
      filename: f.filename,
      chunks: f.chunks ?? [],
    }));
    saveFileChunks(sessionId, JSON.stringify(chunksData));
  }

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

    if (result.streamedTokens && result.streamedTokens.length > 0) {
      for (const token of result.streamedTokens) {
        yield { type: "token", text: token, stepNumber: step.number };
      }
    }

    if (result.toolResults && result.toolResults.length > 0) {
      yield { type: "tool-result", stepNumber: step.number, results: result.toolResults };
    }

    const output = ctx.steps.read(step.number);
    logPipeline(`✓ STEP ${step.number} done. output: ${output ? truncate(JSON.stringify(output), 200) : "(none)"}`);

    if (ctx.checks.getResults().length > 0) {
      logPipeline(`  → ctx.checks now has ${ctx.checks.getResults().length} entries (from step ${step.number})`);
      ctx.checks.compileCitations(
        [...ctx.palette.getCitationPalette()],
        ctx.files.getSourcePalette()
      );
    }

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
          loadedReferences: JSON.stringify(ctx.palette.getReferences().map(r => ({ filename: r.filename, content: r.content.slice(0, 5000) }))),
          uploadedFilesJson: JSON.stringify(ctx.files.getFiles().map(f => ({
            fileId: f.fileId, filename: f.filename, extractedText: f.extractedText?.slice(0, 3000) ?? "(none)",
            chunkCount: f.chunks?.length ?? 0,
            chunkIds: f.chunks?.slice(0, 10).map(c => c.id) ?? [],
            hasPositionData: f.chunks?.some(c => c.wordBoxes && c.wordBoxes.length > 0) ?? false,
          }))),
          stepOutputsJson: JSON.stringify(ctx.steps.entries()),
        });
      } catch { /* snapshot is best-effort */ }
    }
  }

  const maxStepNum = steps.length > 0 ? Math.max(...steps.map(s => s.number)) : 0;

  if (ctx.useTemplate && ctx.skill.template && ctx.checks.getResults().length > 0) {
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
      const output = ctx.steps.read(reportStep.number);
      if (output && typeof output === "object") {
        const obj = output as Record<string, unknown>;
        if (obj.sections && typeof obj.sections === "object") {
          ctx.report.setContent(obj.sections as Record<string, Record<string, string> | string>);
          logPipeline(`  ✓ auto report: sections=${Object.keys(ctx.report.getSections() ?? {}).join(", ")}`);
        }
        if (obj.claims && Array.isArray(obj.claims)) {
          const parsed = ClaimSchema.array().safeParse(obj.claims);
          if (parsed.success) {
            ctx.checks.addClaims(parsed.data);
            logPipeline(`  ✓ auto report: ${ctx.checks.getClaims().length} claims extracted`);
            ctx.checks.buildCitationsFromClaims(
              [...ctx.palette.getCitationPalette()],
              ctx.files.getSourcePalette()
            );
          } else {
            logPipeline(`  ⚠ claims validation: ${parsed.error.issues.length} issue(s) — ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
          }
        }
      }

      if (reportResult.success && ctx.checks.getClaims().length > 0) {
        const chunkErrors = validateClaimChunks(ctx);
        if (chunkErrors.length > 0) {
          logPipeline(`  ⚠ chunk validation: ${chunkErrors.length} issue(s), retrying report step once`);
          const retryErrorMsg = "Chunk reference validation errors in previous attempt:\n" +
            chunkErrors.map(e => `- ${e.message}`).join("\n") +
            "\n\nPlease fix the chunkRef values on the claims to match the actual chunk IDs shown in the source files.";
          const retryResult = await executeLlmStep(reportStep, ctx, retryErrorMsg);
          if (retryResult.success) {
            const retryOutput = ctx.steps.read(reportStep.number);
            if (retryOutput && typeof retryOutput === "object") {
              const robj = retryOutput as Record<string, unknown>;
              if (robj.sections && typeof robj.sections === "object") {
                ctx.report.setContent(robj.sections as Record<string, Record<string, string> | string>);
                logPipeline(`  ✓ retry report: sections=${Object.keys(ctx.report.getSections() ?? {}).join(", ")}`);
              }
              if (robj.claims && Array.isArray(robj.claims)) {
                const retryParsed = ClaimSchema.array().safeParse(robj.claims);
                if (retryParsed.success) {
                  ctx.checks.addClaims(retryParsed.data);
                  logPipeline(`  ✓ retry report: ${ctx.checks.getClaims().length} claims extracted`);
                  ctx.checks.buildCitationsFromClaims(
                    [...ctx.palette.getCitationPalette()],
                    ctx.files.getSourcePalette()
                  );
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
    } else {
      logPipeline(`  ⚠ auto report failed: ${reportResult.error}`);
    }
  } else if (ctx.checks.getResults().length > 0) {
    const sourcePalette = ctx.files.getSourcePalette();
    const lines = ctx.checks.getResults().map(c =>
      `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef}]${c.sourceRef ? ` [S${c.sourceRef}]` : ""}`
    );
    if (sourcePalette.length > 0) {
      const sourceMarkers = sourcePalette.map(s => `[S${s.id}]`).join(" ");
      lines.push(`\nSources: ${sourceMarkers}`);
    }
    ctx.report.setContent({
      assessment: lines.join("\n\n"),
    });
  }

  const reportContent = ctx.report.getAllContentFlat();
  if (reportContent) {
    ctx.checks.supplementFromContent(
      reportContent,
      [...ctx.palette.getCitationPalette()],
      ctx.files.getSourcePalette()
    );
  }

  yield { type: "status", phase: "computing-verdict" };
  logPipeline("→ AUTO: computing verdict");
  const verdict = ctx.checks.computeVerdict();
  ctx.report.setVerdict(verdict);
  logPipeline(`  ✓ auto verdict=${verdict} (${ctx.checks.getResults().length} checks, ${ctx.checks.failureCount} failures)`);

  yield { type: "status", phase: "computing-confidence" };
  logPipeline("→ AUTO: computing confidence");
  const confidence = computeObjectiveConfidence(ctx);
  logPipeline(`  ✓ confidence=${confidence.score.toFixed(1)}% (ocr=${confidence.ocrConfidence.toFixed(0)}% data=${confidence.dataCompleteness.toFixed(0)}% llm×${confidence.llmMultiplier.toFixed(2)})${confidence.needsExpert ? " NEEDS_EXPERT" : ""}`);

  yield { type: "status", phase: "validating" };
  const validationErrors = postValidate(ctx);

  if (validationErrors.length > 0) {
    logPipeline(`⚠ POST-VALIDATION found ${validationErrors.length} issue(s): ${validationErrors.map(e => e.message).join("; ")}`);
    yield { type: "status", phase: "validated-with-issues" };
  } else {
    logPipeline("✓ post-validation passed");
  }

  const round = getResponseCount(sessionId) + 1;

  const clauseTexts = buildClauseTextsFromPalette([...ctx.palette.getCitationPalette()]);

  const responseData: Record<string, unknown> = {
    content: formatContent(ctx, steps),
    reasoning: buildReasoningFromSteps(ctx, steps),
    citations: [...ctx.checks.getCitations()],
    sourceCitations:
      ctx.checks.getSourceCitations().length > 0
        ? [...ctx.checks.getSourceCitations()]
        : undefined,
    round,
    sessionId,
    verdict: ctx.report.getVerdict() ?? "PASS",
    clauseTexts: Object.keys(clauseTexts).length > 0
      ? clauseTexts
      : undefined,
    sections: ctx.report.getSections() ?? undefined,
  };

  const toolCalls = ctx.steps.getRaw("toolCalls");
  if (toolCalls) {
    responseData.toolCalls = toolCalls;
    logPipeline(`tool calls in response: ${JSON.stringify(toolCalls)}`);
  }

  const reasoningSteps = buildReasoningSteps(ctx, steps);
  if (reasoningSteps.length > 0) {
    responseData.reasoningSteps = reasoningSteps;
  }

  if (ctx.checks.getClaims().length > 0) {
    responseData.claims = [...ctx.checks.getClaims()];
  }

  responseData.confidence = confidence;

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
  const sections = ctx.report.getSections();
  if (sections) {
    const parts: string[] = [];
    for (const [sectionId, value] of Object.entries(sections)) {
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

  const llmSteps = steps.filter(
    (s) => s.type === "llm" || s.type === "llm+tool"
  );
  const lastLlm = llmSteps[llmSteps.length - 1];
  if (lastLlm) {
    const output = ctx.steps.read(lastLlm.number);
    if (typeof output === "string") return output;
    if (output) return JSON.stringify(output, null, 2);
  }

  return "Assessment not available.";
}

function computeObjectiveConfidence(ctx: PipelineContext): {
  score: number;
  ocrConfidence: number;
  dataCompleteness: number;
  llmMultiplier: number;
  llmReasoning: string;
  needsExpert: boolean;
} {
  const avgOcr = ctx.files.averageOcrConfidence();
  const ocrPenalty = (1 - avgOcr / 100) * 30;

  let pdfPenalty = 0;
  for (const f of ctx.files.getFiles()) {
    if (f.extractorUsed === "pdf-parse") pdfPenalty = Math.max(pdfPenalty, 5);
    else if (f.extractorUsed === "fallback") pdfPenalty = Math.max(pdfPenalty, 10);
  }

  const baseScore = Math.max(0, 100 - ocrPenalty - pdfPenalty);

  let llmMultiplier = 1.0;
  let llmReasoning = "No LLM assessment available";
  const entries = ctx.steps.entries();
  for (const key of Object.keys(entries)) {
    const output = entries[key];
    if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      if (obj.confidence && typeof obj.confidence === "object") {
        const c = obj.confidence as Record<string, unknown>;
        if (typeof c.llmMultiplier === "number") llmMultiplier = c.llmMultiplier;
        if (typeof c.llmReasoning === "string") llmReasoning = c.llmReasoning;
      }
    }
  }
  llmMultiplier = Math.max(0.5, Math.min(1.0, llmMultiplier));

  const finalScore = Math.round(baseScore * llmMultiplier * 10) / 10;

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    ocrConfidence: Math.round(avgOcr),
    dataCompleteness: 100,
    llmMultiplier: Math.round(llmMultiplier * 100) / 100,
    llmReasoning,
    needsExpert: finalScore < 50,
  };
}

function buildReasoningSteps(
  ctx: PipelineContext,
  steps: ReturnType<typeof parseSteps>
): { stepNumber: number; title: string; body: string }[] {
  const result: { stepNumber: number; title: string; body: string }[] = [];
  for (const step of steps) {
    const output = ctx.steps.read(step.number);
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
    const output = ctx.steps.read(step.number);
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
