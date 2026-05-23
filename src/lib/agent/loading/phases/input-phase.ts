import { extractFileContent } from "@/lib/agent/user-info/extractors";
import type { TextChunk } from "@/lib/agent/user-info/extractors";
import { summarizeFile } from "@/lib/agent/user-info/summarize-file";
import { saveFileChunks, getFileChunks, saveChunks, deleteChunksBySession, getChunksByIds } from "@/lib/agent/shared/memory/repository";
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
    deleteChunksBySession(sessionId);

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

    const fileData: {
      fileId: string;
      filename: string;
      summary: string;
      chunkIds: string[];
      chunks: { id: string; pageNumber?: number }[];
      dataUrl?: string;
      pageCount?: number;
      ocrConfidence?: number;
      extractorUsed?: string;
    }[] = [];

    for (const f of ctx.files.getFiles()) {
      const summary = f.extractedText
        ? await summarizeFile(f.filename, f.extractedText)
        : "";
      const chunkIds = f.chunks && f.chunks.length > 0
        ? saveChunks(sessionId, f.fileId, f.chunks)
        : [];
      fileData.push({
        fileId: f.fileId,
        filename: f.filename,
        summary,
        chunkIds,
        chunks: (f.chunks ?? []).map((c) => ({ id: c.id, pageNumber: c.pageNumber })),
        dataUrl: f.dataUrl,
        pageCount: f.pageCount,
        ocrConfidence: f.ocrConfidence,
        extractorUsed: f.extractorUsed,
      });
      logPipeline(`  summarized "${f.filename}": summary=${summary.length} chars, chunks=${chunkIds.length}`);
    }

    saveFileChunks(sessionId, JSON.stringify(fileData));
  } else {
    const savedFileDataJson = getFileChunks(sessionId);
    if (savedFileDataJson && savedFileDataJson !== "[]") {
      try {
        const savedFiles: {
          fileId: string;
          filename: string;
          summary: string;
          chunkIds: string[];
          chunks: { id: string; pageNumber?: number }[];
          dataUrl?: string;
          pageCount?: number;
          ocrConfidence?: number;
          extractorUsed?: string;
        }[] = JSON.parse(savedFileDataJson);
        for (const saved of savedFiles) {
          const fetchedChunks = saved.chunkIds.length > 0 ? getChunksByIds(saved.chunkIds) : [];
          const rebuiltChunks: TextChunk[] = saved.chunks.map((meta, i) => ({
            id: meta.id,
            text: fetchedChunks.find((fc) => fc.id === saved.chunkIds[i])?.text ?? "",
            pageNumber: meta.pageNumber,
          }));
          ctx.files.addFile({
            fileId: saved.fileId,
            filename: saved.filename,
            extractedText: saved.summary,
            chunks: rebuiltChunks,
            dataUrl: saved.dataUrl,
            pageCount: saved.pageCount,
            ocrConfidence: saved.ocrConfidence,
            extractorUsed: saved.extractorUsed,
          });
        }
        logPipeline(`restored ${savedFiles.length} file(s) from chunk store (follow-up turn)`);
      } catch (err) {
        logPipeline(`failed to restore saved chunks: ${err}`);
      }
    }
  }
}
