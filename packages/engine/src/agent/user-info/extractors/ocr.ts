import Tesseract from "tesseract.js";
import { mergeWordBoxes, type WordBox, type TextChunk } from "./index";

function parseImageDimensions(dataUrl: string): { width: number; height: number } | null {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  const buf = Buffer.from(base64, "base64");

  // PNG: header + IHDR chunk
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // JPEG: scan for SOF0 marker (0xFF 0xC0)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    for (let i = 2; i < buf.length - 9; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xC0) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
    }
  }

  // WebP: RIFF header (needs at least 30 bytes)
  if (
    buf.length >= 30 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    const format = buf.readUInt32LE(12);
    if (format === 0x56503849 || format === 0x56503841) { // VP8I or VP8A
      return {
        width: ((buf[26]! & 0x3F) << 8) | (buf[25]! & 0xFF),
        height: ((buf[28]! & 0x7F) << 8) | (buf[27]! & 0xFF),
      };
    }
    if (format === 0x56503856) { // VP8L (lossless)
      const bits = (buf[24]! << 16) | (buf[23]! << 8) | buf[22]!;
      return {
        width: (bits & 0x3FFF) + 1,
        height: ((bits >> 14) & 0x3FFF) + 1,
      };
    }
  }

  // BMP
  if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4D) {
    return {
      width: buf.readUInt32LE(18),
      height: Math.abs(buf.readInt32LE(22)),
    };
  }

  // GIF
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    const sig = buf.toString("ascii", 0, 6);
    if (sig === "GIF87a" || sig === "GIF89a") {
      return {
        width: buf.readUInt16LE(6),
        height: buf.readUInt16LE(8),
      };
    }
  }

  return null;
}

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
  if (tesseractWorker) return tesseractWorker;
  if (!tesseractWorkerReady) {
    tesseractWorkerReady = (async () => {
      try {
        tesseractWorker = await Tesseract.createWorker("eng");
      } catch (err) {
        tesseractWorkerReady = null;
        throw err;
      }
    })();
  }
  await tesseractWorkerReady;
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
  const result = await worker.recognize(dataUrl, undefined, { blocks: true });

  const imageSize = parseImageDimensions(dataUrl);

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
      pageWidth: imageSize?.width,
      pageHeight: imageSize?.height,
    };
  });

  const overlapChars = 120;
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
