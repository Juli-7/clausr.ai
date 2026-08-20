"use client";

import { useState, useEffect } from "react";

interface FilePreviewModalProps {
  file: { name: string; size: string; time: string; downloadUrl?: string } | null;
  onClose: () => void;
}

type PreviewState = "loading" | "ready" | "error";

function getFileType(name: string): "image" | "pdf" | "docx" | "sheet" | "other" {
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return "image";
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(docx?)$/i.test(name)) return "docx";
  if (/\.(xlsx?|csv)$/i.test(name)) return "sheet";
  return "other";
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("ready");
  const [srcUrl, setSrcUrl] = useState<string | null>(null);

  // Fetch file content on-demand from downloadUrl, create object URL for preview
  useEffect(() => {
    if (!file?.downloadUrl) return;
    const type = getFileType(file.name);
    const isLocalBlob = file.downloadUrl.startsWith("blob:");
    if (type === "docx" && !isLocalBlob) {
      setPreviewState("loading");
      fetch(file.downloadUrl + "/html")
        .then((r) => {
          if (!r.ok) throw new Error("Preview failed");
          return r.text();
        })
        .then((html) => {
          // Extract body content from full HTML response
          const match = html.match(/<body>([\s\S]*)<\/body>/i);
          setDocxHtml(match?.[1] ?? html);
          setPreviewState("ready");
        })
        .catch(() => setPreviewState("error"));
    } else {
      // Image/PDF — use download URL directly
      setSrcUrl(file.downloadUrl);
    }
  }, [file?.downloadUrl, file?.name]);

  if (!file) return null;

  const fileType = getFileType(file.name);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)", padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--color-bg-card)", borderRadius: 8, width: "100%", maxWidth: 720, maxHeight: "90vh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <div className="flex-1 min-w-0">
            <div className="truncate font-semibold" style={{ fontSize: 13, color: "var(--color-text-header)" }}>
              {file.name}
            </div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
              {file.size} · {file.time}
            </div>
          </div>
          <button
            className="flex items-center justify-center border-none rounded-full cursor-pointer"
            style={{ width: 24, height: 24, background: "transparent", color: "var(--color-text-muted)", fontSize: 16, lineHeight: 1 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!srcUrl && fileType !== "docx" && fileType !== "other" ? (
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Loading preview...</span>
          ) : fileType === "image" && srcUrl ? (
            <img src={srcUrl} alt={file.name} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 4 }} />
          ) : fileType === "pdf" && srcUrl ? (
            <iframe src={srcUrl} style={{ width: "100%", height: "70vh", border: "none", borderRadius: 4 }} title={file.name} />
          ) : fileType === "docx" ? (
            previewState === "loading" ? (
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Loading preview...</span>
            ) : previewState === "error" || !docxHtml ? (
              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Preview not available for this file.</span>
            ) : (
              <div style={{ width: "100%", fontSize: 12, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: docxHtml }} />
            )
          ) : (
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Preview not available for this file type.</span>
          )}
        </div>
      </div>
    </div>
  );
}
