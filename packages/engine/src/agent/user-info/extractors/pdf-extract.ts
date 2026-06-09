import { extractImageText } from "./ocr";
import { mergeWordBoxes, type TextChunk, type WordBox } from "./index";

export interface PdfResult {
  text: string;
  pageCount: number;
  chunks: TextChunk[];
  ocrConfidence: number;
  extractorUsed: string;
  pageImages?: string[];
}

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

interface PositionedTextItem {
  item: PdfTextItem;
  box: WordBox;
}

const SOFT_MAX_CHARS = 800;
const HARD_MAX_CHARS = 1200;
const MAX_CHUNK_LINES = 8;

function itemToWordBoxes(item: PdfTextItem, pageHeight: number): WordBox[] {
  if (!item.transform || item.transform.length < 6) return [];

  const text = item.str ?? "";
  if (text.trim().length === 0) return [];

  const x = item.transform[4];
  const pdfY = item.transform[5];
  if (x == null || pdfY == null) return [];

  const width = item.width ?? 0;
  const height = item.height || Math.abs(item.transform[3]!) || 12;
  const y = pageHeight - pdfY - height;
  const trimmedStart = text.search(/\S/);
  if (trimmedStart === -1) return [];

  const words = [...text.matchAll(/\S+/g)];
  if (words.length === 0) return [];

  const charWidth = width > 0 ? width / text.length : 0;
  return words.map((match) => {
    const start = match.index ?? trimmedStart;
    const word = match[0];
    return {
      x: x + start * charWidth,
      y,
      width: Math.max(word.length * charWidth, 1),
      height,
    };
  });
}

function itemToWordBox(item: PdfTextItem, pageHeight: number): WordBox | null {
  const boxes = itemToWordBoxes(item, pageHeight);
  return boxes.length > 0 ? mergeWordBoxes(boxes) : null;
}

// ── Multi-column detection (#5) ──

/**
 * Detect column boundaries by finding large horizontal gaps between item clusters.
 * Returns an array of boundary X positions (sorted ascending).
 */
export function detectColumnBoundaries(items: PdfTextItem[], pageWidth: number): number[] {
  if (items.length < 6) return [];
  const centers = items
    .map((i) => i.transform[4]! + (i.width ?? 0) / 2)
    .filter((x) => x > 0 && x < pageWidth)
    .sort((a, b) => a - b);

  if (centers.length < 6) return [];

  const gaps: { index: number; gap: number }[] = [];
  for (let i = 1; i < centers.length; i++) {
    gaps.push({ index: i, gap: centers[i]! - centers[i - 1]! });
  }

  // Find gaps that are significant (> 18% of page width)
  const threshold = pageWidth * 0.18;
  const significant = gaps.filter((g) => g.gap > threshold);
  if (significant.length === 0) return [];

  // Return boundary positions (midpoint of each significant gap)
  return significant
    .map((g) => (centers[g.index - 1]! + centers[g.index]!) / 2)
    .sort((a, b) => a - b);
}

/**
 * Reorder items for correct multi-column reading order.
 * Items are assigned to columns, then each column is read top-to-bottom.
 */
export function fixColumnOrder(items: PdfTextItem[], pageWidth: number): PdfTextItem[] {
  const boundaries = detectColumnBoundaries(items, pageWidth);
  if (boundaries.length === 0) return items;

  // Assign each item to a column
  const columns: PdfTextItem[][] = Array.from({ length: boundaries.length + 1 }, () => []);
  for (const item of items) {
    const center = item.transform[4]! + (item.width ?? 0) / 2;
    let col = 0;
    for (const b of boundaries) {
      if (center > b) col++;
      else break;
    }
    columns[col]!.push(item);
  }

  // Sort each column by Y (top-to-bottom), then concatenate columns left-to-right
  const result: PdfTextItem[] = [];
  for (const col of columns) {
    col.sort((a, b) => a.transform[5]! - b.transform[5]! || a.transform[4]! - b.transform[4]!);
    result.push(...col);
  }
  return result;
}

// ── Line grouping ──

function groupItemsIntoLines(items: PdfTextItem[], pageHeight: number): PdfTextItem[][] {
  const withPos = items
    .filter((i) => (i.str ?? "").trim().length > 0)
    .map((i) => ({ item: i, box: itemToWordBox(i, pageHeight) }))
    .filter((x): x is PositionedTextItem => x.box !== null)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  if (withPos.length === 0) return [];

  const positionedLines: PositionedTextItem[][] = [[withPos[0]!]];
  for (let i = 1; i < withPos.length; i++) {
    const prevBox = withPos[i - 1]!.box;
    const currBox = withPos[i]!.box;
    const tolerance = Math.max(prevBox.height, currBox.height) * 0.75;
    if (Math.abs(currBox.y - prevBox.y) <= tolerance) {
      positionedLines[positionedLines.length - 1]!.push(withPos[i]!);
    } else {
      positionedLines.push([withPos[i]!]);
    }
  }

  return positionedLines.map((line) =>
    line.sort((a, b) => a.box.x - b.box.x).map((entry) => entry.item)
  );
}

function lineToChunkInput(
  line: PdfTextItem[],
  pageHeight: number
): { text: string; bbox: WordBox; wordBoxes: WordBox[] } | null {
  const wordBoxes: WordBox[] = [];
  const texts: string[] = [];

  for (const item of line) {
    const boxes = itemToWordBoxes(item, pageHeight);
    if (boxes.length > 0) {
      wordBoxes.push(...boxes);
      texts.push((item.str ?? "").trim());
    }
  }

  if (wordBoxes.length === 0) return null;

  return {
    text: texts.join(" ").replace(/\s+/g, " ").trim(),
    bbox: mergeWordBoxes(wordBoxes),
    wordBoxes,
  };
}

// ── Style detection ──

export interface LineStyle {
  bucket: number;
  isBold: boolean;
}

export function getLineStyle(line: PdfTextItem[]): LineStyle {
  let totalLen = 0;
  let weightedSize = 0;
  let boldCount = 0;
  for (const item of line) {
    const len = (item.str ?? "").length;
    if (len === 0) continue;
    totalLen += len;
    weightedSize += Math.abs(item.transform[0] ?? 12) * len;
    if (/bold|black|heavy|demi/i.test(item.fontName ?? "")) boldCount++;
  }
  const avgSize = totalLen > 0 ? weightedSize / totalLen : 12;
  const bucket = avgSize < 8 ? 0 : avgSize < 11 ? 1 : avgSize < 14 ? 2 : avgSize < 18 ? 3 : 4;
  return { bucket, isBold: boldCount > line.length / 2 };
}

export function isListItem(text: string): boolean {
  return /^\s*[-*•]\s/.test(text) || /^\s*\d+[.)]\s/.test(text);
}

export function isTableRow(words: WordBox[], _text: string): boolean {
  if (words.length < 3) return false;
  const gaps: number[] = [];
  for (let i = 1; i < words.length; i++) {
    gaps.push(words[i]!.x - (words[i - 1]!.x + words[i - 1]!.width));
  }
  if (gaps.length < 2) return false;
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const largeGaps = gaps.filter((g) => g > avgGap * 2).length;
  return largeGaps >= 1;
}

// ── Header / footer removal (#4) ──

interface StructuredLine {
  items: PdfTextItem[];
  pageNum: number;
  pageWidth: number;
  pageHeight: number;
  style: LineStyle;
  text: string;
  bbox: WordBox;
  wordBoxes: WordBox[];
  normalizedY: number; // 0 = top, 1 = bottom
}

function normalizeHeaderFooterText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Detect repeating header/footer lines across pages and remove them.
 * A line is considered header/footer if it appears in the top/bottom 12%
 * of pages on ≥3 pages with ≥50% page coverage.
 */
export function removeHeadersFooters(lines: StructuredLine[]): StructuredLine[] {
  if (lines.length === 0) return lines;

  const pageCount = new Set(lines.map((l) => l.pageNum)).size;
  if (pageCount < 3) return lines;

  const firstLinesPerPage = new Map<number, StructuredLine>();
  const lastLinesPerPage = new Map<number, StructuredLine>();

  // Group lines by page
  const byPage = new Map<number, StructuredLine[]>();
  for (const line of lines) {
    const arr = byPage.get(line.pageNum) ?? [];
    arr.push(line);
    byPage.set(line.pageNum, arr);
  }

  for (const [pageNum, pageLines] of byPage) {
    if (pageLines.length === 0) continue;
    // Sort by Y (top to bottom)
    pageLines.sort((a, b) => a.normalizedY - b.normalizedY);
    firstLinesPerPage.set(pageNum, pageLines[0]!);
    lastLinesPerPage.set(pageNum, pageLines[pageLines.length - 1]!);
  }

  // Count occurrences of normalized first/last line text
  const firstCounts = new Map<string, number>();
  const lastCounts = new Map<string, number>();

  for (const line of firstLinesPerPage.values()) {
    const norm = normalizeHeaderFooterText(line.text);
    if (!norm) continue;
    firstCounts.set(norm, (firstCounts.get(norm) ?? 0) + 1);
  }

  for (const line of lastLinesPerPage.values()) {
    const norm = normalizeHeaderFooterText(line.text);
    if (!norm) continue;
    lastCounts.set(norm, (lastCounts.get(norm) ?? 0) + 1);
  }

  const minOccurrences = Math.max(3, Math.floor(pageCount * 0.5));
  const headerTexts = new Set(
    [...firstCounts.entries()].filter(([, c]) => c >= minOccurrences).map(([t]) => t)
  );
  const footerTexts = new Set(
    [...lastCounts.entries()].filter(([, c]) => c >= minOccurrences).map(([t]) => t)
  );

  // Also filter by position: header must be in top 12%, footer in bottom 12%
  return lines.filter((line) => {
    const norm = normalizeHeaderFooterText(line.text);
    if (!norm) return true;

    const isFirstOnPage = firstLinesPerPage.get(line.pageNum)?.text === line.text;
    const isLastOnPage = lastLinesPerPage.get(line.pageNum)?.text === line.text;

    if (isFirstOnPage && line.normalizedY < 0.12 && headerTexts.has(norm)) return false;
    if (isLastOnPage && line.normalizedY > 0.88 && footerTexts.has(norm)) return false;

    return true;
  });
}

// ── Heading hierarchy + section-based chunking (#2) ──

interface Section {
  heading: StructuredLine | null;
  lines: StructuredLine[];
}

/**
 * Build document sections based on heading hierarchy.
 * A section starts at a heading and includes all content until the next
 * heading of the same or higher level.
 */
export function buildSections(lines: StructuredLine[]): Section[] {
  if (lines.length === 0) return [];

  // Determine heading levels from font size distribution
  const bucketCounts = new Map<number, number>();
  for (const line of lines) {
    bucketCounts.set(line.style.bucket, (bucketCounts.get(line.style.bucket) ?? 0) + 1);
  }

  // Most common bucket = body text
  const sortedBuckets = [...bucketCounts.entries()].sort((a, b) => b[1] - a[1]);
  const bodyBucket = sortedBuckets[0]?.[0] ?? 2;

  // Heading level: larger font = higher level (lower number = higher priority)
  function getHeadingLevel(style: LineStyle): number | null {
    if (style.bucket > bodyBucket) {
      // Larger than body = heading. bucket 4 = level 1, bucket 3 = level 2, etc.
      return 4 - style.bucket + 1;
    }
    if (style.bucket === bodyBucket && style.isBold) {
      // Bold body text = sub-heading
      return 3;
    }
    return null;
  }

  const sections: Section[] = [];
  let current: Section = { heading: null, lines: [] };
  let currentLevel = Infinity;

  for (const line of lines) {
    const level = getHeadingLevel(line.style);

    if (level !== null) {
      // This is a heading
      if (current.lines.length > 0 || current.heading) {
        sections.push(current);
      }
      current = { heading: line, lines: [] };
      currentLevel = level;
    } else {
      // Content line
      if (current.heading === null && current.lines.length === 0) {
        // Content before first heading — create an implicit section
        current = { heading: null, lines: [line] };
        currentLevel = Infinity;
      } else {
        current.lines.push(line);
      }
    }
  }

  if (current.lines.length > 0 || current.heading) {
    sections.push(current);
  }

  return sections;
}

function makeChunkFromLines(lines: StructuredLine[]): TextChunk {
  const pageNum = lines[0]!.pageNum;
  const pageWidth = lines[0]!.pageWidth;
  const pageHeight = lines[0]!.pageHeight;
  const text = lines.map((l) => l.text).join("\n");
  const wordBoxes = lines.flatMap((l) => l.wordBoxes);
  const bbox = mergeWordBoxes(lines.map((l) => l.bbox));
  return { id: "", text, bbox, wordBoxes, pageNumber: pageNum, pageWidth, pageHeight };
}

/**
 * Split lines at page boundaries, then sub-split if still over HARD_MAX_CHARS.
 * Each resulting chunk has its own pageNumber and bbox derived from its lines.
 */
function splitLinesIntoChunks(lines: StructuredLine[]): TextChunk[] {
  // Group consecutive lines by page number
  const pageGroups: StructuredLine[][] = [];
  for (const line of lines) {
    const last = pageGroups[pageGroups.length - 1];
    if (last && last[0]!.pageNum === line.pageNum) {
      last.push(line);
    } else {
      pageGroups.push([line]);
    }
  }

  const result: TextChunk[] = [];
  for (const group of pageGroups) {
    const groupText = group.map((l) => l.text).join("\n");
    if (groupText.length <= HARD_MAX_CHARS) {
      result.push(makeChunkFromLines(group));
    } else {
      // Sub-split: walk lines, accumulating until hitting the hard limit
      let currentLines: StructuredLine[] = [];
      let currentLen = 0;
      for (const line of group) {
        const addLen = (currentLines.length > 0 ? 1 : 0) + line.text.length;
        if (currentLen + addLen > HARD_MAX_CHARS && currentLines.length > 0) {
          result.push(makeChunkFromLines(currentLines));
          currentLines = [line];
          currentLen = line.text.length;
        } else {
          currentLines.push(line);
          currentLen += addLen;
        }
      }
      if (currentLines.length > 0) {
        result.push(makeChunkFromLines(currentLines));
      }
    }
  }
  return result;
}

export function sectionsToChunks(sections: Section[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const section of sections) {
    const lines = section.heading ? [section.heading, ...section.lines] : section.lines;
    if (lines.length === 0) continue;

    const allText = lines.map((l) => l.text).join("\n");

    if (allText.length <= SOFT_MAX_CHARS) {
      chunks.push(makeChunkFromLines(lines));
      continue;
    }

    const subChunks = splitLinesIntoChunks(lines);
    chunks.push(...subChunks);
  }

  return chunks;
}

// ── Chunk finalization ──

const OVERLAP_CHARS = 120;

function applyOverlap(chunks: TextChunk[]): TextChunk[] {
  if (chunks.length <= 1) return chunks;
  const result: TextChunk[] = [chunks[0]!];
  for (let i = 1; i < chunks.length; i++) {
    const prev = result[i - 1]!;
    const curr = chunks[i]!;
    if (prev.text.length <= OVERLAP_CHARS) {
      result.push(curr);
      continue;
    }
    const tail = prev.text.slice(-OVERLAP_CHARS);
    const lastNewline = tail.indexOf("\n");
    const overlap = lastNewline >= 0 ? tail.slice(lastNewline + 1) : tail;
    result.push({
      ...curr,
      text: overlap + "\n" + curr.text,
    });
  }
  return result;
}

function finalizeChunks(chunks: TextChunk[]): TextChunk[] {
  const withIds = chunks.map((chunk, index) => {
    const id = `c${index + 1}`;
    let html = chunk.html;
    if (html) {
      html = html.replace(/data-chunk-id="[^"]*"/, `data-chunk-id="${id}"`);
    } else {
      html = `<div data-chunk-id="${id}"><p>${chunk.text.replace(/\n/g, "<br>")}</p></div>`;
    }
    return { ...chunk, id, html };
  });
  return applyOverlap(withIds);
}

// ── Quality gate ──

function isAcceptableNativeText(text: string): boolean {
  if (text.length < 50) return false;

  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 5) return text.length > 200;

  const commonShort = new Set([
    "a", "i",
    "am", "an", "as", "at", "be", "by", "do", "go", "he", "hi",
    "if", "in", "is", "it", "me", "my", "no", "of", "on", "or",
    "so", "to", "up", "us", "we",
    "ad", "ce", "co", "dd", "de", "dr", "ec", "eg", "el", "en",
    "eu", "ex", "gb", "id", "ie", "inc", "la", "le", "lo", "ltd",
    "ma", "mr", "ms", "mx", "mrs", "ok", "pc", "pp", "st", "tv",
    "uk", "us", "vs",
  ]);

  let suspicious = 0;
  let valid = 0;

  for (const token of tokens) {
    const w = token.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (w.length === 0) continue;
    valid++;
    if (w.length <= 2 && /[a-zA-Z]/.test(w) && !commonShort.has(w.toLowerCase())) {
      suspicious++;
    }
  }

  if (valid === 0) return false;
  const ratio = suspicious / valid;
  console.log(`[pdf-extract] native text quality: ${suspicious}/${valid} suspicious (ratio=${ratio.toFixed(3)})`);
  return ratio < 0.35;
}

// ── Main extraction ──

const PDF_MAGIC = /^%PDF/;

export async function extractPdfText(dataUrl: string): Promise<PdfResult> {
  // Dynamic imports: pdfjs-dist requires DOMMatrix (browser API) which
  // isn't available in Node.js. Load lazily so this module can be imported
  // without crashing in production builds.
  const pdfjsMod = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-expect-error — pdf.worker.mjs has no type declarations
  const pdfjsWorkerMod = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  // Node.js 24 structuredClone({ transfer }) is broken — pdfjs-dist's LoopbackPort
  // depends on it. Monkeypatch: copy instead of transfer (safe for in-process worker).
  // MUST run before any pdfjs getDocument() call.
  const __origStructuredClone = globalThis.structuredClone;
  globalThis.structuredClone = ((value: unknown, options?: Parameters<typeof globalThis.structuredClone>[1]) => {
    if (options?.transfer) return __origStructuredClone(value);
    return __origStructuredClone(value, options);
  }) as typeof globalThis.structuredClone;
  (globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorkerMod;
  const { PDFParse } = await import("pdf-parse");
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const buffer = Buffer.from(base64, "base64");

  if (!PDF_MAGIC.test(buffer.slice(0, 4).toString("ascii"))) {
    return {
      text: "[PDF processing failed: file does not start with %PDF header]",
      pageCount: 0,
      chunks: [],
      ocrConfidence: 0,
      extractorUsed: "error",
    };
  }

  const data = new Uint8Array(buffer);

  // Path A: Positioned text extraction via pdfjs-dist
  let pdfjsDoc: any | null = null;
  try {
    const loadingTask = pdfjsMod.getDocument({ data });
    pdfjsDoc = await loadingTask.promise;
    const pageCount = pdfjsDoc.numPages;

    let totalChars = 0;
    const allStructuredLines: StructuredLine[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdfjsDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const items = textContent.items as PdfTextItem[];

      for (const item of items) {
        totalChars += (item.str ?? "").length;
      }

      // Multi-column: reorder items before line grouping
      const reordered = fixColumnOrder(items, viewport.width);
      const lines = groupItemsIntoLines(reordered, viewport.height);

      for (const lineItems of lines) {
        const lineChunk = lineToChunkInput(lineItems, viewport.height);
        if (!lineChunk) continue;
        const style = getLineStyle(lineItems);
        allStructuredLines.push({
          items: lineItems,
          pageNum: i,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          style,
          text: lineChunk.text,
          bbox: lineChunk.bbox,
          wordBoxes: lineChunk.wordBoxes,
          normalizedY: lineChunk.bbox.y / viewport.height,
        });
      }

      page.cleanup();
    }

    if (totalChars > 50) {
      const filteredLines = removeHeadersFooters(allStructuredLines);
      const sections = buildSections(filteredLines);
      const rawChunks = sectionsToChunks(sections);
      const chunks = finalizeChunks(rawChunks);
      const fullText = chunks.map((c) => c.text).join("\n\n");

      if (isAcceptableNativeText(fullText)) {
        let pageImages: string[] | undefined;
        let screenshots: any | undefined;
        try {
          const parser = new PDFParse({ data });
          screenshots = await parser.getScreenshot({ imageDataUrl: true, imageBuffer: false });
          await parser.destroy();
          pageImages = [];
          for (const s of screenshots.pages) {
            pageImages[s.pageNumber] = s.dataUrl!;
          }
        } catch (e) {
          console.warn(`[pdf-extract] Could not generate page screenshots:`, e);
        }

        // OCR any pages where pdfjs found no native text
        const chunkPageNums = new Set(chunks.map((c) => c.pageNumber));
        const missingPages: number[] = [];
        for (let p = 1; p <= pageCount; p++) {
          if (!chunkPageNums.has(p)) missingPages.push(p);
        }

        if (missingPages.length > 0 && screenshots?.pages.length) {
          console.log(`[pdf-extract] ${missingPages.length}/${pageCount} pages lack native text. OCRing them.`);
          const ocrChunks: TextChunk[] = [];

          for (const screenshot of screenshots.pages) {
            if (!missingPages.includes(screenshot.pageNumber)) continue;
            if (!screenshot.dataUrl) continue;

            try {
              const result = await extractImageText(screenshot.dataUrl);
              if (result && result.text.trim().length > 0) {
                for (const chunk of result.chunks) {
                  ocrChunks.push({
                    ...chunk,
                    id: "",
                    pageNumber: screenshot.pageNumber,
                    pageWidth: screenshot.width ?? 0,
                    pageHeight: screenshot.height ?? 0,
                  });
                }
              }
            } catch (err) {
              console.warn(`[pdf-extract] OCR failed for page ${screenshot.pageNumber}:`, err);
            }
          }

          if (ocrChunks.length > 0) {
            const finalizedOcr = finalizeChunks(ocrChunks);
            const allChunks = [...chunks, ...finalizedOcr];
            const combinedText = allChunks.map((c) => c.text).join("\n\n");
            return {
              text: combinedText,
              pageCount,
              chunks: allChunks,
              ocrConfidence: 100,
              extractorUsed: "pdfjs-dist+ocr",
              pageImages,
            };
          }
        }

        return {
          text: fullText,
          pageCount,
          chunks,
          ocrConfidence: 100,
          extractorUsed: "pdfjs-dist",
          pageImages,
        };
      }

      console.warn(`[pdf-extract] Native text quality too low (${fullText.length} chars). Falling back to OCR.`);
    }
  } catch (err) {
    console.warn(`[pdf-extract] pdfjs-dist extraction failed:`, err);
  } finally {
    pdfjsDoc?.destroy();
  }

  // Path B: Scanned PDF — OCR fallback
  try {
    const parser = new PDFParse({ data });
    const screenshots = await parser.getScreenshot({
      imageDataUrl: true,
      imageBuffer: false,
    });
    await parser.destroy();

    const pageCount = screenshots.total;
    const allChunks: TextChunk[] = [];
    const pageSizes = new Map<number, { width: number; height: number }>();
    let totalConfidence = 0;
    let pageWithText = 0;

    for (const screenshot of screenshots.pages) {
      if (typeof screenshot.width === "number" && typeof screenshot.height === "number") {
        pageSizes.set(screenshot.pageNumber, { width: screenshot.width, height: screenshot.height });
      }
    }

    const validScreenshots = screenshots.pages.filter((s) => s.dataUrl);

    const pageImages: string[] = [];
    for (const s of validScreenshots) {
      pageImages[s.pageNumber] = s.dataUrl!;
    }

    const ocrResults = await Promise.all(
      validScreenshots.map((screenshot) =>
        extractImageText(screenshot.dataUrl!).then(
          (result) => ({ screenshot, result, error: null }),
          (error) => ({ screenshot, result: null, error })
        )
      )
    );

    for (const { screenshot, result, error } of ocrResults) {
      if (error) {
        console.warn(`[pdf-extract] OCR failed for page ${screenshot.pageNumber}:`, error);
        continue;
      }
      if (!result || result.text.trim().length === 0) continue;

      totalConfidence += result.ocrConfidence ?? 0;
      pageWithText++;

      const pageSize = pageSizes.get(screenshot.pageNumber);
      for (const chunk of result.chunks) {
        allChunks.push({
          ...chunk,
          id: "",
          pageNumber: screenshot.pageNumber,
          pageWidth: pageSize?.width,
          pageHeight: pageSize?.height,
        });
      }
    }

    const chunks = finalizeChunks(allChunks);
    const fullText = chunks.map((c) => c.text).join("\n\n");
    const avgConfidence = pageWithText > 0 ? totalConfidence / pageWithText : 0;

    if (fullText.length > 0) {
      return {
        text: fullText,
        pageCount,
        chunks,
        ocrConfidence: avgConfidence,
        extractorUsed: "tesseract",
        pageImages,
      };
    }

    return {
      text: `[This PDF contains no extractable text (${pageCount} pages). OCR processing returned no results.]`,
      pageCount,
      chunks: [],
      ocrConfidence: 0,
      extractorUsed: "fallback",
      pageImages,
    };
  } catch (err) {
    console.error(`[pdf-extract] OCR fallback failed:`, err);
    return {
      text: `[PDF processing failed: ${err instanceof Error ? err.message : "unknown error"}]`,
      pageCount: 0,
      chunks: [],
      ocrConfidence: 0,
      extractorUsed: "error",
    };
  }
}
