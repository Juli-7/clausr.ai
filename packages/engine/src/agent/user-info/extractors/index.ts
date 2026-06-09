import { extractImageText } from "./ocr";
import type { PdfResult } from "./pdf-extract";
import { extractDocxText } from "./docx-extract";

export interface WordBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextChunk {
  id: string;
  text: string;
  html?: string;  // <div data-chunk-id="cX">formatted content from source</div>
  bbox?: WordBox;
  wordBoxes?: WordBox[];
  pageNumber?: number;
  pageWidth?: number;
  pageHeight?: number;
}

export function mergeWordBoxes(boxes: WordBox[]): WordBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface ExtractionResult {
  text: string;
  chunks: TextChunk[];
  pageCount?: number;
  ocrConfidence?: number;
  extractorUsed?: string;
  pageImages?: string[];
}

/**
 * Extract plain text from a file based on its MIME type.
 *
 * Supported types:
 *  - image/*        → Tesseract.js OCR
 *  - application/pdf → pdf-parse
 *  - .docx types     → mammoth
 *  - any other       → graceful fallback (empty text)
 */
export async function extractFileContent(file: {
  name: string;
  type: string;
  size?: number;
  dataUrl?: string;
}): Promise<ExtractionResult> {
  if (!file.dataUrl) {
    return { text: `[File: ${file.name} — no content data available]`, chunks: [] };
  }

  if (file.size && file.size > 50 * 1024 * 1024) {
    return { text: `[File: ${file.name} — file exceeds 50MB maximum size]`, chunks: [] };
  }

  const type = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  // Image OCR
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "tiff", "tif"];
  if (type.startsWith("image/") || imageExts.includes(ext)) {
    try {
      const result = await extractImageText(file.dataUrl);
      return {
        text: result.text,
        chunks: result.chunks,
        ocrConfidence: result.ocrConfidence,
        extractorUsed: result.extractorUsed,
      };
    } catch (err) {
      console.error(`[extractors] OCR failed for ${file.name}:`, err);
      return { text: `[OCR failed for ${file.name}: ${err instanceof Error ? err.message : "unknown error"}]`, chunks: [] };
    }
  }

  // PDF — lazy import to avoid pulling pdfjs-dist eagerly (DOMMatrix not available in Node.js)
  if (type === "application/pdf" || ext === "pdf") {
    try {
      const { extractPdfText } = await import("./pdf-extract");
      const result: PdfResult = await extractPdfText(file.dataUrl);
      return {
        text: result.text,
        chunks: result.chunks,
        pageCount: result.pageCount,
        ocrConfidence: result.ocrConfidence,
        extractorUsed: result.extractorUsed,
        pageImages: result.pageImages,
      };
    } catch (err) {
      console.error(`[extractors] PDF parse failed for ${file.name}:`, err);
      return { text: `[PDF parsing failed for ${file.name}: ${err instanceof Error ? err.message : "unknown error"}]`, chunks: [] };
    }
  }

  // DOCX
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    try {
      const result = await extractDocxText(file.dataUrl);
      return { text: result.text, chunks: result.chunks, ocrConfidence: result.ocrConfidence, extractorUsed: result.extractorUsed };
    } catch (err) {
      console.error(`[extractors] DOCX parse failed for ${file.name}:`, err);
      return { text: `[DOCX parsing failed for ${file.name}: ${err instanceof Error ? err.message : "unknown error"}]`, chunks: [] };
    }
  }

  // Unsupported type — graceful fallback
  return { text: `[File: ${file.name} — unsupported type: ${file.type}]`, chunks: [] };
}
