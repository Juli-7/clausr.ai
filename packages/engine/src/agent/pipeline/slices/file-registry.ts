import type { TextChunk } from "../../user-info/extractors";
import type { SourcePaletteEntry } from "../pipeline-context";
import { searchChunksFts5 } from "../../shared/memory/repository";

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
      if (f.chunks && f.chunks.length > 0) {
        const chunkLines = f.chunks.map((c) => `[${sourceRef}.${c.id}] ${c.text}`);
        return `[File ${i + 1}: ${f.filename}]\n${chunkLines.join("\n")}`;
      }
      return `[File ${i + 1}: ${f.filename}]\n${f.extractedText}`;
    });

    return `Uploaded Files:\n${fileBlocks.join("\n\n")}`;
  }

  /**
   * Search chunks relevant to `query` using FTS5 full-text search.
   * Falls back to all chunks if FTS5 is unavailable or returns nothing.
   */
  searchRelevantChunks(sessionId: string, query: string, topK = 10): string {
    if (this.files.length === 0) return "";

    const results = searchChunksFts5(sessionId, query, topK);
    if (results.length === 0) return this.buildContextSummary();

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
      const f = this.files[fileIdx];
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

  averageOcrConfidence(): number {
    const withOcr = this.files.filter((f) => f.ocrConfidence !== undefined);
    if (withOcr.length === 0) return 100;
    return withOcr.reduce((s, f) => s + (f.ocrConfidence ?? 100), 0) / withOcr.length;
  }
}
