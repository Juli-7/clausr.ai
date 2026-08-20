"use client";

import { useEffect, useState } from "react";
import type { AuditResult } from "@/lib/compliance/types";
import { t } from "@/lib/compliance/i18n";

interface AuditSidebarProps {
  selectedPackIds: string[];
  auditResults: AuditResult[];
  activePackId: string | null;
  onViewDetail: (id: string) => void;
  hideViewButton?: boolean;
}

export function AuditSidebar({ selectedPackIds, auditResults, activePackId, onViewDetail, hideViewButton }: AuditSidebarProps) {
  const [packs, setPacks] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (selectedPackIds.length === 0) { setPacks([]); return; }
    let cancelled = false;
    Promise.all(
      selectedPackIds.map((id) =>
        fetch(`/api/compliance/packs/${id}`).then((r) => r.json())
      )
    ).then((data) => {
      if (!cancelled) setPacks(data.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title })));
    });
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
        {t("auditScope")}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: "6px 8px" }}>
        {packs.length === 0 ? (
          <div style={{ padding: "12px 4px", textAlign: "center", fontSize: 10, color: "var(--color-text-muted)" }}>
            {t("noPackResults")}
          </div>
        ) : (
          packs.map((pack) => {
            const result = auditResults.find((r) => r.packId === pack.id);
            const items = result?.items || [];
            const passed = items.filter((i) => i.statusLabel === "PASS").length;
            const failed = items.filter((i) => i.statusLabel === "FAIL").length;
            const done = items.filter((i) => i.status === "done").length;
            const isActive = activePackId === pack.id;

            return (
              <div
                key={pack.id}
                className="rounded-md"
                style={{
                  padding: "6px 6px",
                  marginBottom: 3,
                  background: isActive ? "var(--color-bg-dark)" : "transparent",
                }}
              >
                <div className="truncate" style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-body)", marginBottom: 2 }}>
                  {pack.title}
                </div>
                {items.length > 0 && (
                  <div style={{ fontSize: 9, color: "var(--color-text-muted)", marginBottom: 4 }}>
                    <span style={{ color: "var(--color-success)" }}>{passed}✓</span>
                    {failed > 0 && <span style={{ color: "var(--color-danger)", marginLeft: 4 }}>{failed}✗</span>}
                    <span style={{ marginLeft: 4 }}>{done}/{items.length} {t("checks")}</span>
                  </div>
                )}
                {!hideViewButton && (
                  <button
                    className="w-full text-xs border-none rounded-md cursor-pointer font-medium"
                    style={{
                      padding: "3px 0", fontSize: 9,
                      background: isActive ? "var(--color-accent-blue)" : "var(--color-bg-dark)",
                      color: isActive ? "var(--color-primary-foreground)" : "var(--color-text-muted)",
                    }}
                    onClick={() => onViewDetail(pack.id)}
                  >
                    {isActive ? t("viewing") : t("viewDetails")}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
