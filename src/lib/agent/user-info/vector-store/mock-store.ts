import type { IDocStore, ProcessedFile } from "./types";
import { extractFileContent } from "@/lib/agent/user-info/extractors";
import {
  saveChunks,
  deleteChunksBySession,
  getChunksByIds,
  getFileChunks,
  saveFileChunks,
} from "@/lib/agent/shared/memory/repository";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

function saveRawFile(sessionId: string, filename: string, dataUrl: string): void {
  const dir = path.join(UPLOADS_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(base64, "base64"));
}

export class MockDocStore implements IDocStore {
  async processFile(
    file: { name: string; size: number; type: string; dataUrl?: string },
    sessionId: string
  ): Promise<{ extractedText: string }> {
    deleteChunksBySession(sessionId);
    const extracted = await extractFileContent(file);
    const chunkIds = saveChunks(sessionId, file.name, extracted.chunks);
    if (file.dataUrl) {
      saveRawFile(sessionId, file.name, file.dataUrl);
    }
    const meta = {
      fileId: file.name,
      filename: file.name,
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
        dataUrl: `/api/files/${sessionId}/${encodeURIComponent(meta.filename)}`,
        pageCount: meta.pageCount,
        ocrConfidence: meta.ocrConfidence,
        extractorUsed: meta.extractorUsed,
      };
    });
  }
}
