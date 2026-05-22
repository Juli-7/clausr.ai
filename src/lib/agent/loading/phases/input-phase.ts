import { extractFileContent } from "@/lib/agent/user-info/extractors";
import type { TextChunk } from "@/lib/agent/user-info/extractors";
import { saveFileContents, saveFileChunks, getFileChunks } from "@/lib/agent/shared/memory/repository";
import { logPipeline } from "@/lib/agent/pipeline/logger";
import type { PipelineContext } from "@/lib/agent/pipeline/pipeline-context";

export interface InputPhaseParams {
  files?: { name: string; size: number; type: string; dataUrl?: string }[];
  sessionId: string;
}

export async function inputPhase(
  ctx: PipelineContext,
  params: InputPhaseParams
): Promise<void> {
  const { files, sessionId } = params;

  if (files && files.length > 0) {
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

    const fileData = ctx.files.getFiles().map(f => ({
      fileId: f.fileId,
      filename: f.filename,
      extractedText: f.extractedText,
      chunks: f.chunks ?? [],
      dataUrl: f.dataUrl,
      pageCount: f.pageCount,
      ocrConfidence: f.ocrConfidence,
      extractorUsed: f.extractorUsed,
    }));
    saveFileChunks(sessionId, JSON.stringify(fileData));
  } else {
    const savedFileDataJson = getFileChunks(sessionId);
    if (savedFileDataJson && savedFileDataJson !== "[]") {
      try {
        const savedFiles: {
          fileId: string;
          filename: string;
          extractedText: string;
          chunks: TextChunk[];
          dataUrl?: string;
          pageCount?: number;
          ocrConfidence?: number;
          extractorUsed?: string;
        }[] = JSON.parse(savedFileDataJson);
        for (const saved of savedFiles) {
          ctx.files.addFile({
            fileId: saved.fileId,
            filename: saved.filename,
            extractedText: saved.extractedText,
            chunks: saved.chunks,
            dataUrl: saved.dataUrl,
            pageCount: saved.pageCount,
            ocrConfidence: saved.ocrConfidence,
            extractorUsed: saved.extractorUsed,
          });
        }
        logPipeline(`restored ${savedFiles.length} file(s) from saved chunks (follow-up turn)`);
      } catch (err) {
        logPipeline(`failed to restore saved chunks: ${err}`);
      }
    }
  }
}
