import { describe, it, expect } from "vitest";
import { getLineStyle } from "../user-info/extractors/pdf-extract";
import { splitLargeText } from "../user-info/extractors/docx-extract";
import { expandFtsQueries } from "../pipeline/slices/file-registry";
import type { PdfTextItem } from "../user-info/extractors/pdf-extract";

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
