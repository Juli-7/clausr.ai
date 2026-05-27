import { streamText } from "ai";
import { createModel } from "../llm/factory";
import { logPipeline } from "../pipeline/logger";

export async function summarizeFile(filename: string, text: string): Promise<string> {
  const prompt = `Summarize the following document in 2-3 sentences.
Focus on what the document describes and any compliance requirements mentioned.
Keep the summary concise — it will be used to generate compliance assessment rules.

Filename: ${filename}

${text.slice(0, 10000)}`;

  logPipeline(`[SUMMARIZE] generating summary for "${filename}" (${text.length} chars)`);

  const result = streamText({
    model: createModel(),
    system: "You are a document summarizer. Output only the summary — no preamble or commentary.",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  let fullText = "";
  for await (const chunk of result.textStream) {
    fullText += chunk;
  }

  const summary = fullText.trim();
  logPipeline(`[SUMMARIZE] done: "${filename}" → ${summary.length} chars`);
  return summary;
}
