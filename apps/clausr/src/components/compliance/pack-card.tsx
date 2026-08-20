"use client";

import type { Pack } from "@/lib/compliance/types";
import { t, resolveLabel } from "@/lib/compliance/i18n";

interface PackCardProps {
  pack: Pack;
  selected: boolean;
  onToggle: (id: string) => void;
  onPreview: (pack: Pack) => void;
}

export function PackCard({ pack, selected, onToggle, onPreview }: PackCardProps) {
  return (
    <div
      className="animate-fade-in flex flex-col"
      style={{
        background: selected ? "rgba(41,68,171,0.04)" : "var(--color-bg-card)",
        border: selected ? "1.5px solid var(--color-accent-blue)" : "1px solid var(--color-border-default)",
        borderRadius: 8,
        overflow: "hidden",
        transition: "border-color .15s, background .15s",
      }}
    >
      {/* Top */}
      <div style={{ padding: "14px 14px 6px", display: "flex", gap: 10 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 32, height: 32, borderRadius: 6, fontSize: 15,
            background: "var(--color-bg-dark)",
          }}
        >
          {pack.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-semibold truncate"
            style={{ fontSize: 12, color: "var(--color-text-header)", lineHeight: 1.4 }}
          >
            {resolveLabel(pack.title)}
          </div>
          <div
            className="truncate flex items-center gap-1.5"
            style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 1 }}
          >
            <span
              style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                background: "var(--color-bg-dark)",
                border: "1px solid var(--color-border-default)",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--color-text-body)",
                flexShrink: 0,
              }}
            >
              v{pack.version}
            </span>
            {pack.status === "draft" && (
              <span
                style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                  background: "var(--color-warning-bg, rgba(240,173,78,0.15))",
                  color: "var(--color-warning, #e0a13c)",
                  border: "1px solid rgba(224,161,60,0.35)",
                  fontWeight: 600,
                }}
              >
                DRAFT
              </span>
            )}
            {pack.checks?.length ?? 0} {t("checks")}
            {pack.expert?.name ? <span> · 👤 {pack.expert.name}</span> : pack.author ? <span> · {pack.author}</span> : null}
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{ padding: "2px 14px 6px" }}>
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {resolveLabel(pack.desc)}
        </div>
      </div>

      {/* Tags */}
      <div style={{ padding: "0 14px 8px", display: "flex", flexWrap: "wrap", gap: 3 }}>
        {pack.regs.slice(0, 2).map((r) => (
          <span
            key={r}
            style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 3,
              background: "var(--color-accent-blue-bg)",
              color: "var(--color-accent-blue)",
            }}
          >
            {r}
          </span>
        ))}
        <span style={{ fontSize: 9, color: "var(--color-text-muted)", padding: "1px 0" }}>
          +{pack.regs.length - 2 > 0 ? pack.regs.length - 2 : 0}
        </span>
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-2"
        style={{
          marginTop: "auto",
          padding: "6px 14px",
        }}
      >
        <button
          className="text-xs border-none rounded-md cursor-pointer shrink-0"
          style={{
            padding: "4px 10px",
            background: "transparent",
            color: "var(--color-text-muted)",
          }}
          onClick={() => onPreview(pack)}
        >
          {t("preview")}
        </button>
        <a
          href="/enterprise"
          className="no-underline"
          style={{ fontSize: 11, opacity: 0.4 }}
        >
          ✨
        </a>
        <button
          className="text-xs border-none rounded-md cursor-pointer ml-auto font-medium"
          style={{
            padding: "4px 12px",
            background: selected ? "var(--color-success-bg)" : "var(--color-accent-blue)",
            color: selected ? "var(--color-success)" : "var(--color-primary-foreground)",
          }}
          onClick={() => onToggle(pack.id)}
        >
          {selected ? t("added") : t("add")}
        </button>
      </div>
    </div>
  );
}
