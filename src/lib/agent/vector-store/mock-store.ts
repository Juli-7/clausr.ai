import type { IDocStore, ProcessedFile } from "./types";
import { extractFileContent } from "@/lib/agent/user-info/extractors";
import {
  saveChunks,
  deleteChunksBySession,
  getChunksByIds,
  getFileChunks,
  saveFileChunks,
} from "@/lib/agent/shared/memory/repository";

export class MockDocStore implements IDocStore {
  async processFile(
    file: { name: string; size: number; type: string; dataUrl?: string },
    sessionId: string
  ): Promise<{ extractedText: string }> {
    deleteChunksBySession(sessionId);
    const extracted = await extractFileContent(file);
    const chunkIds = saveChunks(sessionId, file.name, extracted.chunks);
    const meta = {
      fileId: file.name,
      filename: file.name,
      dataUrl: file.dataUrl,
      pageCount: extracted.pageCount,
      ocrConfidence: extracted.ocrConfidence,
      extractorUsed: extracted.extractorUsed,
      chunkIds,
      chunks: extracted.chunks.map((c) => ({ id: c.id, pageNumber: c.pageNumber })),
    };
    saveFileChunks(sessionId, JSON.stringify([meta]));
    return { extractedText: extracted.text };
  }

  async getFiles(sessionId: string): Promise<ProcessedFile[]> {
    const fileMetaJson = getFileChunks(sessionId);
    if (!fileMetaJson || fileMetaJson === "[]") return [];
    const fileMeta: {
      fileId: string;
      filename: string;
      dataUrl?: string;
      pageCount?: number;
      ocrConfidence?: number;
      extractorUsed?: string;
      chunkIds: string[];
      chunks: { id: string; pageNumber?: number }[];
    }[] = JSON.parse(fileMetaJson);
    return fileMeta.map((meta) => {
      const fetchedChunks = meta.chunkIds.length > 0 ? getChunksByIds(meta.chunkIds) : [];
      const chunks = meta.chunks.map((cMeta, i) => ({
        id: cMeta.id,
        text: fetchedChunks.find((fc) => fc.id === meta.chunkIds[i])?.text ?? "",
        pageNumber: cMeta.pageNumber,
      }));
      const fullText = chunks.map((c) => c.text).join("\n");
      return {
        fileId: meta.fileId,
        filename: meta.filename,
        extractedText: fullText,
        chunks,
        dataUrl: meta.dataUrl,
        pageCount: meta.pageCount,
        ocrConfidence: meta.ocrConfidence,
        extractorUsed: meta.extractorUsed,
      };
    });
  }
}
