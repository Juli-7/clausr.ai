import Tesseract from "tesseract.js";
import { mergeWordBoxes, type WordBox, type TextChunk } from "./index";

function parseImageDimensions(dataUrl: string): { width: number; height: number } | null {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  const buf = Buffer.from(base64, "base64");

  // PNG: header + IHDR chunk
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: scan for SOF0 marker (0xFF 0xC0)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    for (let i = 2; i < buf.length - 9; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xC0) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
    }
  }

  // WebP: RIFF header
  if (
    buf.length >= 30 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    const format = buf.readUInt32LE(12);
    if (format === 0x56503849 || format === 0x56503841) {
      return {
        width: ((buf[26]! & 0x3F) << 8) | (buf[25]! & 0xFF),
        height: ((buf[28]! & 0x7F) << 8) | (buf[27]! & 0xFF),
      };
    }
    if (format === 0x56503856) {
      const bits = (buf[24]! << 16) | (buf[23]! << 8) | buf[22]!;
      return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
    }
  }

  // BMP
  if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4D) {
    return { width: buf.readUInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
  }

  // GIF
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    const sig = buf.toString("ascii", 0, 6);
    if (sig === "GIF87a" || sig === "GIF89a") {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
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

function toWordBox(b: Tesseract.Bbox): WordBox {
  return { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 };
}

/**
 * Split oversized paragraph text at sentence boundaries.
 * Falls back to splitting at last space before limit if no sentence boundary found.
 */
function splitParagraph(text: string, hardMax: number): string[] {
  if (text.length <= hardMax) return [text];
  const sentences = text.match(/[^。！？\n.!?]+[。！？\n.!?]?/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current.length + s.length > hardMax && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If a single sentence exceeds hardMax, force-split at word boundary
  return chunks.flatMap((c) => {
    if (c.length <= hardMax) return [c];
    const forced: string[] = [];
    let remaining = c;
    while (remaining.length > hardMax) {
      let splitAt = remaining.lastIndexOf(" ", hardMax);
      if (splitAt < hardMax * 0.5) splitAt = hardMax;
      forced.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) forced.push(remaining);
    return forced;
  });
}

/**
 * Collect paragraphs from Tesseract output hierarchy (blocks → paragraphs → lines → words).
 * Each paragraph becomes a single chunk unit, preserving structural cohesion.
 */
function collectParagraphs(page: Tesseract.Page): { words: Tesseract.Word[]; text: string; bbox: WordBox }[] {
  const paragraphs: { words: Tesseract.Word[]; text: string; bbox: WordBox }[] = [];
  if (!page.blocks) return paragraphs;

  for (const block of page.blocks) {
    for (const para of block.paragraphs) {
      const words: Tesseract.Word[] = [];
      for (const line of para.lines) {
        for (const word of line.words) words.push(word);
      }
      if (words.length === 0) continue;

      const text = words.map((w) => w.text).join(" ");
      const wordBoxes = words.map((w) => toWordBox(w.bbox));
      paragraphs.push({ words, text, bbox: mergeWordBoxes(wordBoxes) });
    }
  }

  return paragraphs;
}

const HARD_MAX_CHARS = 1200;
const OVERLAP_CHARS = 120;

export async function extractImageText(dataUrl: string): Promise<OcrResult> {
  const worker = await getTesseractWorker();
  const result = await worker.recognize(dataUrl, undefined, { blocks: true });

  const imageSize = parseImageDimensions(dataUrl);
  const page = result.data;

  // Try paragraph-level chunking first
  const paragraphs = collectParagraphs(page);

  let rawChunks: TextChunk[];
  if (paragraphs.length > 0) {
    // Paragraph-level: each paragraph is a chunk, split only if oversized
    rawChunks = [];
    let idx = 0;
    for (const para of paragraphs) {
      const parts = splitParagraph(para.text, HARD_MAX_CHARS);
      const wordBoxes = para.words.map((w) => toWordBox(w.bbox));
      for (const part of parts) {
        idx++;
        rawChunks.push({
          id: `c${idx}`,
          text: part,
          html: `<div data-chunk-id="c${idx}"><p>${part}</p></div>`,
          bbox: para.bbox,
          wordBoxes,
          pageWidth: imageSize?.width,
          pageHeight: imageSize?.height,
        });
      }
    }
  } else {
    // Fallback to line-level for older Tesseract or when no paragraph data
    const words: Tesseract.Word[] = [];
    if (page.blocks) {
      for (const block of page.blocks) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            for (const word of line.words) words.push(word);
          }
        }
      }
    }

    const lines = groupWordsIntoLines(words);
    rawChunks = lines.map((lineWords, i) => {
      const wordBoxes = lineWords.map((w) => toWordBox(w.bbox));
      const lineText = lineWords.map((w) => w.text).join(" ");
      const id = `c${i + 1}`;
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
  }

  // Apply overlap between adjacent chunks for retrieval context
  const chunks: TextChunk[] = rawChunks.map((chunk, i) => {
    if (i === 0) return chunk;
    const prev = rawChunks[i - 1]!;
    if (prev.text.length <= OVERLAP_CHARS) return chunk;
    const tail = prev.text.slice(-OVERLAP_CHARS);
    return { ...chunk, text: tail + "\n" + chunk.text };
  });

  const ocrConfidence = result.data.confidence ?? 70;
  return { text: page.text ?? "", chunks, ocrConfidence, extractorUsed: "tesseract" };
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
