"use client";

import { useEffect, useState } from "react";
import type { Pack } from "@/lib/compliance/types";
import { t, resolveLabel } from "@/lib/compliance/i18n";

interface ScopeSidebarProps {
  selectedPackIds: string[];
  onRemove: (id: string) => void;
  onCreate?: () => void;
}

export function ScopeSidebar({ selectedPackIds, onRemove, onCreate }: ScopeSidebarProps) {
  const [packs, setPacks] = useState<Pack[]>([]);

  useEffect(() => {
    if (selectedPackIds.length === 0) { setPacks([]); return; }
    let cancelled = false;
    Promise.all(
      selectedPackIds.map((id) =>
        fetch(`/api/compliance/packs/${id}`).then((r) => r.json())
      )
    ).then((data) => { if (!cancelled) setPacks(data); });
    return () => { cancelled = true; };
  }, [selectedPackIds]);

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        width: 200,
        borderLeft: "1px solid var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      <div
        className="font-semibold shrink-0"
        style={{
          fontSize: 11, padding: "10px 12px",
          borderBottom: "1px solid var(--color-border-default)",
          color: "var(--color-text-header)",
        }}
      >
        {t("yourScope")}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: "6px 8px" }}>
        {packs.length === 0 ? (
          <div style={{ padding: "12px 4px", textAlign: "center", fontSize: 10, color: "var(--color-text-muted)" }}>
            {t("noPacksSelected")}
          </div>
        ) : (
          packs.map((pack) => (
            <div
              key={pack.id}
              className="flex items-center gap-2 rounded-md"
              style={{ padding: "6px 6px", marginBottom: 3 }}
            >
              <div style={{ fontSize: 13, width: 18, textAlign: "center" }}>{pack.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate" style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-body)" }}>
                  {resolveLabel(pack.title)}
                </div>
                <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
                  {pack.checks?.length ?? 0} {t("checks")}
                </div>
              </div>
              <button
                className="flex items-center justify-center border-none rounded cursor-pointer shrink-0"
                style={{ width: 18, height: 18, background: "transparent", color: "var(--color-text-muted)" }}
                onClick={() => onRemove(pack.id)}
                title={t("remove")}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {onCreate && (
        <div className="shrink-0" style={{ padding: "8px", borderTop: "1px solid var(--color-border-default)" }}>
          <button
            onClick={onCreate}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-md text-xs font-medium cursor-pointer border-none transition-colors"
            style={{ background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14"/>
              <path d="M5 12h14"/>
            </svg>
            New Pack
          </button>
        </div>
      )}
    </div>
  );
}
