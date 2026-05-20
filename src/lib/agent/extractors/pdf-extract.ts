import { PDFParse } from "pdf-parse";
import type { TextChunk, WordBox } from "./index";

export interface PdfResult {
  text: string;
  pageCount: number;
  chunks: TextChunk[];
  ocrConfidence: number;
  extractorUsed: string;
}

interface PdfTextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

function extractWordBox(item: PdfTextItem): WordBox | null {
  if (!item.transform || item.transform.length < 6) return null;
  const tx = item.transform[4];
  const ty = item.transform[5];
  const w = item.width ?? 0;
  const h = item.height ?? 12;
  if (tx === undefined || ty === undefined) return null;
  return { x: tx, y: ty, width: w, height: h };
}

function groupItemsIntoLines(items: PdfTextItem[]): PdfTextItem[][] {
  const withBoxes = items
    .map((item) => ({ item, box: extractWordBox(item) }))
    .filter((x) => x.box !== null)
    .sort((a, b) => a.box!.y - b.box!.y || a.box!.x - b.box!.x);

  if (withBoxes.length === 0) {
    const lines: PdfTextItem[][] = [];
    let currentLine: PdfTextItem[] = [];
    for (const item of items) {
      const text = item.str?.trim() ?? "";
      if (!text) continue;
      currentLine.push(item);
      if (text.endsWith(".") || text.endsWith(":)") || currentLine.length >= 5) {
        lines.push(currentLine);
        currentLine = [];
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
  }

  const lines: PdfTextItem[][] = [[withBoxes[0].item]];
  for (let i = 1; i < withBoxes.length; i++) {
    const current = withBoxes[i];
    const lastBox = withBoxes[i - 1].box!;
    const yGap = Math.abs(current.box!.y - lastBox.y);
    if (yGap <= 8) {
      lines[lines.length - 1].push(current.item);
    } else {
      lines.push([current.item]);
    }
  }
  return lines;
}

function mergeWordBoxes(wordBoxes: WordBox[]): WordBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const wb of wordBoxes) {
    if (wb.x < minX) minX = wb.x;
    if (wb.y < minY) minY = wb.y;
    if (wb.x + wb.width > maxX) maxX = wb.x + wb.width;
    if (wb.y + wb.height > maxY) maxY = wb.y + wb.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export async function extractPdfText(dataUrl: string): Promise<PdfResult> {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const buffer = Buffer.from(base64, "base64");

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const textResult = await parser.getText();
    const text = textResult.text ?? "";
    const pageCount = textResult.total ?? 0;

    if (text.trim().length > 0) {
      console.log(`[pdf-extract] pdf-parse OK: ${text.length} chars, ${pageCount} pages`);

      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const chunks: TextChunk[] = lines.map((line, i) => ({
        id: `c${i + 1}`,
        text: line.trim(),
      }));

      return { text, pageCount, chunks, ocrConfidence: 100, extractorUsed: "pdf-parse" };
    }

    console.warn(`[pdf-extract] pdf-parse returned empty text (${pageCount} pages) — PDF is likely image-based/scanned`);
    return { text: `[This PDF contains no extractable text (${pageCount} pages). It may be an image-based/scanned document. For scanned PDFs, convert pages to images and upload them for OCR.]`, pageCount, chunks: [], ocrConfidence: 0, extractorUsed: "fallback" };
  } finally {
    await parser.destroy();
  }
}
