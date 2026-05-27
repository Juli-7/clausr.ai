import mammoth from "mammoth";
import type { TextChunk } from "./index";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&nbsp;": " ", "&mdash;": "\u2014", "&ndash;": "\u2013", "&euro;": "\u20AC",
  "&copy;": "\u00A9", "&reg;": "\u00AE", "&trade;": "\u2122", "&hellip;": "\u2026",
  "&bull;": "\u2022", "&middot;": "\u00B7", "&deg;": "\u00B0", "&plusmn;": "\u00B1",
  "&times;": "\u00D7", "&divide;": "\u00F7", "&frac12;": "\u00BD", "&frac14;": "\u00BC",
  "&frac34;": "\u00BE", "&laquo;": "\u00AB", "&raquo;": "\u00BB", "&lsquo;": "\u2018",
  "&rsquo;": "\u2019", "&ldquo;": "\u201C", "&rdquo;": "\u201D",
};

export interface DocxResult {
  text: string;
  chunks: TextChunk[];
  ocrConfidence: number;
  extractorUsed: string;
}

function stripHtml(html: string): string {
  let text = html.replace(/<[^>]+>/g, "");
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(char);
  }
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  return text.trim();
}

interface ParagraphInfo {
  text: string;
  html: string;
}

function extractParagraphs(mammothHtml: string): ParagraphInfo[] {
  const cleaned = mammothHtml.replace(/<\/p>/gi, "</p>\n");
  const parts = cleaned.split(/<\/p>\s*\n?/i);
  return parts
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const fullHtml = p.trim() + "</p>";
      const text = stripHtml(fullHtml);
      return { text, html: fullHtml };
    });
}

const MAX_CHUNK_SIZE = 2000;
const OVERLAP_CHARS = 120;

function splitLargeText(text: string): string[] {
  const sentences = text.match(/[^。！？\n.!?]+[。！？\n.!?]?/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current.length + s.length > MAX_CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function buildChunks(paragraphs: ParagraphInfo[]): TextChunk[] {
  const merged: { text: string; html: string }[] = [];
  let current: ParagraphInfo[] = [];

  function flushCurrent(): void {
    if (current.length === 0) return;
    merged.push({
      text: current.map((p) => p.text).join("\n"),
      html: current.map((p) => p.html).join("\n"),
    });
    current = [];
  }

  for (const para of paragraphs) {
    if (para.text.length > MAX_CHUNK_SIZE) {
      flushCurrent();
      const parts = splitLargeText(para.text);
      for (const part of parts) {
        merged.push({ text: part, html: `<p>${part}</p>` });
      }
      continue;
    }
    const wouldBeTooLong =
      current.reduce((s, p) => s + p.text.length + 1, 0) + para.text.length >
      MAX_CHUNK_SIZE;
    if (wouldBeTooLong) flushCurrent();
    current.push(para);
  }
  flushCurrent();

  const chunks: TextChunk[] = merged.map((chunk, i) => {
    const id = `c${i + 1}`;
    return {
      id,
      text: chunk.text,
      html: `<div data-chunk-id="${id}">\n${chunk.html}\n</div>`,
    };
  });

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    if (prev.text.length <= OVERLAP_CHARS) continue;
    const tail = prev.text.slice(-OVERLAP_CHARS);
    const lastNewline = tail.indexOf("\n");
    const overlap = lastNewline >= 0 ? tail.slice(lastNewline + 1) : tail;
    chunks[i] = {
      ...chunks[i],
      text: overlap + "\n" + chunks[i].text,
    };
  }

  return chunks;
}

export async function extractDocxText(dataUrl: string): Promise<DocxResult> {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const buffer = Buffer.from(base64, "base64");

  const result = await mammoth.convertToHtml({ buffer });
  if (result.messages && result.messages.length > 0) {
    for (const msg of result.messages) {
      console.warn(`[docx-extract] mammoth: ${msg.type} \u2014 ${msg.message}`);
    }
  }

  const paragraphs = extractParagraphs(result.value);
  const chunks = buildChunks(paragraphs);

  return {
    text: chunks.map((c) => c.text).join("\n"),
    chunks,
    ocrConfidence: 100,
    extractorUsed: "mammoth",
  };
}
