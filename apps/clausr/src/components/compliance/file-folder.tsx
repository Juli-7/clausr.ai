"use client";

import { useState, useCallback } from "react";
import type { PackField } from "@clausr/engine";
import { FilePreviewModal } from "./file-preview-modal";
import { t } from "@/lib/compliance/i18n";

interface FileInfo {
  name: string;
  size: string;
  time: string;
  docType?: string;
  downloadUrl?: string;
}

export interface PackWithDocs {
  id: string;
  title: string;
  fields: PackField[];
  documents: { type: string; title: string; fields: string[] }[];
}

interface FileFolderProps {
  sessionId: string;
  uploadedFiles: FileInfo[];
  packs: PackWithDocs[];
  docData: Record<string, string>;
  mode: "auto" | "manual";
  onToolMessage?: (name: string, isHint?: boolean) => void;
  onAddChatMessage?: (text: string) => void;
  onSendText?: (text: string) => Promise<void>;
  onCallTool?: (name: string, input: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onFileUpload?: (file: File) => void;
}

export function FileFolder({ sessionId, uploadedFiles, packs, docData, mode, onToolMessage, onAddChatMessage, onSendText, onCallTool, onFileUpload }: FileFolderProps) {
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (mode === "auto") {
      onToolMessage?.("attach_file — disabled in auto mode", true);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    onFileUpload?.(file);
  }, [mode, onToolMessage, onFileUpload]);

  const handleRemoveFile = useCallback(async (name: string) => {
    await onCallTool?.("detach_file", { name });
  }, [onCallTool]);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "8px 0" }}>
      {/* Header */}
      <div className="font-semibold mb-3" style={{ fontSize: 12, color: "var(--color-text-header)", padding: "0 8px" }}>
        📁 {t("fileFolder")}
      </div>

      {/* Uploaded Files — consolidated */}
      <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", borderRadius: 8, margin: "0 4px 10px", overflow: "hidden" }}>
        <div className="flex items-center justify-between" style={{ padding: "6px 8px", borderBottom: "1px solid var(--color-border-default)" }}>
          <span className="font-semibold" style={{ fontSize: 10, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {t("uploadedFiles")} ({uploadedFiles.length})
          </span>
          <label
            className="text-xs border rounded-md cursor-pointer"
            style={{ padding: "2px 8px", fontSize: 9, border: "1px solid var(--color-border-default)", color: "var(--color-text-muted)", background: "var(--color-bg-card)" }}
          >
            + {t("upload")}
            <input type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={handleUpload} />
          </label>
        </div>

        {uploadedFiles.length === 0 ? (
          <div style={{ padding: "16px 8px", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
            No files yet. Upload a PDF, DOCX, or image, then click <strong>Extract & Fill</strong> to auto-fill the questionnaire.
          </div>
        ) : (
          <div>
            {uploadedFiles.map((f) => (
              <div key={f.name} className="flex items-center gap-2" style={{ padding: "4px 8px", fontSize: 10, color: "var(--color-text-body)", borderBottom: "1px solid var(--color-border-default)" }}>
                <span style={{ flexShrink: 0 }}>📎</span>
                <span
                  className="min-w-0 truncate flex-1"
                  style={{ cursor: "pointer", color: "var(--color-accent-blue)" }}
                  onClick={() => setPreviewFile(f)}
                >
                  {f.name}
                </span>
                <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>{f.size}</span>
                <button
                  className="border-none cursor-pointer"
                  style={{ color: "var(--color-danger)", background: "none", padding: 0, fontSize: 10, lineHeight: 1, flexShrink: 0 }}
                  onClick={() => handleRemoveFile(f.name)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: "6px 8px", borderTop: "1px solid var(--color-border-default)" }}>
          <button
            className="border-none rounded-md cursor-pointer font-medium w-full"
            style={{ padding: "5px 0", fontSize: 9, background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)", textAlign: "center" }}
            onClick={() => onSendText?.("Extract data from my uploaded files and fill in the document fields.")}
          >
            Extract & Fill
          </button>
        </div>
      </div>

      {/* Generated Documents per pack */}
      <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", borderRadius: 8, margin: "0 4px", overflow: "hidden" }}>
        <div className="font-semibold" style={{ fontSize: 10, color: "var(--color-text-header)", padding: "6px 8px", borderBottom: "1px solid var(--color-border-default)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
          {t("generatedDocuments")}
        </div>
        {packs.length === 0 ? (
          <div style={{ padding: "12px 8px", fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>
            No packs selected.
          </div>
        ) : (
          packs.map((pack) => (
            <div key={pack.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <div className="font-semibold truncate" style={{ fontSize: 9, color: "var(--color-text-header)", padding: "4px 8px", background: "var(--color-bg-dark)" }}>
                {pack.title}
              </div>
              {pack.documents.map((doc) => {
                const docFilled = doc.fields.filter((fid) => docData[fid]?.trim()).length;
                const docTotal = doc.fields.length;
                const allFilled = doc.type === "test-plan" || docFilled === docTotal;
                return (
                  <div key={doc.type} className="flex items-center gap-1" style={{ padding: "4px 8px", fontSize: 9, color: "var(--color-text-body)", borderBottom: "1px solid var(--color-border-default)" }}>
                    <span>📄</span>
                    <span className="truncate flex-1" style={{ maxWidth: 130 }}>{doc.title}</span>
                    <span style={{ color: allFilled ? "var(--color-success)" : "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                      {docFilled}/{docTotal}
                    </span>
                    <a
                      href={`/api/compliance/session/${sessionId}/export/${doc.type}`}
                      style={{
                        padding: "1px 6px", fontSize: 8, borderRadius: 3, textDecoration: "none", flexShrink: 0,
                        background: allFilled ? "var(--color-accent-blue)" : "var(--color-bg-card)",
                        color: allFilled ? "var(--color-primary-foreground)" : "var(--color-text-muted)",
                        border: allFilled ? "none" : "1px solid var(--color-border-default)",
                        pointerEvents: allFilled ? "auto" : "none",
                        opacity: allFilled ? 1 : 0.5,
                      }}
                      download
                    >
                      ⬇
                    </a>
                    <a
                      href="/enterprise"
                      className="no-underline"
                      style={{ fontSize: 9, opacity: 0.4, whiteSpace: "nowrap" }}
                    >
                      ✨
                    </a>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
