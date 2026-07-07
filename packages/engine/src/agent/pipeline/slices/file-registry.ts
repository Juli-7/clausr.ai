import type { TextChunk } from "../../user-info/extractors";
import type { SourcePaletteEntry } from "../pipeline-context";
import { searchChunksFts5 } from "../../shared/memory/repository";
import { logPipeline } from "../logger";

export interface UploadedFileEntry {
  fileId: string;
  filename: string;
  extractedText: string;
  chunks?: TextChunk[];
  dataUrl?: string;
  pageCount?: number;
  ocrConfidence?: number;
  extractorUsed?: string;
}

export class FileRegistry {
  private files: UploadedFileEntry[] = [];

  addFile(file: UploadedFileEntry): void {
    this.files.push(file);
  }

  loadFiles(
    entries: { fileId: string; filename: string; extractedText: string; chunks?: TextChunk[]; dataUrl?: string; pageCount?: number; ocrConfidence?: number; extractorUsed?: string }[]
  ): void {
    this.files = entries.map((e) => ({
      fileId: e.fileId,
      filename: e.filename,
      extractedText: e.extractedText,
      chunks: e.chunks,
      dataUrl: e.dataUrl,
      pageCount: e.pageCount,
      ocrConfidence: e.ocrConfidence,
      extractorUsed: e.extractorUsed,
    }));
  }

  getFiles(): readonly UploadedFileEntry[] {
    return this.files;
  }

  hasFiles(): boolean {
    return this.files.length > 0;
  }

  getSourcePalette(): SourcePaletteEntry[] {
    return this.files.flatMap((f, i) => {
      const fileNum = i + 1;
      const chunks = f.chunks ?? [];
      if (chunks.length === 0) {
        return [{
          id: `S${fileNum}`,
          fileId: f.fileId,
          filename: f.filename,
          extractedText: f.extractedText,
          keyExcerpt: f.extractedText.slice(0, 200),
          dataUrl: f.dataUrl,
          pageNumber: f.pageCount,
          pageCount: f.pageCount,
        }];
      }
      return chunks.map(c => ({
        id: `S${fileNum}.${c.id}`,
        fileId: f.fileId,
        filename: f.filename,
        extractedText: f.extractedText,
        keyExcerpt: c.text,
        chunks: [c],
        dataUrl: f.dataUrl,
        pageNumber: c.pageNumber ?? f.pageCount,
        pageCount: f.pageCount,
      }));
    });
  }

  /**
   * Build context summary string for LLM prompts showing uploaded file content
   * with chunk annotations.
   */
  buildContextSummary(): string {
    if (this.files.length === 0) return "";

    const fileBlocks = this.files.map((f, i) => {
      const sourceRef = `S${i + 1}`;
      if (f.chunks && f.chunks.length > 0 && f.chunks.some((c) => c.text.length > 0)) {
        const chunkLines = f.chunks.map((c) => `[${sourceRef}.${c.id}] ${c.text}`);
        return `[File ${i + 1}: ${f.filename}]\n${chunkLines.join("\n")}`;
      }
      return `[File ${i + 1}: ${f.filename}]\n${f.extractedText}`;
    });

    return `Uploaded Files:\n${fileBlocks.join("\n\n")}`;
  }

  /**
   * Search chunks relevant to `query` using FTS5 full-text search.
   * Runs multiple query variants (original, prefix-expanded, OR-fallback)
   * and unions the results for better recall.
   * Falls back to all chunks if nothing matches.
   */
  searchRelevantChunks(sessionId: string, query: string, topK = 5): string {
    if (this.files.length === 0) {
      logPipeline(`[FILE-REGISTRY] searchRelevantChunks: files.length=0 — returning ""`);
      return "";
    }

    const queries = expandFtsQueries(query);
    logPipeline(`[FILE-REGISTRY] searchRelevantChunks: files=${this.files.length} query="${query}" queries=${JSON.stringify(queries)}`);

    const seen = new Set<string>();
    const allResults: { fileId: string; chunkIdx: number; text: string; rank: number }[] = [];

    for (const q of queries) {
      const ftsResults = searchChunksFts5(sessionId, q, topK * 2);
      logPipeline(`[FILE-REGISTRY] FTS5 query="${q}" returned ${ftsResults.length} result(s)`);
      for (const r of ftsResults) {
        const key = `${r.fileId}_${r.chunkIdx}`;
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(r);
        }
      }
    }

    allResults.sort((a, b) => a.rank - b.rank);
    const results = allResults.slice(0, topK);
    logPipeline(`[FILE-REGISTRY] after dedup+sort: ${allResults.length} unique result(s), top ${topK}: ${results.length} result(s)`);
    if (results.length === 0) {
      logPipeline(`[FILE-REGISTRY] FTS5 returned 0 results — falling back to buildContextSummary()`);
      const fallback = this.buildContextSummary();
      logPipeline(`[FILE-REGISTRY] fallback buildContextSummary() returned ${fallback.length} chars`);
      return fallback;
    }

    const fileMap = new Map(this.files.map((f, i) => [f.fileId, i]));

    const grouped = new Map<number, { idx: number; text: string }[]>();
    for (const r of results) {
      const fileIdx = fileMap.get(r.fileId);
      if (fileIdx === undefined) continue;
      if (!grouped.has(fileIdx)) grouped.set(fileIdx, []);
      grouped.get(fileIdx)!.push({ idx: r.chunkIdx, text: r.text });
    }

    const fileBlocks: string[] = [];
    for (const [fileIdx, chunkResults] of grouped) {
      const f = this.files[fileIdx]!;
      const sourceRef = `S${fileIdx + 1}`;
      const lines = chunkResults.map((c) => `[${sourceRef}.c${c.idx}] ${c.text}`);
      fileBlocks.push(`[File ${fileIdx + 1}: ${f.filename}]\n${lines.join("\n")}`);
    }

    return `Uploaded Files:\n${fileBlocks.join("\n\n")}`;
  }

  toJSON(): UploadedFileEntry[] {
    return this.files.map(f => ({ ...f }));
  }

  static fromJSON(data: UploadedFileEntry[]): FileRegistry {
    const registry = new FileRegistry();
    for (const f of data) registry.addFile(f);
    return registry;
  }

}

function isCjkChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0x2E80 && code <= 0x2EFF) ||
    (code >= 0x3000 && code <= 0x303F) ||
    (code >= 0xFF00 && code <= 0xFFEF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFE30 && code <= 0xFE4F)
  );
}

function hasCjk(text: string): boolean {
  return [...text].some((c) => isCjkChar(c));
}

export function expandFtsQueries(query: string): string[] {
  if (!query.trim()) return [query];

  const queries = [query];

  // Split into words (ignore quoted phrases, operators, special chars)
  const words = query
    .toLowerCase()
    .replace(/["^~*(){}[\]\\]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .filter((w) => (w.length > 2 || hasCjk(w)) && !/^(and|or|not|near)$/i.test(w));

  if (words.length === 0) return queries;

  // Separate CJK words from Latin words.
  // FTS5's unicode61 tokenizer indexes each CJK character as an individual
  // token, so multi-character CJK prefix terms match nothing.
  // Expand CJK words into individual characters for matching.
  const cjkWords = words.filter((w) => hasCjk(w));
  const latinWords = words.filter((w) => !hasCjk(w));
  const cjkChars = [...new Set(cjkWords.flatMap((w) => [...w].filter((c) => isCjkChar(c))))];

  const expandedTerms = [
    ...cjkChars,
    ...latinWords.map((w) => `${w}*`),
  ];

  if (expandedTerms.length > 0) {
    // Variant: all expanded terms AND'd (more restrictive)
    const prefixAnd = expandedTerms.join(" ");
    if (prefixAnd !== query) queries.push(prefixAnd);

    // Variant: all expanded terms OR'd (recall fallback)
    const prefixOr = expandedTerms.join(" OR ");
    if (prefixOr !== prefixAnd) queries.push(prefixOr);
  }

  return queries;
}
