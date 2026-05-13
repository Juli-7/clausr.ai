"use client";

import { useState, useRef } from "react";

export interface WordBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightChunk {
  id: string;
  text: string;
  bbox?: WordBox;
  wordBoxes?: WordBox[];
  pageNumber?: number;
}

function SourceCitationBadge({
  refNumber,
  onClick,
}: {
  refNumber: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center transition-colors align-middle leading-none mx-0.5 px-1.5 py-0.5 text-xs font-medium rounded-sm cursor-pointer"
      style={{
        color: "var(--color-amber)",
        background: "var(--color-amber-bg)",
        border: "1px solid var(--color-amber-border)",
      }}
    >
      S{refNumber}
    </button>
  );
}

interface SourceCitationCardProps {
  refNumber: number;
  fileId?: string;
  filename: string;
  fileUrl?: string;
  extractedText: string;
  keyExcerpt: string;
  pageNumber?: number;
  fileType?: "image" | "pdf" | "docx" | "unknown";
  highlightChunk?: HighlightChunk;
}

function detectFileType(filename: string, fileType?: string): "image" | "pdf" | "docx" | "unknown" {
  if (fileType === "image" || fileType === "pdf" || fileType === "docx") return fileType;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return "unknown";
}

export function SourceCitationCard({
  refNumber,
  filename,
  fileUrl,
  extractedText,
  keyExcerpt,
  pageNumber,
  fileType: ft,
  highlightChunk,
}: SourceCitationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imgDisplaySize, setImgDisplaySize] = useState<{ w: number; h: number; offsetX: number; offsetY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileType = detectFileType(filename, ft);

  const displayExcerpt = highlightChunk?.text || keyExcerpt;

  // Compute highlight rects scaled to the rendered image within the container
  const highlightRects: WordBox[] = [];
  if (highlightChunk?.wordBoxes && imgDisplaySize && imgRef.current) {
    const naturalW = imgRef.current.naturalWidth;
    const naturalH = imgRef.current.naturalHeight;
    if (naturalW > 0 && naturalH > 0) {
      const scaleX = imgDisplaySize.w / naturalW;
      const scaleY = imgDisplaySize.h / naturalH;
      for (const wb of highlightChunk.wordBoxes) {
        highlightRects.push({
          x: wb.x * scaleX + imgDisplaySize.offsetX,
          y: wb.y * scaleY + imgDisplaySize.offsetY,
          width: wb.width * scaleX,
          height: wb.height * scaleY,
        });
      }
    }
  }

  return (
    <div style={{ margin: "12px 0" }}>
      <SourceCitationBadge refNumber={refNumber} onClick={() => setExpanded(!expanded)} />
      {expanded && (
        <div
          className="mt-3 rounded-lg overflow-hidden"
          style={{
            border: "1px solid var(--color-amber-border)",
            background: "var(--color-bg-card)",
          }}
        >
          <div
            className="flex items-center gap-2 px-3.5 py-2.5"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <span style={{ fontSize: 16 }}>{fileType === "image" ? "📷" : fileType === "pdf" ? "📄" : "📃"}</span>
            <span className="text-xs font-semibold flex-1" style={{ color: "var(--color-text-header)" }}>
              Source: {filename}
              {pageNumber ? ` (Page ${pageNumber})` : ""}
              {highlightChunk && ` — Chunk ${highlightChunk.id}`}
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="text-xs cursor-pointer bg-transparent border-none"
              style={{ color: "var(--color-text-muted)" }}
            >
              ✕ Dismiss
            </button>
          </div>
          <div className="flex gap-4 p-3.5">
            {/* Preview panel */}
            {fileType === "image" && fileUrl && !imageError && (
              <div style={{ flexShrink: 0 }}>
                <div
                  className="rounded-lg relative overflow-hidden flex items-center justify-center"
                  style={{
                    width: 180,
                    height: 130,
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-default)",
                  }}
                >
                  <img
                    ref={imgRef}
                    src={fileUrl}
                    alt={filename}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      const containerW = 180;
                      const containerH = 130;
                      const naturalW = img.naturalWidth;
                      const naturalH = img.naturalHeight;
                      const scale = Math.min(containerW / naturalW, containerH / naturalH);
                      const displayW = naturalW * scale;
                      const displayH = naturalH * scale;
                      setImgDisplaySize({
                        w: displayW,
                        h: displayH,
                        offsetX: (containerW - displayW) / 2,
                        offsetY: (containerH - displayH) / 2,
                      });
                    }}
                    onError={() => setImageError(true)}
                  />
                  {/* Highlight overlay rectangles */}
                  {highlightRects.length > 0 && (
                    <div className="absolute inset-0 pointer-events-none">
                      {highlightRects.map((rect, i) => (
                        <div
                          key={i}
                          className="absolute"
                          style={{
                            left: rect.x,
                            top: rect.y,
                            width: rect.width,
                            height: rect.height,
                            background: "rgba(255, 180, 50, 0.3)",
                            border: "1px solid rgba(255, 150, 30, 0.7)",
                            borderRadius: 2,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-center mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {filename} {highlightChunk && `— chunk ${highlightChunk.id}`}
                </div>
              </div>
            )}
            {(fileUrl && imageError) || (fileType === "image" && !fileUrl) ? (
              <div style={{ flexShrink: 0 }}>
                <div
                  className="rounded-lg flex flex-col items-center justify-center"
                  style={{
                    width: 180,
                    height: 130,
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-default)",
                    color: "var(--color-text-muted)",
                    fontSize: 12,
                  }}
                >
                  <span>{filename}</span>
                  <span>(preview unavailable)</span>
                </div>
              </div>
            ) : null}
            {(fileType === "pdf" || fileType === "docx" || fileType === "unknown") && (
              <div style={{ flexShrink: 0 }}>
                <div
                  className="rounded-lg flex flex-col items-center justify-center gap-1"
                  style={{
                    width: 180,
                    height: 100,
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-default)",
                    color: "var(--color-text-muted)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{fileType === "pdf" ? "📄" : "📃"}</span>
                  <span>{filename}</span>
                  {pageNumber && <span>(Page {pageNumber})</span>}
                  {highlightChunk?.pageNumber && <span>(Chunk p.{highlightChunk.pageNumber})</span>}
                  {fileUrl && (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline"
                      style={{ color: "var(--color-accent-blue)" }}
                    >
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            )}
            {/* Text panel */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>{highlightChunk ? "Cited excerpt" : "Key claim"}</Label>
              <div style={{ color: "var(--color-text-body)", fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
                {displayExcerpt || "—"}
              </div>
              <Label>Extracted text</Label>
              <div
                className="text-xs leading-relaxed p-2 rounded"
                style={{
                  color: "var(--color-text-muted)",
                  background: "var(--color-bg-dark)",
                  borderLeft: "2px solid var(--color-amber-border)",
                  whiteSpace: "pre-wrap",
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {extractedText || "No text extracted."}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] uppercase tracking-wider font-semibold mb-1"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </div>
  );
}
