import { parseSteps } from "@/lib/agent/skill/step-parser";
import { logPipeline } from "../logger";
import type { PipelineContext } from "../pipeline-context";

export function parseStepsPhase(ctx: PipelineContext): ReturnType<typeof parseSteps> {
  const steps = parseSteps(ctx.skill.skillmd);
  logPipeline(`parsed ${steps.length} steps: ${steps.map(s => `${s.number}.${s.title}(${s.type})`).join(" → ")}`);
  return steps;
}
