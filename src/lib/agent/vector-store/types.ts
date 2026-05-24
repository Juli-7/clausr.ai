export interface ChunkInfo {
  id: string;
  text: string;
  pageNumber?: number;
}

export interface ProcessedFile {
  fileId: string;
  filename: string;
  extractedText: string;
  chunks: ChunkInfo[];
  dataUrl?: string;
  pageCount?: number;
  ocrConfidence?: number;
  extractorUsed?: string;
}

export interface IDocStore {
  processFile(
    file: { name: string; size: number; type: string; dataUrl?: string },
    sessionId: string
  ): Promise<{ extractedText: string }>;

  getFiles(sessionId: string): Promise<ProcessedFile[]>;
}
