import Tesseract from "tesseract.js";
import type { WordBox, TextChunk } from "./index";

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  text: string;
  chunks: TextChunk[];
  ocrConfidence: number;
  extractorUsed: string;
}

function collectWords(page: Tesseract.Page): Tesseract.Word[] {
  const words: Tesseract.Word[] = [];
  if (!page.blocks) return words;
  for (const block of page.blocks) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const word of line.words) {
          words.push(word);
        }
      }
    }
  }
  return words;
}

function toWordBox(b: Tesseract.Bbox): WordBox {
  return {
    x: b.x0,
    y: b.y0,
    width: b.x1 - b.x0,
    height: b.y1 - b.y0,
  };
}

function groupWordsIntoLines(words: Tesseract.Word[]): Tesseract.Word[][] {
  if (words.length === 0) return [];
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const lines: Tesseract.Word[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastLine = lines[lines.length - 1];
    const lastWord = lastLine[lastLine.length - 1];
    // Words on the same line share similar y (within 8px tolerance)
    const yGap = Math.abs(current.bbox.y0 - lastWord.bbox.y0);
    if (yGap <= 8) {
      lastLine.push(current);
    } else {
      lines.push([current]);
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

export async function extractImageText(dataUrl: string): Promise<OcrResult> {
  const result = await Tesseract.recognize(dataUrl, "eng", {
    logger: () => {
      /* silent by default; enable for debugging */
    },
  });

  const page = result.data;
  const words = collectWords(page);
  const text = page.text ?? words.map((w) => w.text).join(" ");
  const lines = groupWordsIntoLines(words);

  const chunks: TextChunk[] = lines.map((lineWords, idx) => {
    const wordBoxes = lineWords.map((w) => toWordBox(w.bbox));
    const lineText = lineWords.map((w) => w.text).join(" ");
    return {
      id: `c${idx + 1}`,
      text: lineText,
      bbox: mergeWordBoxes(wordBoxes),
      wordBoxes,
    };
  });

  const ocrConfidence = result.data.confidence ?? 70;
  return { text, chunks, ocrConfidence, extractorUsed: "tesseract" };
}
