import { describe, it, expect } from "vitest";
import { getLineStyle, isListItem, isTableRow } from "../user-info/extractors/pdf-extract";
import { splitLargeText } from "../user-info/extractors/docx-extract";
import { expandFtsQueries } from "../pipeline/slices/file-registry";
import type { PdfTextItem } from "../user-info/extractors/pdf-extract";
import type { WordBox } from "../user-info/extractors";

function makePdfItem(str: string, fontSize = 12, fontName = "NotoSans-Regular"): PdfTextItem {
  return {
    str,
    transform: [fontSize, 0, 0, fontSize, 0, 0],
    width: str.length * fontSize * 0.5,
    height: fontSize,
    fontName,
  };
}

describe("getLineStyle", () => {
  it("classifies body text as bucket 2", () => {
    const style = getLineStyle([makePdfItem("normal body text", 12)]);
    expect(style.bucket).toBe(2);
    expect(style.isBold).toBe(false);
  });

  it("classifies small text as bucket 0", () => {
    expect(getLineStyle([makePdfItem("fine print", 7)]).bucket).toBe(0);
  });

  it("classifies heading-sized text as bucket 4", () => {
    expect(getLineStyle([makePdfItem("Section Title", 22)]).bucket).toBe(4);
  });

  it("detects bold font", () => {
    const style = getLineStyle([makePdfItem("Important Heading", 16, "NotoSans-Bold")]);
    expect(style.isBold).toBe(true);
  });

  it("detects heavy font name", () => {
    const style = getLineStyle([makePdfItem("Warning", 14, "NotoSans-Heavy")]);
    expect(style.isBold).toBe(true);
  });

  it("detects demi-bold font name", () => {
    const style = getLineStyle([makePdfItem("Subheading", 13, "NotoSans-Demi")]);
    expect(style.isBold).toBe(true);
  });

  it("averages font size across line items", () => {
    const items = [
      makePdfItem("Small ", 8),
      makePdfItem("BIG", 18),
    ];
    const style = getLineStyle(items);
    expect(style.bucket).toBeGreaterThanOrEqual(2);
  });

  it("handles empty items gracefully", () => {
    const style = getLineStyle([makePdfItem("", 12)]);
    expect(style.bucket).toBe(2);
    expect(style.isBold).toBe(false);
  });

  it("handles empty line", () => {
    const style = getLineStyle([]);
    expect(style.bucket).toBe(2);
    expect(style.isBold).toBe(false);
  });
});

describe("isListItem", () => {
  it("detects dash list markers", () => {
    expect(isListItem("- item")).toBe(true);
    expect(isListItem("  - indented")).toBe(true);
  });

  it("detects bullet markers", () => {
    expect(isListItem("• item")).toBe(true);
    expect(isListItem("  • indented bullet")).toBe(true);
  });

  it("detects numbered list markers", () => {
    expect(isListItem("1. first")).toBe(true);
    expect(isListItem("  99) numbered")).toBe(true);
  });

  it("rejects plain text", () => {
    expect(isListItem("This is a normal paragraph")).toBe(false);
  });

  it("rejects empty text", () => {
    expect(isListItem("")).toBe(false);
  });
});

describe("isTableRow", () => {
  function wordBox(x: number, w: number): WordBox {
    return { x, y: 0, width: w, height: 10 };
  }

  it("detects column-like rows with uneven gaps", () => {
    const words = [wordBox(10, 20), wordBox(35, 20), wordBox(100, 20), wordBox(125, 20)];
    // gaps: 5, 45, 5 → avg 18.3 → large gap 45 > 36.6 → true
    expect(isTableRow(words, "")).toBe(true);
  });

  it("rejects single-word rows", () => {
    expect(isTableRow([wordBox(10, 30)], "")).toBe(false);
  });

  it("rejects two-word rows", () => {
    expect(isTableRow([wordBox(10, 30), wordBox(50, 25)], "")).toBe(false);
  });

  it("rejects normal paragraph words (tight spacing)", () => {
    const words = [wordBox(10, 30), wordBox(42, 25), wordBox(72, 20)];
    expect(isTableRow(words, "")).toBe(false);
  });

  it("handles empty word list", () => {
    expect(isTableRow([], "")).toBe(false);
  });
});

describe("splitLargeText", () => {
  it("returns single chunk for short text", () => {
    const result = splitLargeText("Short paragraph.");
    expect(result).toEqual(["Short paragraph."]);
  });

  it("splits text exceeding MAX_CHUNK_SIZE at sentence boundaries", () => {
    const longText = "A. ".repeat(500);
    const result = splitLargeText(longText);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(1250);
    }
  });

  it("handles single-sentence overflow", () => {
    const hugeSentence = "word ".repeat(500);
    const result = splitLargeText(hugeSentence);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty text", () => {
    expect(splitLargeText("")).toEqual([]);
  });
});

describe("expandFtsQueries", () => {
  it("preserves original query as first variant", () => {
    const queries = expandFtsQueries("compliance report");
    expect(queries[0]).toBe("compliance report");
  });

  it("generates prefix AND variant", () => {
    const queries = expandFtsQueries("environmental impact");
    expect(queries).toContain("environmental* impact*");
  });

  it("generates prefix OR variant as fallback", () => {
    const queries = expandFtsQueries("safety check");
    expect(queries).toContain("safety* OR check*");
  });

  it("filters out short words (< 3 chars)", () => {
    const queries = expandFtsQueries("at or compliance report");
    for (const q of queries) {
      expect(q).not.toMatch(/\b(at|or)\*/);
    }
  });

  it("filters FTS5 reserved words from variants", () => {
    const queries = expandFtsQueries("and not OR near");
    expect(queries.length).toBe(1);
  });

  it("strips special chars for variants", () => {
    const queries = expandFtsQueries('"exact phrase" test');
    const variantWords = queries.slice(1).join(" ");
    expect(variantWords).not.toContain('"');
  });

  it("handles empty query", () => {
    expect(expandFtsQueries("")).toEqual([""]);
  });

  it("handles whitespace-only query", () => {
    expect(expandFtsQueries("   ")).toEqual(["   "]);
  });

  it("handles single-word query", () => {
    const queries = expandFtsQueries("compliance");
    expect(queries[0]).toBe("compliance");
    expect(queries[1]).toBe("compliance*");
  });
});
