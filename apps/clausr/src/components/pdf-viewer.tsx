"use client";

import { useRef, useState, useEffect } from "react";

interface Bbox {
  x: number; y: number; width: number; height: number;
}

interface PdfViewerProps {
  fileUrl: string;
  highlight?: { bbox: Bbox; pageNumber: number; pageWidth: number; pageHeight: number } | null;
  pageCount?: number;
}

/** Extracts file path from /api/files/{sessionId}/{filename} */
function pageUrl(fileUrl: string, pageNum: number): string {
  const m = fileUrl.match(/^\/api\/files\/([^/]+)\/(.+)$/);
  if (!m) return "";
  return `/api/files/${m[1]}/${m[2]}/render/${pageNum}`;
}

export function PdfViewer({ fileUrl, highlight, pageCount }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const numPages = pageCount ?? 1;

  const pages: number[] = [];
  for (let i = 1; i <= numPages; i++) pages.push(i);

  useEffect(() => {
    if (highlightRef.current && containerRef.current) {
      highlightRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlight?.pageNumber, highlight?.bbox?.x, highlight?.bbox?.y]);

  return (
    <div ref={containerRef} className="rounded-lg relative overflow-y-auto" style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", height: "100%", minHeight: 200 }}>
      {pages.map((pageNum) => (
        <PageImg
          key={pageNum}
          src={pageUrl(fileUrl, pageNum)}
          pageNum={pageNum}
          isHighlight={highlight?.pageNumber === pageNum}
          highlightBbox={
            highlight?.pageNumber === pageNum && highlight.bbox && highlight.pageWidth && highlight.pageHeight
              ? { bbox: highlight.bbox, pageWidth: highlight.pageWidth, pageHeight: highlight.pageHeight }
              : null
          }
          highlightRef={pageNum === highlight?.pageNumber ? highlightRef : undefined}
        />
      ))}
    </div>
  );
}

function PageImg({
  src, pageNum, isHighlight, highlightBbox, highlightRef,
}: {
  src: string; pageNum: number; isHighlight: boolean;
  highlightBbox: { bbox: Bbox; pageWidth: number; pageHeight: number } | null;
  highlightRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  const highlightRects: React.CSSProperties[] = [];
  if (isHighlight && highlightBbox && imgSize) {
    const sx = imgSize.w / highlightBbox.pageWidth;
    const sy = imgSize.h / highlightBbox.pageHeight;
    highlightRects.push({
      position: "absolute",
      left: highlightBbox.bbox.x * sx,
      top: highlightBbox.bbox.y * sy,
      width: highlightBbox.bbox.width * sx,
      height: highlightBbox.bbox.height * sy,
      background: "rgba(255, 180, 50, 0.08)",
      border: "2px solid rgba(255, 150, 30, 0.5)",
      borderRadius: 2,
      pointerEvents: "none",
    });
  }

  return (
    <div ref={highlightRef} className="relative" style={{ width: "100%" }}>
      <img
        src={src}
        alt={`Page ${pageNum}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onLoad={(e) => {
          const img = e.currentTarget;
          setImgSize({ w: img.clientWidth, h: img.clientHeight });
        }}
      />
      {isHighlight && highlightRects.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {highlightRects.map((style, i) => <div key={i} style={style} />)}
        </div>
      )}
    </div>
  );
}
