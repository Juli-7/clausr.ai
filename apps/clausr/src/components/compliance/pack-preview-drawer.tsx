"use client";

import { useState, useEffect, useCallback } from "react";
import type { Pack } from "@/lib/compliance/types";
import { t, resolveLabel } from "@/lib/compliance/i18n";

interface PackPreviewDrawerProps {
  pack: Pack | null;
  onClose: () => void;
  onToggle: (id: string) => void;
  selected: boolean;
  onEdit?: (pack: Pack) => void;
  onDelete?: (id: string) => void;
}

interface PackVersionInfo {
  id: string;
  version: string;
  savedAt: string;
}

export function PackPreviewDrawer({ pack, onClose, onToggle, selected, onEdit, onDelete }: PackPreviewDrawerProps) {
  const [versions, setVersions] = useState<PackVersionInfo[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (!pack?.id) return;
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/compliance/packs/${pack.id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions((data.versions ?? []) as PackVersionInfo[]);
      }
    } catch {
    } finally {
      setVersionsLoading(false);
    }
  }, [pack?.id]);

  useEffect(() => {
    setVersions([]);
    setRestoreMsg(null);
    if (pack) loadVersions();
  }, [pack?.id, loadVersions]);

  const handleRestore = useCallback(async (versionId: string) => {
    if (!pack?.id) return;
    if (!window.confirm(`Restore version "${versionId}"? The current version will be archived and replaced.`)) return;
    setRestoring(versionId);
    setRestoreMsg(null);
    try {
      const res = await fetch(`/api/compliance/packs/${pack.id}/versions/${versionId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRestoreMsg(`Restored to ${versionId}.`);
        loadVersions();
      } else {
        setRestoreMsg(data.error ?? "Restore failed.");
      }
    } catch {
      setRestoreMsg("Restore failed.");
    } finally {
      setRestoring(null);
    }
  }, [pack?.id, loadVersions]);

  if (!pack) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(0,0,0,0.2)",
        }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="animate-fade-in"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 400, zIndex: 50,
          background: "var(--color-bg-card)",
          borderLeft: "1px solid var(--color-border-default)",
          display: "flex", flexDirection: "column",
          boxShadow: "-4px 0 20px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 shrink-0"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border-default)" }}
        >
          <button
            className="flex items-center justify-center border-none rounded-md cursor-pointer"
            style={{ width: 28, height: 28, background: "var(--color-bg-dark)", color: "var(--color-text-muted)" }}
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          {onEdit && (
            <button
              className="flex items-center justify-center border-none rounded-md cursor-pointer"
              style={{ width: 28, height: 28, background: "var(--color-bg-dark)", color: "var(--color-text-muted)" }}
              onClick={() => onEdit(pack)}
              title="Edit pack"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              className="flex items-center justify-center border-none rounded-md cursor-pointer"
              style={{ width: 28, height: 28, background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
              onClick={() => onDelete(pack.id)}
              title="Delete pack"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
          <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{t("packDetails")}</div>
          <div className="font-semibold truncate" style={{ fontSize: 14, color: "var(--color-text-header)" }}>
            {pack.icon} {resolveLabel(pack.title)}
          </div>
        </div>
        <button
          className="text-xs border-none rounded-md cursor-pointer font-medium"
          style={{
            padding: "5px 14px",
            background: selected ? "var(--color-success-bg)" : "var(--color-accent-blue)",
            color: selected ? "var(--color-success)" : "var(--color-primary-foreground)",
          }}
          onClick={() => onToggle(pack.id)}
        >
          {selected ? t("remove") : t("addToScope")}
        </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <div className="mb-2 font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {t("description")}
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.7 }}>
              {resolveLabel(pack.desc)}
            </p>
          </div>

          {/* Meta */}
          <div className="flex gap-6 mb-4 flex-wrap">
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("version")}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-header)", fontFamily: "'JetBrains Mono', monospace" }}>{pack.version}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("status")}</div>
              <div
                style={{
                  fontSize: 10, fontWeight: 600, marginTop: 2,
                  color: pack.status === "draft" ? "var(--color-warning, #e0a13c)" : "var(--color-success)",
                  background: pack.status === "draft" ? "rgba(240,173,78,0.12)" : "var(--color-success-bg)",
                  border: `1px solid ${pack.status === "draft" ? "rgba(224,161,60,0.35)" : "var(--color-border-default)"}`,
                  padding: "2px 8px", borderRadius: 4, width: "fit-content",
                }}
              >
                {pack.status === "draft" ? "DRAFT" : "PUBLISHED"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("checksTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-header)" }}>{pack.checks?.length ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("documentsTitle")}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-header)" }}>{pack.documents?.length ?? 0}</div>
            </div>
            {pack.author && !pack.expert && (
              <div>
                <div style={{ fontSize: 9, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{t("author")}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-header)" }}>{pack.author}</div>
              </div>
            )}
          </div>

          {/* Expert contact */}
          {(() => {
            const e = pack.expert;
            if (!e?.name) return null;
            return (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, border: "1px solid var(--color-accent-blue-bg)", background: "rgba(41,68,171,0.03)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-header)", marginBottom: 6 }}>
                  👤 {t("expert")}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-body)" }}>
                  <div style={{ fontWeight: 600 }}>{e.name}</div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: 10, marginTop: 3 }}>{e.intro}</div>
                  <div style={{ fontSize: 10, marginTop: 3 }}>📞 {e.contact}</div>
                </div>
              </div>
            );
          })()}

          {/* Regulations */}
          <div style={{ marginBottom: 16 }}>
            <div className="mb-2 font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {t("regs")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(pack.regs ?? []).map((r) => (
                <span key={r} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)" }}>
                  {r}
                </span>
              ))}
            </div>
          </div>

          {/* Industries */}
          <div style={{ marginBottom: 16 }}>
            <div className="mb-2 font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {t("inds")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(pack.inds ?? []).map((i) => (
                <span key={i} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "var(--color-bg-dark)", color: "var(--color-text-muted)" }}>
                  {i}
                </span>
              ))}
            </div>
          </div>

          {/* Checks */}
          <div style={{ marginBottom: 16 }}>
            <div className="mb-2 font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {t("checksTitle")} ({pack.checks?.length ?? 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(pack.checks ?? []).map((c) => (
                <div
                  key={c.field}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 5,
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-default)",
                    fontSize: 10,
                    color: "var(--color-text-body)",
                    lineHeight: 1.5,
                  }}
                >
                  <span className="font-semibold" style={{ color: "var(--color-accent-blue)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {c.field}
                  </span>{" "}
                  <span style={{ display: (pack as { checkPreview?: string }).checkPreview === "compact" ? "none" : "inline" }}>{c.description ?? ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div style={{ marginBottom: 16 }}>
            <div className="mb-2 font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              {t("documentsTitle")}
            </div>
            {pack.documents.map((d) => (
              <div
                key={d.type}
                style={{
                  padding: "8px 10px",
                  borderRadius: 5,
                  border: "1px solid var(--color-border-default)",
                  marginBottom: 6,
                }}
              >
                <div className="font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)" }}>{resolveLabel(d.title)}</div>
                <div style={{ fontSize: 9, color: "var(--color-text-muted)", marginTop: 2 }}>
                  {d.type} · {d.fields.length} {t("fields")}
                </div>
              </div>
            ))}
          </div>

          {/* Version history */}
          <div style={{ marginBottom: 16 }}>
            <div className="mb-2 font-semibold" style={{ fontSize: 11, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              📚 Version History
            </div>
            {versionsLoading && <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Loading...</div>}
            {!versionsLoading && versions.length === 0 && (
              <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>No archived versions yet — edits are archived automatically.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {versions.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px", borderRadius: 5,
                    background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)",
                  }}
                >
                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "var(--color-text-header)" }}>v{v.version}</span>
                  <span style={{ fontSize: 9, color: "var(--color-text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.savedAt ? new Date(v.savedAt.replace(/-/g, ":").slice(0, 19)).toLocaleString() : ""}
                  </span>
                  <button
                    className="text-[10px] border-none rounded cursor-pointer"
                    style={{ padding: "3px 8px", background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)" }}
                    onClick={() => handleRestore(v.id)}
                    disabled={restoring === v.id}
                  >
                    {restoring === v.id ? "..." : "Restore"}
                  </button>
                </div>
              ))}
            </div>
            {restoreMsg && <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 6 }}>{restoreMsg}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
