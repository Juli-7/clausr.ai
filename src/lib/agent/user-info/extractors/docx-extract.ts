import mammoth from "mammoth";
import type { TextChunk } from "./index";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&euro;": "€",
  "&copy;": "©", "&reg;": "®", "&trade;": "™", "&hellip;": "…",
  "&bull;": "•", "&middot;": "·", "&deg;": "°", "&plusmn;": "±",
  "&times;": "×", "&divide;": "÷", "&frac12;": "½", "&frac14;": "¼",
  "&frac34;": "¾", "&laquo;": "«", "&raquo;": "»", "&lsquo;": "'",
  "&rsquo;": "'", "&ldquo;": "\"", "&rdquo;": "\"",
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

function splitParagraphs(html: string): string[] {
  const cleaned = html.replace(/<\/p>/gi, "</p>\n");
  const parts = cleaned.split(/<\/p>\s*\n?/i);
  return parts
    .map((p) => stripHtml(p))
    .filter((t) => t.length > 0);
}

const MAX_CHUNK_SIZE = 2000;

function splitLargeText(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) return [text];

  const byDoubleNewline = text.split(/\n\s*\n/).filter((s) => s.trim().length > 0);
  if (byDoubleNewline.length > 1) {
    return byDoubleNewline.flatMap((part) => splitLargeText(part));
  }

  const byNewline = text.split("\n").filter((s) => s.trim().length > 0);
  if (byNewline.length > 1) {
    return byNewline.flatMap((part) => splitLargeText(part));
  }

  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK_SIZE, text.length);
    if (end < text.length) {
      const searchStart = Math.max(end - 100, start);
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > searchStart) end = lastSpace;
    }
    parts.push(text.slice(start, end).trim());
    start = end;
  }
  return parts.filter((s) => s.length > 0);
}

export async function extractDocxText(dataUrl: string): Promise<DocxResult> {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const buffer = Buffer.from(base64, "base64");

  const result = await mammoth.convertToHtml({ buffer });
  if (result.messages && result.messages.length > 0) {
    for (const msg of result.messages) {
      console.warn(`[docx-extract] mammoth: ${msg.type} — ${msg.message}`);
    }
  }
  const paragraphs = splitParagraphs(result.value);

  const rawChunks = paragraphs.flatMap((text) => splitLargeText(text));
  const chunks: TextChunk[] = rawChunks.map((text, i) => ({
    id: `c${i + 1}`,
    text,
  }));

  return {
    text: chunks.map((c) => c.text).join("\n"),
    chunks,
    ocrConfidence: 100,
    extractorUsed: "mammoth",
  };
}
