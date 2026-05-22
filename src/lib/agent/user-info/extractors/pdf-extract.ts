import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
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

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function itemToWordBox(item: PdfTextItem): WordBox | null {
  if (!item.transform || item.transform.length < 6) return null;
  const x = item.transform[4];
  const y = item.transform[5];
  if (x == null || y == null) return null;
  return { x, y, width: item.width ?? 0, height: item.height ?? 12 };
}

function groupItemsIntoLines(items: PdfTextItem[]): PdfTextItem[][] {
  const withPos = items
    .filter((i) => (i.str ?? "").trim().length > 0)
    .map((i) => ({ item: i, box: itemToWordBox(i) }))
    .filter((x): x is { item: PdfTextItem; box: WordBox } => x.box !== null)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  if (withPos.length === 0) return [];

  const lines: PdfTextItem[][] = [[withPos[0].item]];
  for (let i = 1; i < withPos.length; i++) {
    const prevBox = withPos[i - 1].box;
    const currBox = withPos[i].box;
    const tolerance = Math.max(prevBox.height, currBox.height) * 0.75;
    if (Math.abs(currBox.y - prevBox.y) <= tolerance) {
      lines[lines.length - 1].push(withPos[i].item);
    } else {
      lines.push([withPos[i].item]);
    }
  }
  return lines;
}

function linesToChunks(lines: PdfTextItem[][], pageNumber: number): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const line of lines) {
    const wordBoxes: WordBox[] = [];
    const texts: string[] = [];

    for (const item of line) {
      const wb = itemToWordBox(item);
      if (wb) {
        wordBoxes.push(wb);
        texts.push(item.str);
      }
    }

    if (wordBoxes.length === 0) continue;

    const bbox = mergeWordBoxes(wordBoxes);
    const text = texts.join(" ");

    const prev = chunks[chunks.length - 1];
    const gapThreshold = bbox.height * 1.5;

    if (prev && prev.pageNumber === pageNumber && prev.bbox) {
      const prevBottom = prev.bbox.y + prev.bbox.height;
      const gap = bbox.y - prevBottom;

      if (gap >= 0 && gap <= gapThreshold) {
        prev.text += "\n" + text;
        prev.bbox = {
          x: Math.min(prev.bbox.x, bbox.x),
          y: prev.bbox.y,
          width:
            Math.max(prev.bbox.x + prev.bbox.width, bbox.x + bbox.width) -
            Math.min(prev.bbox.x, bbox.x),
          height: Math.max(prev.bbox.y + prev.bbox.height, bbox.y + bbox.height) - prev.bbox.y,
        };
        prev.wordBoxes?.push(...wordBoxes);
        continue;
      }
    }

    chunks.push({
      id: `c${chunks.length + 1}`,
      text,
      bbox,
      wordBoxes,
      pageNumber,
    });
  }

  return chunks.map((c, i) => ({ ...c, id: `c${i + 1}` }));
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
      const textContent = await page.getTextContent();
      const items = textContent.items as PdfTextItem[];
      const lines = groupItemsIntoLines(items);
      const pageChunks = linesToChunks(lines, i);
      allChunks.push(...pageChunks);

      for (const item of items) {
        totalChars += (item.str ?? "").length;
      }

      page.cleanup();
    }

    if (totalChars > 50) {
      const fullText = allChunks.map((c) => c.text).join("\n\n");
      return {
        text: fullText,
        pageCount,
        chunks: allChunks,
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
    let totalConfidence = 0;
    let pageWithText = 0;
    let chunkCounter = 0;

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

      for (const chunk of result.chunks) {
        allChunks.push({
          ...chunk,
          id: `c${++chunkCounter}`,
          pageNumber: screenshot.pageNumber,
        });
      }
    }

    const fullText = allChunks.map((c) => c.text).join("\n\n");
    const avgConfidence = pageWithText > 0 ? totalConfidence / pageWithText : 0;

    if (fullText.length > 0) {
      return {
        text: fullText,
        pageCount,
        chunks: allChunks,
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
