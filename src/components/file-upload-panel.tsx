"use client";

import { useRef } from "react";
import type { ChatRequestFile } from "@/lib/agent/shared/schemas";

interface FileUploadPanelProps {
  attachedFiles: ChatRequestFile[];
  filesLoading: boolean;
  setupDone: boolean;
  setupLoading: boolean;
  skillName: string;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (name: string) => void;
  onSetup: () => void;
  onFormatSize: (bytes: number) => string;
}

export function FileUploadPanel({
  attachedFiles,
  filesLoading,
  setupDone,
  setupLoading,
  skillName,
  onFileSelect,
  onRemoveFile,
  onSetup,
  onFormatSize,
}: FileUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSetup = (attachedFiles.length > 0 || !!skillName) && !setupLoading;

  const dropzoneBorderColor = setupDone
    ? "var(--color-border-default)"
    : "var(--color-border-input)";

  return (
    <div
      className="shrink-0 flex flex-col border-r border-border-default"
      style={{ width: 280, background: "var(--color-bg-card)" }}
    >
      {/* Header */}
      <div className="h-12 shrink-0 flex items-center px-5 border-b border-border-default">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Sources
        </span>
        <span className="ml-auto" style={{ color: "var(--color-text-dim)", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
          {attachedFiles.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-y-auto">
        {/* Upload zone */}
        <div
          onClick={() => !setupDone && fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer transition-all duration-150"
          style={{
            minHeight: 90,
            border: `1.5px dashed ${dropzoneBorderColor}`,
            background: setupDone ? "transparent" : "var(--color-bg-dark)",
            opacity: setupDone ? 0.45 : 1,
          }}
        >
          <span className="text-lg" style={{ color: "var(--color-text-muted)" }}>
            {setupDone ? "✓" : "+"}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {setupDone ? "Files locked" : "Add documents"}
          </span>
          {!setupDone && (
            <span className="text-2xs" style={{ color: "var(--color-text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
              PDF, DOCX, XLSX, PNG
            </span>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.docx"
          onChange={onFileSelect}
          style={{ display: "none" }}
        />

        {/* Loading indicator */}
        {filesLoading && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs"
            style={{
              background: "var(--color-amber-bg)",
              border: "1px solid var(--color-amber-border)",
              color: "var(--color-amber)",
            }}
          >
            <span className="animate-pulse">⏳</span>
            Reading files...
          </div>
        )}

        {/* File list */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span
              className="text-2xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              {attachedFiles.length} file{attachedFiles.length !== 1 ? "s" : ""}
            </span>
            {attachedFiles.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2 px-3 py-2 rounded text-xs"
                style={{
                  background: "var(--color-bg-dark)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                <span className="shrink-0" style={{ color: "var(--color-text-muted)" }}>
                  {f.type.startsWith("image/")
                    ? "🖼"
                    : f.type.includes("pdf")
                      ? "📄"
                      : "📝"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ color: "var(--color-text-body)" }}>
                    {f.name}
                  </div>
                  <div style={{ color: "var(--color-text-muted)" }}>
                    {onFormatSize(f.size)}
                  </div>
                </div>
                {!setupDone && (
                  <button
                    onClick={() => onRemoveFile(f.name)}
                    className="cursor-pointer bg-transparent border-none text-xs shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    ✕
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
            <span>⚡</span>
            <span className="truncate">{skillName}</span>
          </div>
        )}
      </div>

      {/* Setup button */}
      <div className="shrink-0 px-4 pb-4">
        <button
          onClick={canSetup ? onSetup : undefined}
          disabled={!canSetup}
          className="w-full h-10 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 disabled:cursor-not-allowed"
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
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-input)",
                    color: "var(--color-text-muted)",
                  }
          }
        >
          {setupLoading
            ? "Setting up..."
            : setupDone
              ? "✓ Ready"
              : "Set up"}
        </button>
      </div>
    </div>
  );
}
