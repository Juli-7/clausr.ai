"use client";

import { t } from "@/lib/compliance/i18n";

interface FileListProps {
  files: { name: string; size: string; time: string; downloadUrl?: string }[];
  onFileClick?: (file: { name: string; size: string; time: string; downloadUrl?: string }) => void;
  onRemoveFile?: (name: string) => void;
}

function FileIcon({ name }: { name: string }) {
  const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
  const isPdf = name.endsWith(".pdf");
  const isDocx = /\.(docx?)$/i.test(name);
  const isSheet = /\.(xlsx?|csv)$/i.test(name);

  if (isImage) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="var(--color-accent-blue)" strokeWidth="1.5"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="var(--color-accent-blue)"/>
        <path d="M21 15l-5-5-5 5-4-4-4 4" stroke="var(--color-accent-blue)" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (isPdf) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 15h6M9 12h6M9 18h4" stroke="var(--color-danger)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  if (isDocx) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="var(--color-accent-blue)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="var(--color-accent-blue)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 15h6M9 12h6M9 18h4" stroke="var(--color-accent-blue)" strokeWidth="1.5" strokeLinecap="round"/>
        <text x="10" y="15" fontSize="6" fill="var(--color-accent-blue)" fontWeight="bold">W</text>
      </svg>
    );
  }
  if (isSheet) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="rgb(16,124,16)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="rgb(16,124,16)" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M8 13l8 6M16 13l-8 6" stroke="rgb(16,124,16)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

export function FileList({ files, onFileClick, onRemoveFile }: FileListProps) {
  if (files.length === 0) {
    return (
      <div style={{ fontSize: 10, color: "var(--color-text-muted)", textAlign: "center", padding: "16px 0" }}>
        {t("noFiles")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {files.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-md"
          style={{ padding: "6px 8px", background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", cursor: onFileClick ? "pointer" : undefined }}
          onClick={() => onFileClick?.(f)}
        >
          <FileIcon name={f.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate" style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-body)" }}>
              {f.name}
            </div>
            <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
              {f.size} · {f.time}
            </div>
          </div>
          {onRemoveFile ? (
            <button
              className="flex items-center justify-center border-none rounded"
              style={{ width: 18, height: 18, background: "transparent", color: "var(--color-text-muted)", cursor: "pointer", flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); onRemoveFile(f.name); }}
              title="Remove file"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
