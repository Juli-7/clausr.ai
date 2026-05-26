"use client";

import React, { useState, useRef } from "react";

export interface WordBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightChunk {
  id: string;
  text: string;
  html?: string;
  bbox?: WordBox;
  wordBoxes?: WordBox[];
  pageNumber?: number;
  pageWidth?: number;
  pageHeight?: number;
}

function SourceCitationBadge({
  refNumber,
  onClick,
}: {
  refNumber: string;
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
      {refNumber}
    </button>
  );
}

interface SourceCitationCardProps {
  refNumber: string;
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

function fileUrlToPageUrl(fileUrl: string, pageNumber: number): string {
  const base = fileUrl.replace(/\/+$/, "");
  return `${base}/page/${pageNumber}`;
}

function applyScale(boxes: WordBox[], sx: number, sy: number): WordBox[] {
  return boxes.map((b) => ({
    x: b.x * sx,
    y: b.y * sy,
    width: b.width * sx,
    height: b.height * sy,
  }));
}

function computeDisplaySize(
  naturalW: number,
  naturalH: number,
  containerW: number,
  containerH: number,
): { w: number; h: number; offsetX: number; offsetY: number } {
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  return {
    w: naturalW * scale,
    h: naturalH * scale,
    offsetX: (containerW - naturalW * scale) / 2,
    offsetY: (containerH - naturalH * scale) / 2,
  };
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
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileType = detectFileType(filename, ft);

  const displayExcerpt = highlightChunk?.text || keyExcerpt;

  // Compute highlight rects scaled to the rendered image within the container
  const highlightRects: WordBox[] = [];
  if (highlightChunk?.wordBoxes && imgDisplaySize) {
    const refWidth = highlightChunk.pageWidth ?? naturalSize?.w ?? 0;
    const refHeight = highlightChunk.pageHeight ?? naturalSize?.h ?? 0;
    if (refWidth > 0 && refHeight > 0) {
      const sx = imgDisplaySize.w / refWidth;
      const sy = imgDisplaySize.h / refHeight;
      const offsetRects = applyScale(highlightChunk.wordBoxes, sx, sy);
      for (const r of offsetRects) {
        highlightRects.push({
          x: r.x + imgDisplaySize.offsetX,
          y: r.y + imgDisplaySize.offsetY,
          width: r.width,
          height: r.height,
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
              {highlightChunk ? ` — Chunk ${highlightChunk.id}` : ""}
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
            {/* Preview panel — HTML content (format-agnostic) */}
            {highlightChunk?.html ? (
              <PreviewHtmlContent html={highlightChunk.html} chunkId={highlightChunk.id} filename={filename} />
            ) : fileType === "image" && fileUrl && !imageError ? (
              <PreviewImage
                ref={imgRef}
                src={fileUrl}
                alt={filename}
                onLoad={(naturalW, naturalH) => {
                  setNaturalSize({ w: naturalW, h: naturalH });
                  setImgDisplaySize(computeDisplaySize(naturalW, naturalH, 180, 130));
                }}
                onError={() => setImageError(true)}
                highlightRects={highlightRects}
              />
            ) : fileType === "image" && ((fileUrl && imageError) || !fileUrl) ? (
              <PreviewUnavailable filename={filename} />
            ) : (fileType === "pdf") && highlightChunk?.pageNumber && fileUrl ? (
              <PdfPreviewPage
                pageUrl={fileUrlToPageUrl(fileUrl, highlightChunk.pageNumber)}
                filename={filename}
                highlightChunk={highlightChunk}
                ref={imgRef}
                onDisplaySizeChange={setImgDisplaySize}
              />
            ) : (fileType === "pdf") && !highlightChunk?.pageNumber ? (
              <PreviewFallback filename={filename} pageNumber={pageNumber} fileUrl={fileUrl} />
            ) : (
              <PreviewFallback filename={filename} pageNumber={pageNumber} fileUrl={fileUrl} />
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

const PreviewImage = React.forwardRef<
  HTMLImageElement,
  {
    src: string;
    alt: string;
    onLoad: (naturalW: number, naturalH: number) => void;
    onError: () => void;
    highlightRects: WordBox[];
  }
>(function PreviewImage({ src, alt, onLoad, onError, highlightRects }, ref) {
  const containerW = 180;
  const containerH = 130;

  return (
    <div style={{ flexShrink: 0 }}>
      <div
        className="rounded-lg relative overflow-hidden flex items-center justify-center"
        style={{
          width: containerW,
          height: containerH,
          background: "var(--color-bg-dark)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <img
          ref={ref}
          src={src}
          alt={alt}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          onLoad={(e) => {
            const img = e.currentTarget;
            onLoad(img.naturalWidth, img.naturalHeight);
          }}
          onError={onError}
        />
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
      <div className="text-2xs text-center mt-1" style={{ color: "var(--color-text-muted)" }}>
        {alt} {highlightRects.length > 0 ? "— highlighted" : ""}
      </div>
    </div>
  );
});

const PdfPreviewPage = React.forwardRef<
  HTMLImageElement,
  {
    pageUrl: string;
    filename: string;
    highlightChunk: HighlightChunk;
    onDisplaySizeChange: (size: { w: number; h: number; offsetX: number; offsetY: number }) => void;
  }
>(function PdfPreviewPage({ pageUrl, filename, highlightChunk, onDisplaySizeChange }, ref) {
  const [loadError, setLoadError] = useState(false);
  const containerW = 180;
  const containerH = 130;

  // pageWidth/pageHeight = reference coordinate space used during extraction
  const refWidth = highlightChunk.pageWidth ?? 0;
  const refHeight = highlightChunk.pageHeight ?? 0;

  const highlightRects: WordBox[] = [];
  if (highlightChunk.wordBoxes && refWidth > 0 && refHeight > 0) {
    const sx = containerW / refWidth;
    const sy = containerH / refHeight;
    for (const wb of highlightChunk.wordBoxes) {
      highlightRects.push({
        x: wb.x * sx,
        y: wb.y * sy,
        width: wb.width * sx,
        height: wb.height * sy,
      });
    }
  }

  return (
    <div style={{ flexShrink: 0 }}>
      <div
        className="rounded-lg relative overflow-hidden flex items-center justify-center"
        style={{
          width: containerW,
          height: containerH,
          background: "var(--color-bg-dark)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        {loadError ? (
          <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Page unavailable</span>
        ) : (
          <img
            ref={ref}
            src={pageUrl}
            alt={`${filename} page ${highlightChunk.pageNumber}`}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            onLoad={() => {
              onDisplaySizeChange({
                w: containerW,
                h: containerH,
                offsetX: 0,
                offsetY: 0,
              });
            }}
            onError={() => setLoadError(true)}
          />
        )}
        {highlightRects.length > 0 && !loadError && (
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
      <div className="text-2xs text-center mt-1" style={{ color: "var(--color-text-muted)" }}>
        {filename} — page {highlightChunk.pageNumber}
        {highlightRects.length > 0 ? " (highlighted)" : ""}
      </div>
    </div>
  );
});

function PreviewHtmlContent({
  html,
  chunkId,
  filename,
}: {
  html: string;
  chunkId: string;
  filename: string;
}) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div
        className="rounded-lg overflow-auto p-2.5"
        style={{
          width: 180,
          height: 130,
          background: "var(--color-bg-dark)",
          border: "1px solid var(--color-border-default)",
          fontSize: 11,
          lineHeight: 1.4,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="text-2xs text-center mt-1" style={{ color: "var(--color-text-muted)" }}>
        {filename} &mdash; {chunkId}
      </div>
      <style>{`
        [data-chunk-id="${chunkId}"] {
          background: rgba(255, 180, 50, 0.3);
          border-left: 3px solid rgba(255, 150, 30, 0.8);
          padding-left: 4px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}

function PreviewUnavailable({ filename }: { filename: string }) {
  return (
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
  );
}

function PreviewFallback({ filename, pageNumber, fileUrl }: { filename: string; pageNumber?: number; fileUrl?: string }) {
  return (
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
        <span style={{ fontSize: 24 }}>📄</span>
        <span>{filename}</span>
        {pageNumber && <span>(Page {pageNumber})</span>}
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
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-2xs uppercase tracking-wider font-semibold mb-1"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </div>
  );
}
