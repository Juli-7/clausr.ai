export interface WordBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChunkInfo {
  id: string;
  text: string;
  html?: string;
  pageNumber?: number;
  bbox?: WordBox;
  wordBoxes?: WordBox[];
  pageWidth?: number;
  pageHeight?: number;
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

export interface ProcessFileResult {
  extractedText: string;
  chunks: ChunkInfo[];
  pageCount?: number;
  ocrConfidence?: number;
  extractorUsed?: string;
}

export interface IDocStore {
  processFile(
    file: { name: string; size: number; type: string; dataUrl?: string },
    sessionId: string
  ): Promise<ProcessFileResult>;

  getFiles(sessionId: string): Promise<ProcessedFile[]>;

  addEvidenceFile(sessionId: string, entry: ProcessedFile): Promise<void>;
}
