import { extractImageText, type BBox } from "./ocr";
import { extractPdfText } from "./pdf-extract";
import { extractDocxText } from "./docx-extract";

export type { BBox };

export interface WordBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextChunk {
  id: string;
  text: string;
  bbox?: WordBox;
  wordBoxes?: WordBox[];
  pageNumber?: number;
}

export interface ExtractionResult {
  text: string;
  chunks: TextChunk[];
  pageCount?: number;
  ocrConfidence?: number;
  extractorUsed?: string;
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
  dataUrl?: string;
}): Promise<ExtractionResult> {
  if (!file.dataUrl) {
    return { text: `[File: ${file.name} — no content data available]`, chunks: [] };
  }

  const type = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  // Image OCR
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "tiff", "tif"];
  if (type.startsWith("image/") || imageExts.includes(ext)) {
    try {
      const result = await extractImageText(file.dataUrl);
      console.log(`[extractors] OCR success for ${file.name} (${result.text.length} chars, ${result.chunks.length} chunks): ${result.text.slice(0, 200)}`);
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

  // PDF
  if (type === "application/pdf" || ext === "pdf") {
    try {
      const result = await extractPdfText(file.dataUrl);
      console.log(`[extractors] PDF success for ${file.name} (${result.text.length} chars, ${result.pageCount} pages, ${result.chunks.length} chunks): ${result.text.slice(0, 200)}`);
      return {
        text: result.text,
        chunks: result.chunks,
        pageCount: result.pageCount,
        ocrConfidence: result.ocrConfidence,
        extractorUsed: result.extractorUsed,
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
