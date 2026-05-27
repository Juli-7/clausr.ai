import type { ChunkInfo, IDocStore, ProcessedFile, WordBox } from "./types";
import { extractFileContent } from "../../user-info/extractors";
import {
  saveChunks,
  deleteChunksBySession,
  getChunksByIds,
  getFileChunks,
  saveFileChunks,
} from "../../shared/memory/repository";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

function isWordBox(value: unknown): value is WordBox {
  if (!value || typeof value !== "object") return false;
  const box = value as Partial<WordBox>;
  return (
    typeof box.x === "number" &&
    typeof box.y === "number" &&
    typeof box.width === "number" &&
    typeof box.height === "number"
  );
}

function asWordBox(value: unknown): WordBox | undefined {
  return isWordBox(value) ? value : undefined;
}

function asWordBoxes(value: unknown): WordBox[] | undefined {
  return Array.isArray(value) && value.every(isWordBox) ? value : undefined;
}

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
      chunks: extracted.chunks.map((c) => ({
        id: c.id,
        html: c.html,
        pageNumber: c.pageNumber,
        bbox: c.bbox,
        wordBoxes: c.wordBoxes,
        pageWidth: c.pageWidth,
        pageHeight: c.pageHeight,
      })),
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
      chunks: {
        id: string;
        html?: string;
        pageNumber?: number;
        bbox?: { x: number; y: number; width: number; height: number };
        wordBoxes?: { x: number; y: number; width: number; height: number }[];
        pageWidth?: number;
        pageHeight?: number;
      }[];
    }[] = JSON.parse(fileMetaJson);
    return fileMeta.map((meta) => {
      const fetchedChunks = meta.chunkIds.length > 0 ? getChunksByIds(meta.chunkIds) : [];
      const chunks: ChunkInfo[] = meta.chunks.map((cMeta, i) => {
        const storedChunk = fetchedChunks.find((fc) => fc.id === meta.chunkIds[i]);
        return {
          id: cMeta.id,
          text: storedChunk?.text ?? "",
          html: cMeta.html ?? storedChunk?.html,
          pageNumber: cMeta.pageNumber ?? storedChunk?.pageNumber,
          bbox: cMeta.bbox ?? asWordBox(storedChunk?.bbox),
          wordBoxes: cMeta.wordBoxes ?? asWordBoxes(storedChunk?.wordBoxes),
          pageWidth: cMeta.pageWidth ?? storedChunk?.pageWidth,
          pageHeight: cMeta.pageHeight ?? storedChunk?.pageHeight,
        };
      });
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
