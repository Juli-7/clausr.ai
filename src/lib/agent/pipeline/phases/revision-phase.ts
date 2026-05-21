import { streamText } from "ai";
import { createModel } from "@/lib/agent/llm/factory";
import { logPipeline } from "../logger";
import type { PipelineContext } from "../pipeline-context";

/**
 * Analyze the user's follow-up message against previous step outputs
 * to determine which step (if any) should be redone.
 * Returns the step number to redo, or -1 if no revision is needed.
 */
export async function identifyRevisionTarget(
  ctx: PipelineContext,
  userMessage: string
): Promise<number> {
  const entries = ctx.steps.entries();
  const previousSteps = Object.entries(entries)
    .filter(([k]) => /^\d+$/.test(k))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => {
      const body = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      return `Step ${k}:\n${body.slice(0, 800)}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are analyzing a follow-up request for a compliance assessment that was already run once.

The user is looking at the report and sending a follow-up message. Your job is to determine if they want a specific step's output to be regenerated.

Previous step outputs:
${previousSteps || "(none)"}

The user's new message: "${userMessage}"

Determine if the user wants to revise a specific step. Consider:
- If they mention a value or finding from a specific step, that step likely needs redoing
- If they ask a general question or want new analysis, no step needs redoing
- If they disagree with a specific claim, identify which step produced that claim

Return ONLY a JSON object with this exact shape:
{"stepNumber": 2, "reason": "User is questioning luminous flux values from step 2"}

If no step needs revision, return {"stepNumber": -1, "reason": "..."}

Return ONLY valid JSON. No markdown, no explanation.`;

  const result = streamText({
    model: createModel(),
    system: systemPrompt,
    messages: [{ role: "user", content: "Which step should be redone, if any?" }],
    temperature: 0.1,
  });

  let fullText = "";
  for await (const chunk of result.textStream) {
    fullText += chunk;
  }

  try {
    const parsed = JSON.parse(fullText);
    const target = parsed.stepNumber ?? -1;
    logPipeline(`[REVISION] target step=${target} reason=${parsed.reason ?? "none"}`);
    return target;
  } catch {
    logPipeline(`[REVISION] failed to parse LLM response, defaulting to -1. raw=${fullText.slice(0, 200)}`);
    return -1;
  }
}
