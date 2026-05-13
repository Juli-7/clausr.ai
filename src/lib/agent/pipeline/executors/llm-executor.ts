import { streamText, tool } from "ai";
import { createModel } from "@/lib/agent/llm/factory";
import { getSkill } from "@/lib/agent/skill/registry";
import { runScript } from "@/lib/agent/skill/script-runner";
import { ComplianceCheckSchema, type ComplianceCheckInput } from "@/lib/agent/schemas";
import { executeComplianceCheck } from "@/lib/agent/pipeline/builtins";
import type { ParsedStep } from "@/lib/agent/skill/step-parser";
import type { PipelineContext } from "../pipeline-context";
import type { StepResult } from "../step-executor";
import type { ToolCallRecord } from "@/lib/agent/types";
import { logPipeline, truncate } from "../logger";

/**
 * Generic LLM step executor.
 * Builds a system prompt from SKILL.md + step instructions + pipeline context,
 * calls the LLM, and stores the output in ctx.stepOutputs[step.number].
 */
export async function executeLlmStep(
  step: ParsedStep,
  ctx: PipelineContext,
  previousError?: string
): Promise<StepResult> {
  try {
    const wantsJson = ctx.useTemplate && ctx.skill.template !== null;

    const contextSummary = buildContextSummary(ctx);
    const retryContext = previousError
      ? `\n\nPREVIOUS ATTEMPT FAILED: ${previousError}\nPlease fix the issue and retry.`
      : "";

    // Citation format guide — added when citations or source files are available
    const citationGuide = buildCitationGuide(ctx);

    const systemPrompt = `# Role
${ctx.skill.skillmd}

# Current Step: ${step.number}. ${step.title}

${step.instructions}

# Available Context
${contextSummary}
${retryContext}
${citationGuide}

# Instructions
- Use the uploaded files and available context above to complete this step.
- Extract all relevant information from the files — do not ask the user to provide information that is already in the files.
- ${
  wantsJson
    ? "Output ONLY valid JSON. No explanation, no markdown outside the JSON."
    : "Output your findings clearly and directly."
}`;

    const userMessage = `Execute step ${step.number}: ${step.title}. Use the available data and files — do not ask for missing information.`;

    logPipeline(`  [LLM] step=${step.number} wantsJson=${wantsJson} promptLen=${systemPrompt.length}chars`);

    const result = streamText({
      model: createModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      ...(step.temperature !== undefined ? { temperature: step.temperature } : {}),
      ...(wantsJson
        ? { responseFormat: { type: "json_object" as const } }
        : {}),
    });

    const tokens: string[] = [];
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
      tokens.push(chunk);
    }

    logPipeline(`  [LLM] step=${step.number} responseLen=${fullText.length}chars preview=${truncate(fullText, 150)}`);

    storeOutput(ctx, step.number, fullText);
    return {
      success: true,
      contextSnapshot: { systemPrompt, userMessage, contextSummary },
      streamedTokens: tokens,
    };
  } catch (err) {
    return {
      success: false,
      error: `Step ${step.number} LLM error: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "LLM_ERROR",
    };
  }
}

/**
 * LLM + tool calling step executor.
 * Registers tools from the skill's scripts, lets the LLM call them,
 * executes matching scripts locally, and feeds results back.
 */
export async function executeLlmToolStep(
  step: ParsedStep,
  ctx: PipelineContext,
  previousError?: string
): Promise<StepResult> {
  try {
    const skill = getSkill(ctx.skill.name);
    if (!skill) {
      return {
        success: false,
        error: `Skill "${ctx.skill.name}" not found for tool step`,
        errorCode: "SKILL_NOT_FOUND",
      };
    }

    const contextSummary = buildContextSummary(ctx);
    const retryContext = previousError
      ? `\n\nPREVIOUS ATTEMPT FAILED: ${previousError}\nPlease fix the issue and retry.`
      : "";

    const systemPrompt = `# Role
${ctx.skill.skillmd}

# Current Step: ${step.number}. ${step.title}

${step.instructions}

# Available Context
${contextSummary}
${retryContext}

# Instructions
- Use the uploaded files and available context above to complete this step.
- Extract all relevant information from the files — do not ask the user to provide information that is already in the files.
- You MUST call the available tools to execute compliance checks. Numerical checks require the tool.
- Output the final results as structured data.
`;

    logPipeline(`  [LLM+TOOL] step=${step.number} promptLen=${systemPrompt.length}chars scripts=${skill.scripts.length}`);

    // Build tool definitions from skill scripts
    const tools: Record<string, any> = {};
    for (const script of skill.scripts) {
      if (script.name === "compliance-check") {
        logPipeline(`  [TOOL] registering "checkCompliance" from ${script.path}`);
        tools.checkCompliance = tool({
          description: "Run numerical compliance checks. Pass multiple checks as a JSON array.",
          inputSchema: ComplianceCheckSchema,
          execute: async (input) => {
            const checks = (input as any)?.checks;
            logPipeline(`  [TOOL EXEC] compliance-check builtin with ${checks?.length ?? 0} check(s): ${checks ? JSON.stringify(checks).slice(0, 200) : "none"}`);
            const result = executeComplianceCheck(input as ComplianceCheckInput);
            logPipeline(`  [TOOL EXEC] result: ${truncate(JSON.stringify(result), 200)}`);
            return result;
          },
        });
        // Keep runScript fallback for custom .py scripts in other registration branches
      } else {
        logPipeline(`  [TOOL] registering generic tool "${script.name}"`);
        tools[script.name] = tool({
          description: script.desc || `Run ${script.name} script`,
          inputSchema: ComplianceCheckSchema,
          execute: async (input) => {
            const result = await runScript(script.path, input);
            if (!result.success) {
              return { error: true, message: result.stderr || "Failed" };
            }
            try {
              return JSON.parse(result.stdout);
            } catch {
              return { raw: result.stdout };
            }
          },
        });
      }
    }

    logPipeline(`  [LLM+TOOL] step=${step.number} calling streamText with ${Object.keys(tools).length} tool(s)`);

    const citationGuide = buildCitationGuide(ctx);
    const toolSystemPrompt = systemPrompt + citationGuide;

    // Collect tool results + their input args for building CheckResult[]
    const collectedToolRuns: {
      inputs: Record<string, unknown>[];
      outputs: Record<string, unknown>[];
    }[] = [];

    // Per-check results for streaming to client (flattened after step completes)
    const perCheckResults: {
      name: string;
      value: number;
      limit: number | string;
      comparison: string;
      status: "pass" | "fail";
      note?: string;
    }[] = [];

    const userMessage = `Execute step ${step.number}: ${step.title}. Use the available data and files. You MUST call the available tools to execute compliance checks. Output the final results as structured data.`;

    const result = streamText({
      model: createModel(),
      system: toolSystemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      ...(step.temperature !== undefined ? { temperature: step.temperature } : {}),
      onStepFinish: (event) => {
        logPipeline(`  [LLM+TOOL] step=${step.number} onStepFinish: toolResults=${event.toolResults?.length ?? 0} textLen=${(event.text ?? "").length}`);
        if (event.toolResults?.length) {
          for (const tr of event.toolResults) {
            // Capture input arguments (contain clause, regulation, operator)
            const checksInput = (tr.input as Record<string, unknown>)?.checks as Record<string, unknown>[] ?? [];
            // Capture output results (contain name, value, status)
            const resultsOutput = (typeof tr.output === "object" && tr.output !== null)
              ? ((tr.output as Record<string, unknown>).results as Record<string, unknown>[] ?? [])
              : [];

            const passCount = resultsOutput.filter(
              (x: Record<string, unknown>) => x.status === "pass"
            ).length;
            logPipeline(`  [LLM+TOOL] tool "${tr.toolName}": ${passCount}/${resultsOutput.length} passed`);

            // Merge input args with output results for building CheckResult[]
            // Match by index since both arrays maintain order
            const merged: Record<string, unknown>[] = resultsOutput.map((out, idx) => {
              const inp = checksInput[idx] ?? {};
              return {
                ...out,
                clause: inp.clause as string ?? "",
                regulation: inp.regulation as string ?? extractRegulation(inp),
              };
            });
            collectedToolRuns.push({ inputs: checksInput, outputs: merged });

            // Per-check tool call records with descriptive names
            ctx.stepOutputs["toolCalls"] ??= [];
            for (const out of resultsOutput) {
              const checkName = (out.name as string) ?? "check";
              const checkStatus = (out.status as string) === "pass" ? "success" : "error";
              (ctx.stepOutputs["toolCalls"] as ToolCallRecord[]).push({
                step: Object.keys(ctx.stepOutputs).length + 1,
                toolName: `numerical check - ${checkName}`,
                summary: `${out.value ?? "?"} ${out.comparison ?? ""} → ${out.status ?? "?"}`,
                status: checkStatus,
              });

              // Collect for streaming to client
              perCheckResults.push({
                name: checkName,
                value: out.value as number,
                limit: (out.limit as number | string) ?? "?",
                comparison: (out.comparison as string) ?? "",
                status: out.status as "pass" | "fail",
                note: out.note as string | undefined,
              });
            }
          }
        }
      },
    });

    const tokens: string[] = [];
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
      tokens.push(chunk);
    }

    logPipeline(`  [LLM+TOOL] step=${step.number} finalText=${fullText.length}chars preview=${truncate(fullText, 150)}`);

    // Retry if tool was registered but not called — LLM must use the tool
    if (Object.keys(tools).length > 0 && collectedToolRuns.length === 0) {
      logPipeline(`  [LLM+TOOL] tool was NOT called — will retry with error context`);
      return {
        success: false,
        error: `Step ${step.number}: You MUST call the compliance tool for all numerical checks. Extract values from the file data and pass them as structured check objects to the tool.`,
        errorCode: "LLM_ERROR",
      };
    }

    // Build CheckResult[] from collected tool outputs (merge input+output)
    if (collectedToolRuns.length > 0) {
      const allResults = collectedToolRuns.flatMap(run => run.outputs);
      ctx.checkResults = allResults.map((r, i) => ({
        name: (r.name as string) ?? `check-${i + 1}`,
        type: "numerical" as const,
        regulation: (r.regulation as string) ?? "",
        clause: (r.clause as string) ?? "",
        finding: `${r.name}: ${r.value} ${r.comparison} → ${r.status}`,
        verdict: r.status === "pass" ? ("PASS" as const) : ("FAIL" as const),
        citationRef: findCitationRef(ctx, r),
        toolResult: {
          value: r.value as number,
          limit: r.limit as number,
          comparison: r.comparison as string,
          status: r.status as "pass" | "fail",
        },
      }));
      logPipeline(`  [LLM+TOOL] built ${ctx.checkResults.length} CheckResult entries from tool output`);
    }

    storeOutput(ctx, step.number, fullText);
    return {
      success: true,
      contextSnapshot: { systemPrompt: toolSystemPrompt, userMessage, contextSummary },
      streamedTokens: tokens,
      toolResults: perCheckResults.length > 0 ? perCheckResults : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: `Step ${step.number} tool LLM error: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "LLM_ERROR",
    };
  }
}

// ── Helpers ──

function storeOutput(
  ctx: PipelineContext,
  stepNumber: number,
  text: string
): void {
  const trimmed = text.trim();
  const key = String(stepNumber);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      ctx.stepOutputs[key] = JSON.parse(trimmed);
    } catch {
      ctx.stepOutputs[key] = trimmed;
    }
  } else {
    ctx.stepOutputs[key] = trimmed;
  }
}

/**
 * Extract regulation ID from a tool result object.
 * Checks common fields where the regulation might be specified.
 */
function extractRegulation(result: Record<string, unknown>): string {
  if (result.regulation && typeof result.regulation === "string") return result.regulation;
  if (result.clause && typeof result.clause === "string") {
    const match = result.clause.match(/^([A-Z]+\d+)/);
    if (match) return match[1];
  }
  return "R48";
}

/**
 * Find the citation palette entry that matches a tool result's regulation + clause.
 * Returns the palette entry ID (ref), or 1 as fallback.
 */
function findCitationRef(ctx: PipelineContext, result: Record<string, unknown>): string {
  const regulation = extractRegulation(result);
  const clauseStr = (result.clause as string) ?? "";
  // Extract the clause number: e.g. "R112 §4.1" → "4.1", or "§5.11" → "5.11"
  const clauseMatch = clauseStr.match(/§([\d.]+)/);
  const clauseNum = clauseMatch?.[1] ?? "";

  if (clauseNum) {
    for (const entry of ctx.citationPalette) {
      if (
        entry.regulation === regulation &&
        entry.clause === clauseNum
      ) {
        return entry.id;
      }
    }
  }

  // Fallback: match by regulation only, return first match
  for (const entry of ctx.citationPalette) {
    if (entry.regulation === regulation) {
      return entry.id;
    }
  }

  return `${regulation}.0`; // fallback
}

/**
 * Build a JSON skeleton showing the expected output format when a template exists.
 * Tells the LLM to output JSON with both content (markdown report) and sections (template fields).
 */
function buildTemplateOutputGuide(template: NonNullable<PipelineContext["skill"]["template"]>): string {
  const sectionsSkeleton: Record<string, unknown> = {};
  for (const s of template.sections) {
    if (s.type === "fields" && s.fields && s.fields.length > 0) {
      const fieldObj: Record<string, string> = {};
      for (const f of s.fields) fieldObj[f.id] = "";
      sectionsSkeleton[s.id] = fieldObj;
    } else if (s.type === "verdict") {
      sectionsSkeleton[s.id] = "PASS";
    } else {
      sectionsSkeleton[s.id] = "";
    }
  }

  const example = {
    content: "## Compliance Report\\nYour markdown report text here with [R48.5.11] and [S1] citations...",
    sections: sectionsSkeleton,
    verdict: "PASS",
    claims: [
      { statement: "Product model is XYZ-200", citationRef: "S1", chunkRef: "S1.c2" },
      { statement: "Luminous flux reading is 150 units", citationRef: "R48.5.11", chunkRef: "S1.c3", sourceRef: 1 },
    ],
    confidence: {
      llmMultiplier: 0.95,
      llmReasoning: "Sources are consistent, no hedging or ambiguity detected",
    },
  };

  const parts: string[] = [];
  parts.push("");
  parts.push("# Template Output Format");
  parts.push(`Template: "${template.name}"`);
  parts.push("Output your response as a JSON object with this exact structure.");
  parts.push("The `content` field is the markdown report text. The `sections` object matches the template.");
  parts.push("Fill every field. Each value in sections MUST end with [R48.x.x] and [SN] citation markers.");
  parts.push("`claims`: an array of every factual statement you make and which citation backs it.");
  parts.push("Each claim MUST have: \"statement\" (factual text), \"citationRef\" (R48.5.11 for regulation, or S1 for source file — never comma-separated), \"chunkRef\" (source chunk ID like S1.c3), and optionally \"sourceRef\" (source file number).");
  parts.push("`confidence`: assesses the reliability of this assessment.");
  parts.push("  - `llmMultiplier` (0.5–1.0): your judgment of ambiguity + cross-source consistency. 1.0 = all sources agree, no hedging. 0.5 = contradictory sources or heavy uncertainty.");
  parts.push("  - `llmReasoning`: short explanation of the multiplier (ambiguity, hedging, source consistency).");
  parts.push("```json");
  parts.push(JSON.stringify(example, null, 2));
  parts.push("```");
  return parts.join("\n");
}

function buildContextSummary(ctx: PipelineContext): string {
  const parts: string[] = [];

  // Uploaded file content — most important for Step 1
  // Files with chunks get chunk-annotated text; files without chunks get raw text
  if (ctx.uploadedFiles.length > 0) {
    const fileBlocks = ctx.uploadedFiles.map((f, i) => {
      const sourceRef = `S${i + 1}`;
      if (f.chunks && f.chunks.length > 0) {
        const maxChunks = 30;
        const shown = f.chunks.slice(0, maxChunks);
        const chunkLines = shown.map((c) => `[${sourceRef}.${c.id}] ${c.text}`);
        if (f.chunks.length > maxChunks) {
          chunkLines.push(`[${f.chunks.length - maxChunks} more paragraphs — use ${sourceRef}.c1 through ${sourceRef}.c${maxChunks} for what's shown]`);
        }
        return `[File ${i + 1}: ${f.filename}]\n${chunkLines.join("\n")}`;
      }
      return `[File ${i + 1}: ${f.filename}]\n${f.extractedText.slice(0, 3000)}`;
    });
    parts.push(`Uploaded Files:\n${fileBlocks.join("\n\n")}`);
  }

  // Only include immediately previous step output to limit context growth
  const stepNumbers = Object.keys(ctx.stepOutputs).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  if (stepNumbers.length > 0) {
    const prevKey = stepNumbers[stepNumbers.length - 1];
    const val = ctx.stepOutputs[prevKey];
    const text = typeof val === "string" ? val : JSON.stringify(val, null, 2);
    parts.push(`Previous Step Output:\n[Step ${prevKey} Output]\n${text.slice(0, 500)}`);
  }

  if (ctx.vehicleData) {
    parts.push(
      `Vehicle Data:\n${JSON.stringify(ctx.vehicleData, null, 2)}`
    );
  }

  if (ctx.citationPalette.length > 0) {
    const summary = ctx.citationPalette
      .map((e) => `[${e.id}] ${e.regulation} §${e.clause} — ${e.text.slice(0, 80)}`)
      .join("\n");
    parts.push(`Available Citations:\n${summary}`);
  }

  if (ctx.checkResults.length > 0) {
    const summary = ctx.checkResults
      .map(
        (c) =>
          `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef}]`
      )
      .join("\n");
    parts.push(`Check Results:\n${summary}`);
  }

  // Template format guide — only for report-writing steps (after check results populated)
  if (ctx.skill.template && ctx.useTemplate && ctx.checkResults.length > 0) {
    const guide = buildTemplateOutputGuide(ctx.skill.template);
    if (guide) parts.push(guide);
  }

  if (ctx.sourcePalette.length > 0) {
    const summary = ctx.sourcePalette
      .map((s) => `[S${s.id}] ${s.filename}`)
      .join("\n");
    parts.push(`Source Files:\n${summary}`);
  }

  if (ctx.previousTurns.length > 0) {
    const summary = ctx.previousTurns
      .map((t) => `Turn ${t.turnNumber}: ${t.reasoningSummary}`)
      .join("\n");
    parts.push(`Previous Turns:\n${summary}`);
  }

  return parts.join("\n\n");
}

/**
 * Build citation format guide for the LLM.
 * Tells the LLM how to use [R48.5.11] and [S1] markers when writing content.
 */
function buildCitationGuide(ctx: PipelineContext): string {
  const parts: string[] = [];

  if (ctx.citationPalette.length > 0 || ctx.sourcePalette.length > 0) {
    parts.push("");
    parts.push("# Citation Format");
    parts.push("When referencing regulations in your output, use the following format:");
    parts.push("- `[R48.5.11]` for regulation citations (regulation + clause, e.g., [R48.5.11], [R112.5.3])");
    parts.push("- `[SN]` for source file citations (e.g., [S1] for the first uploaded file)");
    parts.push("Place these markers at the end of each claim or value they support.");
    parts.push("Every factual claim MUST end with the appropriate citation marker.");
    if (ctx.citationPalette.length > 0) {
      const available = ctx.citationPalette.map(e => `[${e.id}]`).join(", ");
      parts.push(`Available regulation markers: ${available}`);
    }
  }

  // Chunk reference guide — tell LLM how to reference source chunks
  const hasChunks = ctx.uploadedFiles.some(f => f.chunks && f.chunks.length > 0);
  if (hasChunks) {
    parts.push("");
    parts.push("# Source Chunk References (chunkRef)");
    parts.push("Source text above is annotated with chunk IDs like [S1.c3]. Use these in claims:");
    parts.push("- `chunkRef` field: the specific source chunk that backs this claim (e.g., \"S1.c3\")");
    parts.push("- `sourceRef` field: the source file number (e.g., 1 for S1)");
    parts.push("- `citationRef` field: the regulation marker only (e.g., \"R48.5.11\") — do NOT put source refs here");
    parts.push("Every factual claim MUST include a chunkRef pointing to the source chunk that supports it.");
  }

  return parts.join("\n");
}
