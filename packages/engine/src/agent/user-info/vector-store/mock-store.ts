import type { ChunkInfo, IDocStore, ProcessedFile, ProcessFileResult, WordBox } from "./types";
import { extractFileContent } from "../../user-info/extractors";
import {
  saveChunks,
  deleteChunksBySession,
  getChunksByIds,
  getFileChunks,
  saveFileChunks,
} from "../../shared/memory/repository";
import { logPipeline } from "../../pipeline/logger";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

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

function savePageImages(sessionId: string, filename: string, pageImages: string[]): void {
  const dir = path.join(UPLOADS_DIR, sessionId, `${filename}.pages`);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < pageImages.length; i++) {
    const dataUrl = pageImages[i];
    if (!dataUrl) continue;
    const base64 = dataUrl.split(",")[1] ?? dataUrl;
    fs.writeFileSync(path.join(dir, `${i}.png`), Buffer.from(base64, "base64"));
  }
}

export class MockDocStore implements IDocStore {
  async processFile(
    file: { name: string; size: number; type: string; dataUrl?: string },
    sessionId: string
  ): Promise<ProcessFileResult> {
    deleteChunksBySession(sessionId);
    const extracted = await extractFileContent(file);
    const chunkIds = saveChunks(sessionId, file.name, extracted.chunks);
    if (file.dataUrl) {
      saveRawFile(sessionId, file.name, file.dataUrl);
    }
    if (extracted.pageImages && extracted.pageImages.length > 0) {
      savePageImages(sessionId, file.name, extracted.pageImages);
    }
    const chunkInfos: ChunkInfo[] = extracted.chunks.map((c) => ({
      id: c.id,
      text: c.text,
      html: c.html,
      pageNumber: c.pageNumber,
      bbox: c.bbox,
      wordBoxes: c.wordBoxes,
      pageWidth: c.pageWidth,
      pageHeight: c.pageHeight,
    }));
    const meta = {
      fileId: file.name,
      filename: file.name,
      pageCount: extracted.pageCount,
      ocrConfidence: extracted.ocrConfidence,
      extractorUsed: extracted.extractorUsed,
      chunkIds,
      chunks: chunkInfos,
    };
    saveFileChunks(sessionId, JSON.stringify([meta]));
    return {
      extractedText: extracted.text,
      chunks: chunkInfos,
      pageCount: extracted.pageCount,
      ocrConfidence: extracted.ocrConfidence,
      extractorUsed: extracted.extractorUsed,
    };
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
      logPipeline(`[MOCK] getFiles "${meta.filename}": meta.chunks=${meta.chunks.length} chunkIds=${meta.chunkIds.length} fetchedChunks=${fetchedChunks.length}`);
      if (fetchedChunks.length !== meta.chunkIds.length) {
        const missing = meta.chunkIds.filter((id) => !fetchedChunks.find((fc) => fc.id === id));
        logPipeline(`[MOCK] getFiles "${meta.filename}": ${missing.length}/${meta.chunkIds.length} chunkId(s) not found in chunk_store: ${missing.slice(0, 5).join(", ")}...`);
      }
      const chunks: ChunkInfo[] = meta.chunks.map((cMeta, i) => {
        const storedChunk = fetchedChunks.find((fc) => fc.id === meta.chunkIds[i]);
        if (!storedChunk) {
          logPipeline(`[MOCK] getFiles "${meta.filename}": chunkIdx=${i} id="${meta.chunkIds[i]}" NOT FOUND in chunk_store — text will be ""`);
        }
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
      logPipeline(`[MOCK] getFiles "${meta.filename}": reconstructed fullText=${fullText.length}chars (from ${chunks.length} chunk(s))`);
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
