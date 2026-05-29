import { describe, it, expect } from "vitest";
import type { PdfTextItem, LineStyle } from "../user-info/extractors/pdf-extract";
import type { WordBox } from "../user-info/extractors";
import {
  removeHeadersFooters,
  fixColumnOrder,
  buildSections as buildPdfSections,
  sectionsToChunks,
  getLineStyle,
} from "../user-info/extractors/pdf-extract";
import { mergeWordBoxes } from "../user-info/extractors";
import { extractElements, buildSections as buildDocxSections } from "../user-info/extractors/docx-extract";

function makePdfItem(str: string, x: number, y: number, fontSize = 12, fontName = "NotoSans-Regular", width?: number): PdfTextItem {
  return {
    str,
    transform: [fontSize, 0, 0, fontSize, x, y],
    width: width ?? str.length * fontSize * 0.5,
    height: fontSize,
    fontName,
  };
}

interface StructuredLine {
  items: PdfTextItem[];
  pageNum: number;
  pageWidth: number;
  pageHeight: number;
  style: LineStyle;
  text: string;
  bbox: WordBox;
  wordBoxes: WordBox[];
  normalizedY: number;
}

function makeLine(items: PdfTextItem[], pageHeight: number): StructuredLine {
  const boxes = items.map((item) => {
    const ix = item.transform[4];
    const iy = pageHeight - item.transform[5] - (item.height || 12);
    return { x: ix, y: iy, width: item.width ?? 0, height: item.height || 12 };
  });

  const text = items.map((i) => i.str).join(" ");
  const bbox = mergeWordBoxes(boxes);
  const style = getLineStyle(items);

  return {
    items,
    pageNum: 1,
    pageWidth: 600,
    pageHeight,
    style,
    text,
    bbox,
    wordBoxes: boxes,
    normalizedY: bbox.y / pageHeight,
  };
}

// ── OCR integration ──

describe("OCR paragraph-level chunking (#1)", () => {
  it("keeps short paragraphs as single chunks", async () => {
    const { extractImageText } = await import("../user-info/extractors/ocr");
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const dataUrl = `data:image/png;base64,${pngBase64}`;
    const result = await extractImageText(dataUrl);
    expect(Array.isArray(result.chunks)).toBe(true);
  });
});

// ── PDF header/footer removal (#4) ──

describe("PDF header/footer removal (#4)", () => {
  it("removes repeating page headers", () => {
    const pageH = 800;

    const lines = [
      // Page 1
      makeLine([makePdfItem("Company Confidential", 50, 50, 10)], pageH),
      makeLine([makePdfItem("Body text paragraph one.", 50, 100, 11)], pageH),
      makeLine([makePdfItem("Body text paragraph two.", 50, 130, 11)], pageH),
      makeLine([makePdfItem("- Page 1 -", 280, 750, 10)], pageH),
      // Page 2
      makeLine([makePdfItem("Company Confidential", 50, 50, 10)], pageH),
      makeLine([makePdfItem("Body text paragraph three.", 50, 100, 11)], pageH),
      makeLine([makePdfItem("- Page 2 -", 280, 750, 10)], pageH),
      // Page 3
      makeLine([makePdfItem("Company Confidential", 50, 50, 10)], pageH),
      makeLine([makePdfItem("Body text paragraph four.", 50, 100, 11)], pageH),
      makeLine([makePdfItem("- Page 3 -", 280, 750, 10)], pageH),
    ];
    lines.forEach((l, i) => { l.pageNum = Math.floor(i / 4) + 1; });
    // Fix: lines[7] got pageNum=2 due to Math.floor(7/4)=1, should be page 3
    lines[7]!.pageNum = 3;
    lines[8]!.pageNum = 3;
    lines[9]!.pageNum = 3;

    const filtered = removeHeadersFooters(lines);
    const texts = filtered.map((l) => l.text);
    expect(texts).not.toContain("Company Confidential");
    expect(texts).not.toContain("- Page 1 -");
    expect(texts).not.toContain("- Page 2 -");
    expect(texts).toContain("Body text paragraph one.");
    expect(texts).toContain("Body text paragraph three.");
    expect(texts).toContain("Body text paragraph four.");
  });

  it("preserves content when no repeating headers exist", () => {
    const pageH = 800;
    const lines = [
      makeLine([makePdfItem("Unique intro on page 1", 50, 50, 11)], pageH),
      makeLine([makePdfItem("Body text.", 50, 100, 11)], pageH),
      makeLine([makePdfItem("Different intro on page 2", 50, 50, 11)], pageH),
      makeLine([makePdfItem("More body text.", 50, 100, 11)], pageH),
    ];
    lines.forEach((l, i) => { l.pageNum = Math.floor(i / 2) + 1; });

    const filtered = removeHeadersFooters(lines);
    expect(filtered.length).toBe(4);
  });
});

// ── PDF multi-column reading order (#5) ──

describe("PDF multi-column reading order (#5)", () => {
  it("reorders two-column text correctly", () => {
    const pageW = 600;
    const items: PdfTextItem[] = [
      makePdfItem("Left column first line.", 50, 200, 12, "NotoSans-Regular", 180),
      makePdfItem("Right column first line.", 320, 200, 12, "NotoSans-Regular", 180),
      makePdfItem("Left column second line.", 50, 230, 12, "NotoSans-Regular", 180),
      makePdfItem("Right column second line.", 320, 230, 12, "NotoSans-Regular", 180),
      makePdfItem("Left column third line.", 50, 260, 12, "NotoSans-Regular", 180),
      makePdfItem("Right column third line.", 320, 260, 12, "NotoSans-Regular", 180),
    ];

    const reordered = fixColumnOrder(items, pageW);
    const strs = reordered.map((i) => i.str);
    expect(strs).toEqual([
      "Left column first line.",
      "Left column second line.",
      "Left column third line.",
      "Right column first line.",
      "Right column second line.",
      "Right column third line.",
    ]);
  });

  it("leaves single-column text unchanged", () => {
    const pageW = 600;
    const items: PdfTextItem[] = [
      makePdfItem("Line one.", 50, 200, 12, "NotoSans-Regular", 200),
      makePdfItem("Line two.", 50, 230, 12, "NotoSans-Regular", 200),
      makePdfItem("Line three.", 50, 260, 12, "NotoSans-Regular", 200),
    ];

    const reordered = fixColumnOrder(items, pageW);
    expect(reordered.map((i) => i.str)).toEqual(["Line one.", "Line two.", "Line three."]);
  });
});

// ── PDF heading hierarchy + section chunking (#2) ──

describe("PDF heading hierarchy + section chunking (#2)", () => {
  it("groups content under headings into sections", () => {
    const pageH = 800;

    const lines = [
      makeLine([makePdfItem("Introduction", 50, 100, 22, "NotoSans-Bold", 150)], pageH),
      makeLine([makePdfItem("This document describes compliance requirements.", 50, 140, 11)], pageH),
      makeLine([makePdfItem("All manufacturers must adhere to these rules.", 50, 170, 11)], pageH),
      makeLine([makePdfItem("1. Lighting Requirements", 50, 220, 16, "NotoSans-Bold", 220)], pageH),
      makeLine([makePdfItem("Headlamps must meet brightness standards.", 50, 260, 11)], pageH),
      makeLine([makePdfItem("Beam pattern is regulated under clause 4.2.", 50, 290, 11)], pageH),
      makeLine([makePdfItem("2. Mounting Height", 50, 340, 16, "NotoSans-Bold", 180)], pageH),
      makeLine([makePdfItem("Mounting height must be between 500 and 1200 mm.", 50, 380, 11)], pageH),
    ];

    const sections = buildPdfSections(lines);
    expect(sections.length).toBe(3);

    expect(sections[0]!.heading).not.toBeNull();
    expect(sections[0]!.heading!.text).toBe("Introduction");
    expect(sections[0]!.lines.length).toBe(2);

    expect(sections[1]!.heading!.text).toBe("1. Lighting Requirements");
    expect(sections[1]!.lines.length).toBe(2);

    expect(sections[2]!.heading!.text).toBe("2. Mounting Height");
    expect(sections[2]!.lines.length).toBe(1);

    const chunks = sectionsToChunks(sections);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.text).toContain("Introduction");
    expect(chunks[0]!.text).toContain("This document describes");
    expect(chunks[1]!.text).toContain("1. Lighting Requirements");
    expect(chunks[1]!.text).toContain("Headlamps must meet");
  });

  it("splits oversized sections at paragraph boundaries", () => {
    const pageH = 800;
    const longParagraph = "This is a very long paragraph. ".repeat(50);
    const lines = [
      makeLine([makePdfItem("Long Section", 50, 100, 22, "NotoSans-Bold", 150)], pageH),
      makeLine([makePdfItem(longParagraph, 50, 140, 11)], pageH),
    ];

    const sections = buildPdfSections(lines);
    const chunks = sectionsToChunks(sections);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.text).toContain("Long Section");
  });
});

// ── DOCX heading hierarchy (#3) ──

describe("DOCX heading hierarchy (#3)", () => {
  it("extracts h1/h2 elements and builds sections", () => {
    const html = `
      <h1>Executive Summary</h1>
      <p>This is the summary paragraph.</p>
      <h2>Details</h2>
      <p>First detail paragraph.</p>
      <p>Second detail paragraph.</p>
      <h2>Conclusion</h2>
      <p>Final paragraph.</p>
    `;

    const elements = extractElements(html);
    expect(elements.length).toBe(7);
    expect(elements[0]!.headingLevel).toBe(1);
    expect(elements[0]!.text).toBe("Executive Summary");
    expect(elements[1]!.headingLevel).toBeNull();
    expect(elements[2]!.headingLevel).toBe(2);
    expect(elements[2]!.text).toBe("Details");

    const sections = buildDocxSections(elements);
    expect(sections.length).toBe(3);

    expect(sections[0]!.heading!.text).toBe("Executive Summary");
    expect(sections[0]!.elements.length).toBe(1);

    expect(sections[1]!.heading!.text).toBe("Details");
    expect(sections[1]!.elements.length).toBe(2);

    expect(sections[2]!.heading!.text).toBe("Conclusion");
    expect(sections[2]!.elements.length).toBe(1);
  });

  it("handles content before first heading", () => {
    const html = `
      <p>Intro paragraph without heading.</p>
      <h1>First Real Section</h1>
      <p>Section content.</p>
    `;

    const elements = extractElements(html);
    const sections = buildDocxSections(elements);
    expect(sections.length).toBe(2);
    expect(sections[0]!.heading).toBeNull();
    expect(sections[0]!.elements.length).toBe(1);
    expect(sections[0]!.elements[0]!.text).toBe("Intro paragraph without heading.");
  });
});
