import { streamText, tool } from "ai";
import { createModel } from "@/lib/agent/llm/factory";
import { loadSkill } from "@/lib/agent/skill/loader";
import { runScript } from "@/lib/agent/skill/script-runner";
import { ComplianceCheckSchema, type ComplianceCheckInput } from "@/lib/agent/schemas";
import { executeComplianceCheck } from "@/lib/agent/pipeline/builtins";
import type { ParsedStep } from "@/lib/agent/skill/step-parser";
import type { ParsedCheck } from "@/lib/agent/skill/check-parser";
import type { PipelineContext } from "../pipeline-context";
import type { StepResult } from "../step-executor";
import type { ToolCallRecord } from "@/lib/agent/types";
import { logPipeline, truncate } from "../logger";

export async function executeLlmStep(
  step: ParsedStep,
  ctx: PipelineContext,
  previousError?: string
): Promise<StepResult> {
  try {
    const wantsJson = ctx.skill.checks.length > 0;

    const contextSummary = buildContextSummary(ctx);
    const retryContext = previousError
      ? `\n\nPREVIOUS ATTEMPT FAILED: ${previousError}\nPlease fix the issue and retry.`
      : "";

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

export async function executeLlmToolStep(
  step: ParsedStep,
  ctx: PipelineContext,
  previousError?: string
): Promise<StepResult> {
  try {
    const skill = loadSkill(ctx.skill.name);
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

    const collectedToolRuns: {
      inputs: Record<string, unknown>[];
      outputs: Record<string, unknown>[];
    }[] = [];

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
            const checksInput = (tr.input as Record<string, unknown>)?.checks as Record<string, unknown>[] ?? [];
            const resultsOutput = (typeof tr.output === "object" && tr.output !== null)
              ? ((tr.output as Record<string, unknown>).results as Record<string, unknown>[] ?? [])
              : [];

            const passCount = resultsOutput.filter((x: Record<string, unknown>) => x.status === "pass").length;
            logPipeline(`  [LLM+TOOL] tool "${tr.toolName}": ${passCount}/${resultsOutput.length} passed`);

            const merged: Record<string, unknown>[] = resultsOutput.map((out, idx) => {
              const inp = checksInput[idx] ?? {};
              return {
                ...out,
                clause: inp.clause as string ?? "",
                regulation: inp.regulation as string ?? extractRegulation(inp),
              };
            });
            collectedToolRuns.push({ inputs: checksInput, outputs: merged });

            const existingToolCalls = (ctx.steps.getRaw("toolCalls") as ToolCallRecord[]) ?? [];
            for (const out of resultsOutput) {
              const checkName = (out.name as string) ?? "check";
              const checkStatus = (out.status as string) === "pass" ? "success" : "error";
              existingToolCalls.push({
                step: Object.keys(ctx.steps.entries()).length + 1,
                toolName: `numerical check - ${checkName}`,
                summary: `${out.value ?? "?"} ${out.comparison ?? ""} → ${out.status ?? "?"}`,
                status: checkStatus,
              });
              perCheckResults.push({
                name: checkName,
                value: out.value as number,
                limit: (out.limit as number | string) ?? "?",
                comparison: (out.comparison as string) ?? "",
                status: out.status as "pass" | "fail",
                note: out.note as string | undefined,
              });
            }
            ctx.steps.setRaw("toolCalls", existingToolCalls);
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

    if (Object.keys(tools).length > 0 && collectedToolRuns.length === 0) {
      logPipeline(`  [LLM+TOOL] tool was NOT called — will retry with error context`);
      return {
        success: false,
        error: `Step ${step.number}: You MUST call the compliance tool for all numerical checks. Extract values from the file data and pass them as structured check objects to the tool.`,
        errorCode: "LLM_ERROR",
      };
    }

    if (collectedToolRuns.length > 0) {
      const allResults = collectedToolRuns.flatMap(run => run.outputs);
      const results = allResults.map((r, i) => ({
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
      ctx.checks.addResults(results);
      logPipeline(`  [LLM+TOOL] built ${results.length} CheckResult entries from tool output`);
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

function storeOutput(ctx: PipelineContext, stepNumber: number, text: string): void {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      ctx.steps.write(stepNumber, JSON.parse(trimmed));
    } catch {
      ctx.steps.write(stepNumber, trimmed);
    }
  } else {
    ctx.steps.write(stepNumber, trimmed);
  }
}

function extractRegulation(result: Record<string, unknown>): string {
  if (result.regulation && typeof result.regulation === "string") return result.regulation;
  if (result.clause && typeof result.clause === "string") {
    const match = result.clause.match(/^([A-Z]+\d+)/);
    if (match) return match[1];
  }
  return "R48";
}

function findCitationRef(ctx: PipelineContext, result: Record<string, unknown>): string {
  const regulation = extractRegulation(result);
  const clauseStr = (result.clause as string) ?? "";
  const clauseMatch = clauseStr.match(/§([\d.]+)/);
  const clauseNum = clauseMatch?.[1] ?? "";

  if (clauseNum) {
    for (const entry of ctx.palette.getCitationPalette()) {
      if (entry.regulation === regulation && entry.clause === clauseNum) {
        return entry.id;
      }
    }
  }

  for (const entry of ctx.palette.getCitationPalette()) {
    if (entry.regulation === regulation) {
      return entry.id;
    }
  }

  return `${regulation}.0`;
}

export function buildDomainSchemaGuide(checks: ParsedCheck[]): string {
  const parts: string[] = [];
  parts.push("");
  parts.push("# Expected Data Schema");
  parts.push("Output your response as a JSON object matching this schema.");
  parts.push("Extract every listed field from the uploaded files. Do not skip fields.");
  parts.push("");
  for (const check of checks) {
    let line = `- \`${check.field}\` (${check.type.kind}`;
    if (check.type.kind === "enum") {
      line += `: ${check.type.values.join("|")}`;
    }
    line += ")";
    if (check.constraint) line += ` — ${check.constraint}`;
    if (check.clause) line += ` — ${check.clause}`;
    if (check.dependsOn) line += ` — conditional on ${check.dependsOn}`;
    if (check.notes) line += ` — ${check.notes}`;
    parts.push(line);
  }
  parts.push("");
  parts.push("Every factual value MUST end with citation markers like [R48.5.11] or [S1].");
  parts.push("For numerical checks, use the compliance-check tool to validate. Include the tool result.");
  parts.push("For conditional checks, evaluate the condition first before including the result.");
  return parts.join("\n");
}

function buildContextSummary(ctx: PipelineContext): string {
  const parts: string[] = [];

  const fileSummary = ctx.files.buildContextSummary();
  if (fileSummary) parts.push(fileSummary);

  const latestStep = ctx.steps.latest();
  if (latestStep) {
    const text = typeof latestStep.value === "string"
      ? latestStep.value
      : JSON.stringify(latestStep.value, null, 2);
    parts.push(`Previous Step Output:\n[Step ${latestStep.stepNumber} Output]\n${text.slice(0, 500)}`);
  }

  const citationSummary = ctx.palette.formatContextSummary();
  if (citationSummary) parts.push(citationSummary);

  if (ctx.checks.getResults().length > 0) {
    const summary = ctx.checks.getResults()
      .map((c) => `${c.name}: ${c.verdict} — ${c.finding} [${c.citationRef}]`)
      .join("\n");
    parts.push(`Check Results:\n${summary}`);
  }

  if (ctx.skill.checks.length > 0) {
    const guide = buildDomainSchemaGuide(ctx.skill.checks);
    if (guide) parts.push(guide);
  }

  const sourcePalette = ctx.files.getSourcePalette();
  if (sourcePalette.length > 0) {
    const summary = ctx.palette.formatSourceSummary(sourcePalette);
    if (summary) parts.push(summary);
  }

  if (ctx.previousTurns.length > 0) {
    const summary = ctx.previousTurns
      .map((t) => `Turn ${t.turnNumber}: ${t.reasoningSummary}`)
      .join("\n");
    parts.push(`Previous Turns:\n${summary}`);
  }

  return parts.join("\n\n");
}

function buildCitationGuide(ctx: PipelineContext): string {
  const parts: string[] = [];
  const citationPalette = ctx.palette.getCitationPalette();
  const sourcePalette = ctx.files.getSourcePalette();

  if (citationPalette.length > 0 || sourcePalette.length > 0) {
    parts.push("");
    parts.push("# Citation Format");
    parts.push("When referencing regulations in your output, use the following format:");
    parts.push("- `[R48.5.11]` for regulation citations (regulation + clause, e.g., [R48.5.11], [R112.5.3])");
    parts.push("- `[SN]` for source file citations (e.g., [S1] for the first uploaded file)");
    parts.push("Place these markers at the end of each claim or value they support.");
    parts.push("Every factual claim MUST end with the appropriate citation marker.");
    if (citationPalette.length > 0) {
      const available = citationPalette.map(e => `[${e.id}]`).join(", ");
      parts.push(`Available regulation markers: ${available}`);
    }
  }

  const hasChunks = ctx.files.getFiles().some(f => f.chunks && f.chunks.length > 0);
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
