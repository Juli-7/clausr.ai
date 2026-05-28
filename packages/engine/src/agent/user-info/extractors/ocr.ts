import Tesseract from "tesseract.js";
import { mergeWordBoxes, type WordBox, type TextChunk } from "./index";

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

let tesseractWorker: Tesseract.Worker | null = null;
let tesseractWorkerReady: Promise<void> | null = null;

async function getTesseractWorker(): Promise<Tesseract.Worker> {
  if (!tesseractWorker) {
    tesseractWorkerReady = (async () => {
      tesseractWorker = await Tesseract.createWorker("eng", 1, { langPath: process.cwd() });
    })();
    await tesseractWorkerReady;
  } else if (tesseractWorkerReady) {
    await tesseractWorkerReady;
  }
  return tesseractWorker!;
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

  const avgHeight = sorted.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / sorted.length;
  const tolerance = avgHeight * 0.5;

  const lines: Tesseract.Word[][] = [[sorted[0]!]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const lastLine = lines[lines.length - 1]!;
    const lastWord = lastLine[lastLine.length - 1]!;
    const yGap = Math.abs(current.bbox.y0 - lastWord.bbox.y0);
    if (yGap <= tolerance) {
      lastLine.push(current);
    } else {
      lines.push([current]);
    }
  }
  return lines;
}

export async function extractImageText(dataUrl: string): Promise<OcrResult> {
  const worker = await getTesseractWorker();
  const result = await worker.recognize(dataUrl);

  const page = result.data;
  const words = collectWords(page);
  const text = page.text ?? words.map((w) => w.text).join(" ");
  const lines = groupWordsIntoLines(words);

  const rawChunks: TextChunk[] = lines.map((lineWords, idx) => {
    const wordBoxes = lineWords.map((w) => toWordBox(w.bbox));
    const lineText = lineWords.map((w) => w.text).join(" ");
    const id = `c${idx + 1}`;
    return {
      id,
      text: lineText,
      html: `<div data-chunk-id="${id}"><p>${lineText}</p></div>`,
      bbox: mergeWordBoxes(wordBoxes),
      wordBoxes,
    };
  });

  // Apply overlap between adjacent lines for retrieval context
  const overlapChars = 80;
  const chunks: TextChunk[] = rawChunks.map((chunk, i) => {
    if (i === 0) return chunk;
    const prev = rawChunks[i - 1]!;
    if (prev.text.length <= overlapChars) return chunk;
    const tail = prev.text.slice(-overlapChars);
    return {
      ...chunk,
      text: tail + "\n" + chunk.text,
    };
  });

  const ocrConfidence = result.data.confidence ?? 70;
  return { text, chunks, ocrConfidence, extractorUsed: "tesseract" };
}
