import { getDocStore } from "../../user-info/vector-store";
import { logPipeline } from "../../pipeline/logger";
import type { PipelineContext } from "../../pipeline/pipeline-context";

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
      const result = await store.processFile(f, sessionId);

      // Content guard — same standard as chat input: injection + 31 risk types.
      // Rejected file content is not indexed or made available to the LLM.
      const { checkInput } = await import("../../../safety/content-guard");
      const guard = checkInput(result.extractedText);
      if (!guard.allowed) {
        logPipeline(`  REJECTED "${f.name}": ${guard.riskType}`);
        const { deleteChunksByFile } = await import("../../shared/memory/repository");
        deleteChunksByFile(sessionId, f.name);
        extractedTexts.push(`[File: ${f.name} — content failed safety review (${guard.riskType ?? "policy"}), skipped]`);
        continue;
      }

      ctx.files.addFile({
        fileId: f.name,
        filename: f.name,
        dataUrl: `/api/files/${sessionId}/${encodeURIComponent(f.name)}`,
        extractedText: result.extractedText,
        chunks: result.chunks,
        pageCount: result.pageCount,
        ocrConfidence: result.ocrConfidence,
        extractorUsed: result.extractorUsed,
      });
      logPipeline(`  processed "${f.name}": ${result.extractedText.length} chars`);
    } catch (err) {
      logPipeline(`  processing FAILED "${f.name}": ${err}`);
      extractedTexts.push(`[Processing failed: ${err}]`);
    }
  }

  return extractedTexts;
}
