"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PackField } from "@clausr/engine";
import { DocForm } from "./doc-form";
import { FilePreviewModal } from "./file-preview-modal";
import { t } from "@/lib/compliance/i18n";
import { validateFile } from "@/lib/file-limits";

interface PackWithFields {
  id: string;
  title: string;
  fields: PackField[];
  documents: { type: string; title: string; fields: string[] }[];
}

interface DocumentsPanelProps {
  sessionId: string;
  selectedPackIds: string[];
  docData: Record<string, string>;
  uploadedFiles: { name: string; size: string; time: string; docType?: string; downloadUrl?: string }[];
  packs: PackWithFields[];
  onAddChatMessage?: (text: string) => void;
  onToolMessage?: (name: string, isHint?: boolean) => void;
  onCallTool?: (name: string, input: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  mode: "auto" | "manual";
  onSendText?: (text: string) => Promise<void>;
}

interface FileInfo {
  name: string;
  size: string;
  time: string;
  docType?: string;
  downloadUrl?: string;
  /** @deprecated only used for tool input (attach_file) — never stored in poll response */
  dataUrl?: string;
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        color:
          status === "saving" ? "var(--color-text-muted)" :
          status === "saved" ? "var(--color-success)" :
          status === "error" ? "var(--color-danger)" :
          "transparent",
        transition: "color 0.2s",
      }}
    >
      {status === "saving" ? "Saving…" :
       status === "saved" ? "Saved ✓" :
       status === "error" ? "Error saving" : ""}
    </span>
  );
}

function fieldLabel(fieldId: string, packs: PackWithFields[]): string {
  for (const p of packs) {
    const f = p.fields.find((f) => f.id === fieldId);
    if (f) return typeof f.label === "string" ? f.label : (f.label?.en ?? fieldId);
  }
  return fieldId;
}

export function DocumentsPanel({ sessionId, selectedPackIds, docData, uploadedFiles, packs, onAddChatMessage, onToolMessage, onCallTool, mode }: DocumentsPanelProps) {
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [localData, setLocalData] = useState<Record<string, string>>({});
  const [expandedPacks, setExpandedPacks] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<string, "questionnaire" | "documents">>({});

  useEffect(() => {
    setExpandedPacks(new Set(packs.map(p => p.id)));
  }, [packs]);

  const toggleExpand = useCallback((packId: string) => {
    setExpandedPacks((prev) => {
      const next = new Set(prev);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  }, []);

  const doSave = useCallback(async (field: string, value: string) => {
    try {
      await onCallTool?.("batch_update_doc_fields", { fields: { [field]: value } });
      setSaveStatus((prev) => ({ ...prev, [field]: "saved" }));
      saveTimers.current[field] = setTimeout(() => {
        setSaveStatus((prev) => { const n = { ...prev }; delete n[field]; return n; });
      }, 2000);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [field]: "error" }));
      saveTimers.current[field] = setTimeout(() => {
        setSaveStatus((prev) => { const n = { ...prev }; delete n[field]; return n; });
      }, 4000);
    }
  }, [onCallTool]);

  const handleFieldChange = useCallback((field: string, value: string) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
    setSaveStatus((prev) => ({ ...prev, [field]: "saving" }));
    if (saveTimers.current[field]) clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(() => doSave(field, value), 400);
  }, [doSave]);

  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleRemoveFile = useCallback(async (name: string) => {
    await onCallTool?.("detach_file", { name });
  }, [onCallTool]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, docType?: string) => {
    if (mode === "auto") {
      onToolMessage?.("attach_file — disabled in auto mode", true);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      onAddChatMessage?.(`⚠️ ${err}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await onCallTool?.("attach_file", {
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        time: new Date().toISOString().slice(0, 10),
        dataUrl,
        docType: docType ?? "",
      });
    };
    reader.readAsDataURL(file);
  }, [mode, onAddChatMessage, onCallTool]);

  const merged = { ...docData, ...localData };

  if (selectedPackIds.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: 12 }}>
        {t("noPacksSelected")}
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "0 4px" }}>
      {packs.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)", fontSize: 11 }}>
          {t("noDocuments")}
        </div>
      ) : (
        packs.map((pack) => {
          const required = pack.fields.filter(f => f.required);
          const filled = required.filter(f => merged[f.id]?.trim()).length;
          const fieldTotal = required.length;

          const docsComplete = pack.documents.filter((d) =>
            d.fields.every((fid) => merged[fid]?.trim())
          ).length;
          const docTotal = pack.documents.length;

          const isExpanded = expandedPacks.has(pack.id);
          const tab = activeTab[pack.id] ?? "questionnaire";

          const fieldStatuses = pack.fields.map(
            (f) => saveStatus[f.id] ?? "idle"
          );
          const anySaving = fieldStatuses.some((s) => s === "saving");
          const anyError = fieldStatuses.some((s) => s === "error");
          const anySaved = fieldStatuses.some((s) => s === "saved");

          return (
            <div
              key={pack.id}
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
                borderRadius: 8,
                marginBottom: 8,
                overflow: "hidden",
              }}
            >
              <div
                className="flex items-center justify-between cursor-pointer"
                style={{ padding: "10px 14px" }}
                onClick={() => toggleExpand(pack.id)}
              >
                <div className="flex items-center gap-3">
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <span className="font-semibold" style={{ fontSize: 12, color: "var(--color-text-header)" }}>
                    {pack.title}
                  </span>
                  <span
                    style={{
                      fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                      color: filled === fieldTotal ? "var(--color-success)" : "var(--color-text-muted)",
                      background: filled === fieldTotal ? "var(--color-success-bg)" : "var(--color-bg-dark)",
                      padding: "1px 6px", borderRadius: 4,
                    }}
                    title={`${filled}/${fieldTotal} fields filled`}
                  >
                    {filled}/{fieldTotal}
                  </span>
                  {docTotal > 0 && (
                    <span
                      style={{
                        fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                        color: docsComplete === docTotal ? "var(--color-success)" : "var(--color-text-muted)",
                        background: docsComplete === docTotal ? "var(--color-success-bg)" : "var(--color-bg-dark)",
                        padding: "1px 6px", borderRadius: 4,
                      }}
                      title={`${docsComplete}/${docTotal} documents complete`}
                    >
                      📄 {docsComplete}/{docTotal}
                    </span>
                  )}
                </div>
                <SaveIndicator
                  status={
                    anySaving ? "saving" :
                    anyError ? "error" :
                    anySaved ? "saved" :
                    "idle"
                  }
                />
              </div>

              {isExpanded && (
                <>
                  <div style={{ borderTop: "1px solid var(--color-border-default)" }}>
                    <div className="flex" style={{ fontSize: 10 }}>
                      <button
                        className="border-none cursor-pointer"
                        style={{
                          flex: 1, padding: "6px 0",
                          fontWeight: tab === "questionnaire" ? 600 : 400,
                          color: tab === "questionnaire" ? "var(--color-accent-blue)" : "var(--color-text-muted)",
                          borderBottom: tab === "questionnaire" ? "2px solid var(--color-accent-blue)" : "2px solid transparent",
                          background: "none",
                          transition: "border-color .15s, color .15s",
                        }}
                        onClick={() => setActiveTab((prev) => ({ ...prev, [pack.id]: "questionnaire" }))}
                      >
                        {t("questionnaire")}
                      </button>
                      <button
                        className="border-none cursor-pointer"
                        style={{
                          flex: 1, padding: "6px 0",
                          fontWeight: tab === "documents" ? 600 : 400,
                          color: tab === "documents" ? "var(--color-accent-blue)" : "var(--color-text-muted)",
                          borderBottom: tab === "documents" ? "2px solid var(--color-accent-blue)" : "2px solid transparent",
                          background: "none",
                          transition: "border-color .15s, color .15s",
                        }}
                        onClick={() => setActiveTab((prev) => ({ ...prev, [pack.id]: "documents" }))}
                      >
                        {t("documents")} ({docTotal})
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: "0 14px 14px" }}>
                    {tab === "questionnaire" && (
                      <div style={{ paddingTop: 12 }}>
                        {required.length > 0 && (
                          <div style={{ marginBottom: pack.fields.some(f => !f.required) ? 16 : 0 }}>
                            <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
                              Required Fields
                            </div>
                            <DocForm
                              fields={required}
                              data={merged}
                              onFieldChange={handleFieldChange}
                            />
                          </div>
                        )}
                        {pack.fields.some(f => !f.required) && (
                          <div>
                            <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
                              Optional Fields
                            </div>
                            <DocForm
                              fields={pack.fields.filter(f => !f.required)}
                              data={merged}
                              onFieldChange={handleFieldChange}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {tab === "documents" && (
                      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        {pack.documents.map((doc) => {
                          const docFilled = doc.fields.filter((fid) => merged[fid]?.trim()).length;
                          const docTotalF = doc.fields.length;
                          const allFilled = docFilled === docTotalF;
                          const files = uploadedFiles.filter((f) => f.docType === doc.type);
                          return (
                            <div
                              key={doc.type}
                              style={{
                                border: "1px solid var(--color-border-default)",
                                borderRadius: 6,
                                padding: 10,
                                background: "var(--color-bg-dark)",
                              }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)" }}>
                                  📄 {doc.title}
                                </div>
                                <span
                                  style={{
                                    fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                                    color: allFilled ? "var(--color-success)" : "var(--color-text-muted)",
                                  }}
                                >
                                  {docFilled}/{docTotalF}
                                </span>
                              </div>

                              <div style={{ fontSize: 9, color: "var(--color-text-muted)", marginBottom: 6 }}>
                                {doc.fields.map((fid, i) => {
                                  const label = fieldLabel(fid, packs);
                                  const filled = !!merged[fid]?.trim();
                                  return (
                                    <span key={fid}>
                                      <span style={{ color: filled ? "var(--color-success)" : "var(--color-text-muted)" }}>
                                        {filled ? "✅" : "⬜"} {label}
                                      </span>
                                      {i < doc.fields.length - 1 && <span style={{ margin: "0 4px", color: "var(--color-border-default)" }}>·</span>}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Uploaded files for this document */}
                              {files.length > 0 && (
                                <div style={{ marginBottom: 6 }}>
                                  {files.map((f) => (
                                    <div
                                      key={f.name}
                                      className="flex items-center gap-2"
                                      style={{ fontSize: 9, color: "var(--color-text-body)", padding: "2px 0" }}
                                    >
                                      <span
                                        className="cursor-pointer underline"
                                        style={{ color: "var(--color-accent-blue)" }}
                                        onClick={() => setPreviewFile(f)}
                                      >
                                        {f.name}
                                      </span>
                                      <span style={{ color: "var(--color-text-muted)" }}>({f.size})</span>
                                      <button
                                        className="border-none cursor-pointer"
                                        style={{ color: "var(--color-danger)", background: "none", padding: 0, fontSize: 9, lineHeight: 1 }}
                                        onClick={() => handleRemoveFile(f.name)}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-2">
                                <label
                                  className="text-xs border rounded-md cursor-pointer"
                                  style={{ padding: "3px 10px", fontSize: 9, border: "1px solid var(--color-border-default)", color: "var(--color-text-muted)", background: "var(--color-bg-card)" }}
                                >
                                  {t("upload")}
                                  <input type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => handleFileUpload(e, doc.type)} />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
      <FilePreviewModal key={previewFile?.downloadUrl} file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
