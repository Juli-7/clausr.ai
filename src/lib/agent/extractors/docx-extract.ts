import mammoth from "mammoth";
import type { TextChunk } from "./index";

export interface DocxResult {
  text: string;
  chunks: TextChunk[];
  ocrConfidence: number;
  extractorUsed: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").trim();
}

function splitParagraphs(html: string): string[] {
  const cleaned = html.replace(/<\/p>/gi, "</p>\n");
  const parts = cleaned.split(/<\/p>\s*\n?/i);
  return parts
    .map((p) => stripHtml(p))
    .filter((t) => t.length > 0);
}

export async function extractDocxText(dataUrl: string): Promise<DocxResult> {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const buffer = Buffer.from(base64, "base64");

  const result = await mammoth.convertToHtml({ buffer });
  const paragraphs = splitParagraphs(result.value);

  const chunks: TextChunk[] = paragraphs.map((text, i) => ({
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
