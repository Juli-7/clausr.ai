"use client";

import { useRef, useState, useCallback } from "react";
import type { ChatRequestFile } from "@clausr/engine/types";

interface FileUploadPanelProps {
  attachedFiles: ChatRequestFile[];
  filesLoading: boolean;
  setupDone: boolean;
  setupLoading: boolean;
  skillName: string;
  sessionId?: string;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (name: string) => void;
  onSetup: () => void;
  onFormatSize: (bytes: number) => string;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
        <path d="M21 15l-5-5-5 5-4-4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (type.includes("pdf")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 15h6M9 12h6M9 18h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (type.includes("sheet") || type.includes("xlsx") || type.includes("xls") || type.includes("spreadsheet")) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 13l8 6M16 13l-8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

export function FileUploadPanel({
  attachedFiles,
  filesLoading,
  setupDone,
  setupLoading,
  skillName,
  sessionId,
  onFileSelect,
  onRemoveFile,
  onSetup,
  onFormatSize,
}: FileUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSetup = (attachedFiles.length > 0 || !!skillName) && !setupLoading;
  const [previewFile, setPreviewFile] = useState<ChatRequestFile | null>(null);

  function getFileUrl(f: ChatRequestFile): string | undefined {
    if (sessionId && f.type?.includes("pdf")) return `/api/files/${sessionId}/${encodeURIComponent(f.name)}`;
    if (f.dataUrl) return f.dataUrl;
    if (sessionId) return `/api/files/${sessionId}/${encodeURIComponent(f.name)}`;
    return undefined;
  }

  const handleDownload = useCallback((f: ChatRequestFile, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getFileUrl(f);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [sessionId]);

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{ width: 280, background: "var(--color-bg-card)" }}
    >
      {/* Header */}
      <div className="h-12 shrink-0 flex items-center px-5" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Sources
        </span>
        {attachedFiles.length > 0 && (
          <span className="ml-auto text-2xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)", fontFamily: "'JetBrains Mono', monospace" }}>
            {attachedFiles.length}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-y-auto">

        {/* Upload zone (before setup) */}
        {!setupDone && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg cursor-pointer transition-all duration-150"
              style={{
                minHeight: 80,
                border: "1.5px dashed var(--color-border-input)",
                background: "var(--color-bg-primary)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-text-muted)" }}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Add documents</span>
              <span className="text-2xs" style={{ color: "var(--color-text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
                PDF, DOCX, XLSX, PNG
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.docx"
              onChange={onFileSelect}
              style={{ display: "none" }}
            />
          </>
        )}

        {/* Loading indicator */}
        {filesLoading && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs"
            style={{
              background: "var(--color-amber-bg)",
              border: "1px solid var(--color-amber-border)",
              color: "var(--color-amber)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-amber)", animation: "pulse-dot 1.2s ease infinite" }} />
            Reading files...
          </div>
        )}

        {/* File list */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-col gap-1">
            <span
              className="text-2xs font-semibold uppercase tracking-wider px-0.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              {attachedFiles.length} file{attachedFiles.length !== 1 ? "s" : ""}
            </span>
            {attachedFiles.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors duration-150 cursor-pointer"
                style={{
                  background: "var(--color-bg-primary)",
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-body)",
                }}
                onClick={() => getFileUrl(f) && setPreviewFile(f)}
              >
                <span className="shrink-0" style={{ color: getFileUrl(f) ? "var(--color-accent-blue)" : "var(--color-text-muted)" }}>
                  <FileIcon type={f.type} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{f.name}</div>
                  <div style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                    {onFormatSize(f.size)}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDownload(f, e)}
                  className="cursor-pointer bg-transparent border-none shrink-0 rounded p-0.5 transition-colors duration-150 hover:opacity-70"
                  style={{ color: "var(--color-text-muted)" }}
                  title="Download file"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 14h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </button>
                {!setupDone && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveFile(f.name); }}
                    className="cursor-pointer bg-transparent border-none shrink-0 rounded p-0.5 transition-colors duration-150"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Skill indicator */}
        {skillName && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs"
            style={{
              background: "var(--color-accent-blue-bg)",
              border: "1px solid var(--color-accent-blue-bg)",
              color: "var(--color-accent-blue)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 6h4M6 8h4M6 10h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M8 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span className="truncate">{skillName}</span>
          </div>
        )}
      </div>

      {/* Setup button */}
      <div className="shrink-0 px-4 pb-4">
        <button
          onClick={canSetup ? onSetup : undefined}
          disabled={!canSetup}
          className="w-full h-9 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:cursor-not-allowed"
          style={
            setupDone
              ? {
                  background: "transparent",
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-muted)",
                }
              : canSetup
                ? {
                    background: "var(--color-accent-blue)",
                    border: "1px solid var(--color-accent-blue)",
                    color: "#fff",
                  }
                : {
                    background: "var(--color-bg-primary)",
                    border: "1px solid var(--color-border-input)",
                    color: "var(--color-text-muted)",
                  }
          }
        >
          {setupLoading
            ? "Setting up..."
            : setupDone
              ? "Ready"
              : "Set up"}
        </button>
      </div>

      {/* Preview modal */}
      {previewFile && (() => {
        const previewUrl = getFileUrl(previewFile);
        if (!previewUrl) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setPreviewFile(null)}
          >
            <div
              className="relative max-w-[90vw] max-h-[90vh] rounded-lg overflow-hidden flex flex-col"
              style={{ background: "var(--color-bg-card)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between shrink-0 px-4 h-10" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <span className="text-xs truncate" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {previewFile.name}
                </span>
                <button
                  className="w-6 h-6 flex items-center justify-center rounded cursor-pointer shrink-0"
                  style={{ color: "var(--color-text-muted)" }}
                  onClick={() => setPreviewFile(null)}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              {previewFile.type.startsWith("image/") ? (
                <img
                  src={previewUrl}
                  alt={previewFile.name}
                  className="max-w-[85vw] max-h-[80vh] object-contain p-4"
                />
              ) : previewFile.type.includes("pdf") ? (
                <embed
                  src={previewUrl}
                  type="application/pdf"
                  className="w-[85vw] h-[80vh]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 px-8 py-16" style={{ minHeight: 200 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-text-muted)" }}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm" style={{ color: "var(--color-text-body)" }}>Preview not available for this file type</span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                    Download the file to view its contents
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Animations */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
