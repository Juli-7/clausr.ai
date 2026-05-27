import { getDocStore } from "@/lib/agent/user-info/vector-store";
import { logPipeline } from "@/lib/agent/pipeline/logger";
import type { PipelineContext } from "@/lib/agent/pipeline/pipeline-context";

export interface InputPhaseParams {
  files?: { name: string; size: number; type: string; dataUrl?: string }[];
  sessionId: string;
}

export async function inputPhase(
  ctx: PipelineContext,
  params: InputPhaseParams
): Promise<string[]> {
  const { files, sessionId } = params;

  if (!files || files.length === 0) return [];

  const store = getDocStore();
  const extractedTexts: string[] = [];
  logPipeline(`processing ${files.length} file(s)`);

  for (const f of files) {
    try {
      const { extractedText } = await store.processFile(f, sessionId);
      extractedTexts.push(extractedText);
      logPipeline(`  processed "${f.name}": ${extractedText.length} chars`);
    } catch (err) {
      logPipeline(`  processing FAILED "${f.name}": ${err}`);
      extractedTexts.push(`[Processing failed: ${err}]`);
    }
  }

  return extractedTexts;
}
