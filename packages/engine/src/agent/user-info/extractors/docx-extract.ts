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

interface DocxElement {
  text: string;
  html: string;
  headingLevel: number | null; // 1 for h1, 2 for h2, etc. null for body
}

export function extractElements(mammothHtml: string): DocxElement[] {
  const elements: DocxElement[] = [];
  // Split by common block-level tags: h1-h6, p, li
  const tagPattern = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = tagPattern.exec(mammothHtml)) !== null) {
    const tag = match[1]!.toLowerCase();
    const innerHtml = match[2]!;
    const fullHtml = match[0]!;
    const text = stripHtml(innerHtml);
    if (!text) continue;

    let headingLevel: number | null = null;
    if (tag.startsWith("h")) {
      headingLevel = parseInt(tag.slice(1), 10);
    }

    elements.push({ text, html: fullHtml, headingLevel });
  }

  return elements;
}

const MAX_CHUNK_SIZE = 1200;
const OVERLAP_CHARS = 120;

export function splitLargeText(text: string): string[] {
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

interface Section {
  heading: DocxElement | null;
  elements: DocxElement[];
}

/**
 * Build sections from DOCX elements.
 * A section starts at a heading and includes all body elements until the next
 * heading of the same or higher level (lower number).
 */
export function buildSections(elements: DocxElement[]): Section[] {
  if (elements.length === 0) return [];

  const sections: Section[] = [];
  let current: Section = { heading: null, elements: [] };
  let currentLevel = Infinity;

  for (const el of elements) {
    if (el.headingLevel !== null) {
      // Heading encountered
      if (current.elements.length > 0 || current.heading) {
        sections.push(current);
      }
      current = { heading: el, elements: [] };
      currentLevel = el.headingLevel;
    } else {
      // Body element
      if (current.heading === null && current.elements.length === 0) {
        // Content before first heading
        current = { heading: null, elements: [el] };
        currentLevel = Infinity;
      } else {
        current.elements.push(el);
      }
    }
  }

  if (current.elements.length > 0 || current.heading) {
    sections.push(current);
  }

  return sections;
}

function buildChunks(elements: DocxElement[]): TextChunk[] {
  const sections = buildSections(elements);
  const merged: { text: string; html: string }[] = [];

  function flushSection(section: Section): void {
    const allText = [
      section.heading?.text ?? "",
      ...section.elements.map((e) => e.text),
    ]
      .filter(Boolean)
      .join("\n");

    const allHtml = [
      section.heading?.html ?? "",
      ...section.elements.map((e) => e.html),
    ]
      .filter(Boolean)
      .join("\n");

    if (!allText) return;

    if (allText.length > MAX_CHUNK_SIZE) {
      // Split oversized section at sentence boundaries
      const parts = splitLargeText(allText);
      for (const part of parts) {
        merged.push({ text: part, html: `<p>${part}</p>` });
      }
    } else {
      merged.push({ text: allText, html: allHtml });
    }
  }

  for (const section of sections) {
    flushSection(section);
  }

  const chunks: TextChunk[] = merged.map((chunk, i) => {
    const id = `c${i + 1}`;
    return {
      id,
      text: chunk.text,
      html: `<div data-chunk-id="${id}">\n${chunk.html}\n</div>`,
    };
  });

  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]!;
    if (prev.text.length <= OVERLAP_CHARS) continue;
    const tail = prev.text.slice(-OVERLAP_CHARS);
    const lastNewline = tail.indexOf("\n");
    const overlap = lastNewline >= 0 ? tail.slice(lastNewline + 1) : tail;
    chunks[i] = {
      ...chunks[i]!,
      text: overlap + "\n" + chunks[i]!.text,
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

  const elements = extractElements(result.value);
  const chunks = buildChunks(elements);

  return {
    text: chunks.map((c) => c.text).join("\n"),
    chunks,
    ocrConfidence: 100,
    extractorUsed: "mammoth",
  };
}
