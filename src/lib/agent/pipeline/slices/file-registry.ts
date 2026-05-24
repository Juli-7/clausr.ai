import type { TextChunk } from "@/lib/agent/user-info/extractors";
import type { SourcePaletteEntry } from "../pipeline-context";

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
