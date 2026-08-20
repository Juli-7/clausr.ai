"use client";

import { useState } from "react";
import type { ValidationCheck } from "@/lib/compliance/types";
import { t } from "@/lib/compliance/i18n";

interface ReadinessChecksProps {
  checks: ValidationCheck[];
  score: number;
  onRunValidation: () => Promise<void>;
  hideRunButton?: boolean;
}

export function ReadinessChecks({ checks, score, onRunValidation, hideRunButton }: ReadinessChecksProps) {
  const [running, setRunning] = useState(false);

  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (circumference * score) / 100;

  const statusColor = score >= 80 ? "var(--color-success)" : score >= 50 ? "var(--color-amber)" : "var(--color-danger)";

  return (
    <div>
      {/* Score gauge */}
      <div className="flex items-center gap-4 mb-4" style={{ padding: "12px 14px", background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", borderRadius: 8 }}>
        <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-bg-dark)" strokeWidth="5" />
            <circle
              cx="32" cy="32" r="28"
              fill="none" stroke={statusColor} strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transform: "rotate(-90deg)", transformOrigin: "32px 32px", transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18, color: "var(--color-text-header)", lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 8, color: "var(--color-text-muted)" }}>/100</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-header)" }}>
            {t("documentReadiness")}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 1 }}>
            {t("checksPassed", { n: checks.filter((c) => c.status === "pass").length, total: checks.length })}
          </div>
        </div>
        {!hideRunButton && (
          <button
            className="ml-auto text-xs border-none rounded-md cursor-pointer font-medium shrink-0"
            style={{
              padding: "5px 12px",
              background: running ? "var(--color-bg-dark)" : "var(--color-accent-blue)",
              color: running ? "var(--color-text-muted)" : "var(--color-primary-foreground)",
            }}
            disabled={running}
            onClick={async () => { setRunning(true); try { await onRunValidation(); } finally { setRunning(false); } }}
          >
            {running ? t("running") : t("runChecks")}
          </button>
        )}
      </div>

      {/* Check list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {checks.map((c) => {
          const bg = c.status === "pass" ? "var(--color-success-bg)" : c.status === "warn" ? "var(--color-amber-bg)" : "var(--color-danger-bg)";
          const fg = c.status === "pass" ? "var(--color-success)" : c.status === "warn" ? "var(--color-amber)" : "var(--color-danger)";
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md"
              style={{ padding: "5px 8px", background: bg, fontSize: 10, color: "var(--color-text-body)" }}
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600, color: fg }}>
                {c.status === "pass" ? "✓" : c.status === "warn" ? "△" : "✗"}
              </span>
              <span className="min-w-0 flex-1">{c.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
