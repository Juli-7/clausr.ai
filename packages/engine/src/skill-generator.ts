import { generateText } from "ai";
import { createModel } from "./agent/llm/factory";
import { extractFileContent } from "./agent/user-info/extractors";
import { logInfo } from "./agent/pipeline/logger";
import { ANALYSIS_PROMPT, GENERATION_PROMPT } from "./agent/pipeline/prompts";

export interface GenerateSkillParams {
  report: string;
  files?: { name: string; type: string; size?: number; dataUrl: string }[];
  regulations?: { name: string; type: string; size?: number; dataUrl: string }[];
}

export interface GenerateSkillResult {
  name: string;
  description: string;
  triggers: string[];
  regulationIds: string[];
  skillmd: string;
  redline?: string;
  lessons?: string;
}

async function callLLM(system: string, user: string): Promise<string> {
  const result = await generateText({
    model: createModel({ cache: true }),
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0.3,
  });
  return result.text;
}

function buildUserInput(sampleTexts: string, regulationTexts: string, report: string): string {
  return `${
    sampleTexts ? `## Sample Documents\n\n${sampleTexts}\n\n` : ""
  }${
    regulationTexts ? `## Regulation References\n\n${regulationTexts}\n\n` : ""
  }## Reference Compliance Report\n\n${report}`;
}

export async function generateSkill(params: GenerateSkillParams): Promise<string> {
  const { report, files, regulations } = params;

  let sampleTexts = "";
  if (files && files.length > 0) {
    const results = await Promise.all(
      files.map((f) => extractFileContent(f).catch(() => null))
    );
    sampleTexts = results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.text.length > 0)
      .map((r, i) => {
        const chunks = r.chunks
          .map((c) => c.pageNumber ? `[Page ${c.pageNumber}]\n${c.text}` : c.text)
          .join("\n\n");
        return `[Document ${i + 1}: ${files![i]!.name}]\n${chunks}`;
      })
      .join("\n\n---\n\n");
  }

  let regulationTexts = "";
  if (regulations && regulations.length > 0) {
    const results = await Promise.all(
      regulations.map((f) => extractFileContent(f).catch(() => null))
    );
    regulationTexts = results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.text.length > 0)
      .map((r, i) => {
        const chunks = r.chunks
          .map((c) => c.pageNumber ? `[Page ${c.pageNumber}]\n${c.text}` : c.text)
          .join("\n\n");
        return `[Regulation ${i + 1}: ${regulations![i]!.name}]\n${chunks}`;
      })
      .join("\n\n---\n\n");
  }

  const userInput = buildUserInput(sampleTexts, regulationTexts, report);

  logInfo("Step 1: Analyzing reference report...");
  const analysis = await callLLM(ANALYSIS_PROMPT, userInput);

  logInfo("Step 2: Generating SKILL.md...");
  const generationInput = `## Check Analysis\n\n${analysis}\n\n---\n\n${userInput}`;
  const fullText = await callLLM(GENERATION_PROMPT, generationInput);

  return fullText;
}
