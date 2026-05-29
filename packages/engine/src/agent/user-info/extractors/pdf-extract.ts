import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-expect-error — pdf.worker.mjs has no type declarations
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
// Node.js 24 structuredClone({ transfer }) is broken — pdfjs-dist's LoopbackPort
// depends on it. Monkeypatch: copy instead of transfer (safe for in-process worker).
// MUST run before any pdfjs getDocument() call.
const __origStructuredClone = globalThis.structuredClone;
globalThis.structuredClone = ((value: unknown, options?: Parameters<typeof globalThis.structuredClone>[1]) => {
  if (options?.transfer) return __origStructuredClone(value);
  return __origStructuredClone(value, options);
}) as typeof globalThis.structuredClone;
(globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;
import { PDFParse } from "pdf-parse";
import { extractImageText } from "./ocr";
import { mergeWordBoxes, type TextChunk, type WordBox } from "./index";

export interface PdfResult {
  text: string;
  pageCount: number;
  chunks: TextChunk[];
  ocrConfidence: number;
  extractorUsed: string;
}

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

interface PositionedTextItem {
  item: PdfTextItem;
  box: WordBox;
}

const SOFT_MAX_CHARS = 800;
const HARD_MAX_CHARS = 1200;
const MAX_CHUNK_LINES = 8;

function itemToWordBoxes(item: PdfTextItem, pageHeight: number): WordBox[] {
  if (!item.transform || item.transform.length < 6) return [];

  const text = item.str ?? "";
  if (text.trim().length === 0) return [];

  const x = item.transform[4];
  const pdfY = item.transform[5];
  if (x == null || pdfY == null) return [];

  const width = item.width ?? 0;
  const height = item.height || Math.abs(item.transform[3]!) || 12;
  const y = pageHeight - pdfY - height;
  const trimmedStart = text.search(/\S/);
  if (trimmedStart === -1) return [];

  const words = [...text.matchAll(/\S+/g)];
  if (words.length === 0) return [];

  // pdf.js text items are often runs, not words. Approximate each word's
  // rectangle inside the run so highlights are tighter than whole-line boxes.
  const charWidth = width > 0 ? width / text.length : 0;
  return words.map((match) => {
    const start = match.index ?? trimmedStart;
    const word = match[0];
    return {
      x: x + start * charWidth,
      y,
      width: Math.max(word.length * charWidth, 1),
      height,
    };
  });
}

function itemToWordBox(item: PdfTextItem, pageHeight: number): WordBox | null {
  const boxes = itemToWordBoxes(item, pageHeight);
  return boxes.length > 0 ? mergeWordBoxes(boxes) : null;
}

function groupItemsIntoLines(items: PdfTextItem[], pageHeight: number): PdfTextItem[][] {
  const withPos = items
    .filter((i) => (i.str ?? "").trim().length > 0)
    .map((i) => ({ item: i, box: itemToWordBox(i, pageHeight) }))
    .filter((x): x is PositionedTextItem => x.box !== null)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  if (withPos.length === 0) return [];

  const positionedLines: PositionedTextItem[][] = [[withPos[0]!]];
  for (let i = 1; i < withPos.length; i++) {
    const prevBox = withPos[i - 1]!.box;
    const currBox = withPos[i]!.box;
    const tolerance = Math.max(prevBox.height, currBox.height) * 0.75;
    if (Math.abs(currBox.y - prevBox.y) <= tolerance) {
      positionedLines[positionedLines.length - 1]!.push(withPos[i]!);
    } else {
      positionedLines.push([withPos[i]!]);
    }
  }

  return positionedLines.map((line) =>
    line.sort((a, b) => a.box.x - b.box.x).map((entry) => entry.item)
  );
}

function lineToChunkInput(line: PdfTextItem[], pageHeight: number): { text: string; bbox: WordBox; wordBoxes: WordBox[] } | null {
  const wordBoxes: WordBox[] = [];
  const texts: string[] = [];

  for (const item of line) {
    const boxes = itemToWordBoxes(item, pageHeight);
    if (boxes.length > 0) {
      wordBoxes.push(...boxes);
      texts.push((item.str ?? "").trim());
    }
  }

  if (wordBoxes.length === 0) return null;

  return {
    text: texts.join(" ").replace(/\s+/g, " ").trim(),
    bbox: mergeWordBoxes(wordBoxes),
    wordBoxes,
  };
}

export interface LineStyle {
  bucket: number;
  isBold: boolean;
}

export function getLineStyle(line: PdfTextItem[]): LineStyle {
  let totalLen = 0;
  let weightedSize = 0;
  let boldCount = 0;
  for (const item of line) {
    const len = (item.str ?? "").length;
    if (len === 0) continue;
    totalLen += len;
    weightedSize += Math.abs(item.transform[0] ?? 12) * len;
    if (/bold|black|heavy|demi/i.test(item.fontName ?? "")) boldCount++;
  }
  const avgSize = totalLen > 0 ? weightedSize / totalLen : 12;
  const bucket = avgSize < 8 ? 0 : avgSize < 11 ? 1 : avgSize < 14 ? 2 : avgSize < 18 ? 3 : 4;
  return { bucket, isBold: boldCount > line.length / 2 };
}

export function isListItem(text: string): boolean {
  return /^\s*[-*•]\s/.test(text) || /^\s*\d+[.)]\s/.test(text);
}

export function isTableRow(words: WordBox[], _text: string): boolean {
  if (words.length < 3) return false;
  const gaps: number[] = [];
  for (let i = 1; i < words.length; i++) {
    gaps.push(words[i]!.x - (words[i - 1]!.x + words[i - 1]!.width));
  }
  if (gaps.length < 2) return false;
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const largeGaps = gaps.filter((g) => g > avgGap * 2).length;
  return largeGaps >= 1;
}

function linesToChunks(lines: PdfTextItem[][], pageNumber: number, pageWidth: number, pageHeight: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current: TextChunk | null = null;
  let currentLines = 0;
  let currentStyle: LineStyle | null = null;
  let currentHasListMarker = false;
  let currentTableRows = 0;

  function flushCurrent(): void {
    if (!current) return;
    chunks.push(current);
    current = null;
    currentLines = 0;
    currentStyle = null;
    currentHasListMarker = false;
    currentTableRows = 0;
  }

  for (const line of lines) {
    const lineChunk = lineToChunkInput(line, pageHeight);
    if (!lineChunk) continue;

    const style = getLineStyle(line);
    const lineIsListItem = isListItem(lineChunk.text);
    const lineIsTableRow = isTableRow(lineChunk.wordBoxes ?? [], lineChunk.text);

    const shouldStartNew = !current || !current.bbox || (() => {
      const prevBottom = current.bbox.y + current.bbox.height;
      const gap = lineChunk.bbox.y - prevBottom;
      const gapThreshold = Math.max(current.bbox.height, lineChunk.bbox.height) * 1.35;
      const isGapBreak = gap < 0 || gap > gapThreshold;

      const projectedLen = current.text.length + lineChunk.text.length + 1;
      const tooManyLines = currentLines >= MAX_CHUNK_LINES;

      // Force-split: hard limit or line count exceeded
      if (projectedLen > HARD_MAX_CHARS || tooManyLines) return true;

      // Heading boundary: style bucket or bold state changed
      const styleChanged = currentStyle && (
        currentStyle.bucket !== style.bucket ||
        currentStyle.isBold !== style.isBold
      );

      // At soft limit, prefer splitting at a natural boundary
      if (projectedLen > SOFT_MAX_CHARS) {
        if (styleChanged || isGapBreak || (currentHasListMarker !== lineIsListItem && !lineIsListItem)) {
          return true;
        }
      }

      // Keep table rows together (don't break mid-table)
      if (currentTableRows > 0 && lineIsTableRow) return false;

      return isGapBreak || styleChanged;
    })();

    if (shouldStartNew) {
      flushCurrent();
      current = {
        id: "",
        text: lineChunk.text,
        bbox: lineChunk.bbox,
        wordBoxes: lineChunk.wordBoxes,
        pageNumber,
        pageWidth,
        pageHeight,
      };
      currentLines = 1;
      currentStyle = style;
      currentHasListMarker = lineIsListItem;
      currentTableRows = lineIsTableRow ? 1 : 0;
      continue;
    }

    if (!current?.bbox) continue;

    current.text += "\n" + lineChunk.text;
    current.wordBoxes?.push(...lineChunk.wordBoxes);
    current.bbox = mergeWordBoxes([current.bbox, lineChunk.bbox]);
    currentLines++;
    currentHasListMarker = currentHasListMarker || lineIsListItem;
    if (lineIsTableRow) currentTableRows++;
  }

  flushCurrent();
  return chunks;
}

const OVERLAP_CHARS = 120;

function applyOverlap(chunks: TextChunk[]): TextChunk[] {
  if (chunks.length <= 1) return chunks;
  const result: TextChunk[] = [chunks[0]!];
  for (let i = 1; i < chunks.length; i++) {
    const prev = result[i - 1]!;
    const curr = chunks[i]!;
    if (prev.text.length <= OVERLAP_CHARS) {
      result.push(curr);
      continue;
    }
    const tail = prev.text.slice(-OVERLAP_CHARS);
    const lastNewline = tail.indexOf("\n");
    const overlap = lastNewline >= 0 ? tail.slice(lastNewline + 1) : tail;
    result.push({
      ...curr,
      text: overlap + "\n" + curr.text,
    });
  }
  return result;
}

function finalizeChunks(chunks: TextChunk[]): TextChunk[] {
  const withIds = chunks.map((chunk, index) => {
    const id = `c${index + 1}`;
    let html = chunk.html;
    if (html) {
      html = html.replace(/data-chunk-id="[^"]*"/, `data-chunk-id="${id}"`);
    } else {
      html = `<div data-chunk-id="${id}"><p>${chunk.text.replace(/\n/g, '<br>')}</p></div>`;
    }
    return { ...chunk, id, html };
  });
  return applyOverlap(withIds);
}

const PDF_MAGIC = /^%PDF/;

export async function extractPdfText(dataUrl: string): Promise<PdfResult> {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const buffer = Buffer.from(base64, "base64");

  if (!PDF_MAGIC.test(buffer.slice(0, 4).toString("ascii"))) {
    return {
      text: "[PDF processing failed: file does not start with %PDF header]",
      pageCount: 0,
      chunks: [],
      ocrConfidence: 0,
      extractorUsed: "error",
    };
  }

  const data = new Uint8Array(buffer);

  // Path A: Positioned text extraction via pdfjs-dist
  let pdfjsDoc: pdfjs.PDFDocumentProxy | null = null;
  try {
    const loadingTask = pdfjs.getDocument({ data });
    pdfjsDoc = await loadingTask.promise;
    const pageCount = pdfjsDoc.numPages;

    const allChunks: TextChunk[] = [];
    let totalChars = 0;

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfjsDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const items = textContent.items as PdfTextItem[];
      const lines = groupItemsIntoLines(items, viewport.height);
      const pageChunks = linesToChunks(lines, i, viewport.width, viewport.height);
      allChunks.push(...pageChunks);

      for (const item of items) {
        totalChars += (item.str ?? "").length;
      }

      page.cleanup();
    }

    if (totalChars > 50) {
      const chunks = finalizeChunks(allChunks);
      const fullText = chunks.map((c) => c.text).join("\n\n");
      return {
        text: fullText,
        pageCount,
        chunks,
        ocrConfidence: 100,
        extractorUsed: "pdfjs-dist",
      };
    }
  } catch (err) {
    console.warn(`[pdf-extract] pdfjs-dist extraction failed:`, err);
  } finally {
    pdfjsDoc?.destroy();
  }

  // Path B: Scanned PDF — render pages via pdf-parse's getScreenshot, then OCR
  try {
    const parser = new PDFParse({ data });
    const screenshots = await parser.getScreenshot({
      imageDataUrl: true,
      imageBuffer: false,
    });
    await parser.destroy();

    const pageCount = screenshots.total;
    const allChunks: TextChunk[] = [];
    const pageSizes = new Map<number, { width: number; height: number }>();
    let totalConfidence = 0;
    let pageWithText = 0;

    for (const screenshot of screenshots.pages) {
      if (typeof screenshot.width === "number" && typeof screenshot.height === "number") {
        pageSizes.set(screenshot.pageNumber, { width: screenshot.width, height: screenshot.height });
      }
    }

    const validScreenshots = screenshots.pages.filter((s) => s.dataUrl);

    const ocrResults = await Promise.all(
      validScreenshots.map((screenshot) =>
        extractImageText(screenshot.dataUrl!).then(
          (result) => ({ screenshot, result, error: null }),
          (error) => ({ screenshot, result: null, error })
        )
      )
    );

    for (const { screenshot, result, error } of ocrResults) {
      if (error) {
        console.warn(`[pdf-extract] OCR failed for page ${screenshot.pageNumber}:`, error);
        continue;
      }
      if (!result || result.text.trim().length === 0) continue;

      totalConfidence += result.ocrConfidence ?? 0;
      pageWithText++;

      const pageSize = pageSizes.get(screenshot.pageNumber);
      for (const chunk of result.chunks) {
        allChunks.push({
          ...chunk,
          id: "",
          pageNumber: screenshot.pageNumber,
          pageWidth: pageSize?.width,
          pageHeight: pageSize?.height,
        });
      }
    }

    const chunks = finalizeChunks(allChunks);
    const fullText = chunks.map((c) => c.text).join("\n\n");
    const avgConfidence = pageWithText > 0 ? totalConfidence / pageWithText : 0;

    if (fullText.length > 0) {
      return {
        text: fullText,
        pageCount,
        chunks,
        ocrConfidence: avgConfidence,
        extractorUsed: "tesseract",
      };
    }

    return {
      text: `[This PDF contains no extractable text (${pageCount} pages). OCR processing returned no results.]`,
      pageCount,
      chunks: [],
      ocrConfidence: 0,
      extractorUsed: "fallback",
    };
  } catch (err) {
    console.error(`[pdf-extract] OCR fallback failed:`, err);
    return {
      text: `[PDF processing failed: ${err instanceof Error ? err.message : "unknown error"}]`,
      pageCount: 0,
      chunks: [],
      ocrConfidence: 0,
      extractorUsed: "error",
    };
  }
}
