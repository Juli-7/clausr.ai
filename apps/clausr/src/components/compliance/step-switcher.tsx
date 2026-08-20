"use client";

import { useState } from "react";
import type { ComplianceSession, Step, DocumentTemplate } from "@/lib/compliance/types";
import type { PackField } from "@clausr/engine";
import { ScopeSidebar } from "./scope-sidebar";
import { AuditSidebar } from "./audit-sidebar";
import { t } from "@/lib/compliance/i18n";

interface PackWithFields {
  id: string;
  title: string;
  fields: PackField[];
  documents?: { type: string; title: string; fields: string[] }[];
}

interface StepSwitcherProps {
  session: ComplianceSession;
  mode: "auto" | "manual";
  onStepChange: (step: Step) => void;
  onScopeChange: (ids: string[], step?: number) => void;
  docTemplates: DocumentTemplate[];
  packs?: PackWithFields[];
}

const STEPS: { num: Step; key: string }[] = [
  { num: 1, key: "scope" },
  { num: 2, key: "doc" },
  { num: 3, key: "audit" },
];

export function StepSwitcher({ session, mode, onStepChange, onScopeChange, docTemplates, packs }: StepSwitcherProps) {
  const [collapsed, setCollapsed] = useState(true);
  const step = session.step;
  const labels = [t("step1"), t("step2"), t("step3")];

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,.06)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center cursor-pointer"
        style={{ padding: "5px 8px 5px 10px", gap: 4 }}
        onClick={() => setCollapsed(!collapsed)}
      >
        {STEPS.map((s, i) => {
          const isActive = s.num === step;
          const isPast = s.num < step;
          return (
            <div key={s.num} className="inline-flex items-center" style={{ gap: 0 }}>
              {i > 0 && (
                <span
                  style={{
                    width: 16,
                    height: 1,
                    background: isPast ? "var(--color-success)" : isActive ? "var(--color-accent-blue)" : "var(--color-border-default)",
                    margin: "0 3px",
                    transition: "background .2s",
                    flexShrink: 0,
                  }}
                />
              )}
              <button
                className="flex items-center gap-1 border-none rounded cursor-pointer"
                style={{
                  padding: "2px 4px",
                  background: "transparent",
                  fontFamily: "inherit",
                  transition: "opacity .15s",
                  opacity: isActive ? 1 : 0.55,
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onStepChange(s.num);
                }}
              >
                <span
                  className="flex items-center justify-center rounded-full font-bold"
                  style={{
                    width: 15,
                    height: 15,
                    fontSize: 7,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: isActive ? "var(--color-accent-blue)" : isPast ? "var(--color-success)" : "var(--color-bg-dark)",
                    color: isActive || isPast ? "var(--color-primary-foreground)" : "var(--color-text-muted)",
                    transition: "background .2s",
                    flexShrink: 0,
                  }}
                >
                  {isPast ? "✓" : s.num}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--color-text-header)" : isPast ? "var(--color-success)" : "var(--color-text-muted)",
                    transition: "color .2s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {labels[i]}
                </span>
              </button>
            </div>
          );
        })}
        <svg
          width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            color: "var(--color-text-muted)",
            transform: collapsed ? "rotate(180deg)" : undefined,
            transition: "transform .15s",
            marginLeft: 4,
            flexShrink: 0,
          }}
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </div>

      {!collapsed && (
        <div style={{ borderTop: "1px solid var(--color-border-default)", overflowY: "auto", maxHeight: 320 }}>
          {step === 1 && (
            <ScopeSidebar
              selectedPackIds={session.selectedPackIds}
              onRemove={(id) => onScopeChange(session.selectedPackIds.filter((x) => x !== id))}
            />
          )}
          {step === 2 && (
            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8, fontSize: 10, color: "var(--color-text-body)" }}>
              {(packs ?? []).length > 0 ? packs!.map((pack) => {
                const required = pack.fields.filter(f => f.required);
                const filled = required.filter(f => session.docData[f.id]?.trim()).length;
                const fieldTotal = required.length;
                const docs = pack.documents ?? [];
                return (
                  <div key={pack.id} style={{ borderBottom: "1px solid var(--color-border-default)", paddingBottom: 8 }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold" style={{ fontSize: 10, color: "var(--color-text-header)" }}>{pack.title}</span>
                      <span style={{ fontSize: 9, color: filled === fieldTotal ? "var(--color-success)" : "var(--color-text-muted)" }}>
                        {filled}/{fieldTotal}
                      </span>
                    </div>
                    <div style={{ height: 3, background: "var(--color-bg-dark)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ height: "100%", width: `${fieldTotal > 0 ? (filled / fieldTotal) * 100 : 0}%`, background: filled === fieldTotal ? "var(--color-success)" : filled >= fieldTotal / 2 ? "var(--color-amber)" : "var(--color-border-default)", borderRadius: 2 }} />
                    </div>
                    {docs.map((d) => {
                      const docFilled = d.fields.filter((fid) => session.docData[fid]?.trim()).length;
                      const docTotal = d.fields.length;
                      const allFilled = docFilled === docTotal;
                      return (
                        <div key={d.type} className="flex items-center justify-between" style={{ fontSize: 9, padding: "2px 4px", marginBottom: 1 }}>
                          <span className="truncate" style={{ maxWidth: 130, color: allFilled ? "var(--color-success)" : "var(--color-text-body)" }}>
                            📄 {d.title}
                          </span>
                          <span style={{ color: allFilled ? "var(--color-success)" : "var(--color-text-muted)" }}>
                            {docFilled}/{docTotal}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
                      {session.uploadedFiles.length} file{session.uploadedFiles.length !== 1 ? "s" : ""} uploaded
                    </div>
                  </div>
                );
              }) : docTemplates.map((template) => {
                const merged = { ...session.docData };
                const filled = template.fields.filter((f) => merged[f]?.trim()).length;
                const total = template.fields.length;
                const pct = total > 0 ? filled / total : 0;
                return (
                  <div key={template.type}>
                    <div className="flex items-center justify-between" style={{ fontSize: 9, color: "var(--color-text-body)", marginBottom: 2 }}>
                      <span className="truncate" style={{ maxWidth: 140 }}>{template.title}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: pct >= 1 ? "var(--color-success)" : "var(--color-text-muted)" }}>
                        {filled}/{total}
                      </span>
                    </div>
                    <div style={{ height: 3, background: "var(--color-bg-dark)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${pct * 100}%`,
                        background: pct >= 1 ? "var(--color-success)" : pct >= 0.5 ? "var(--color-amber)" : "var(--color-border-default)",
                        borderRadius: 2,
                        transition: "width .3s, background .3s",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {step === 3 && (
            <AuditSidebar
              selectedPackIds={session.selectedPackIds}
              auditResults={session.auditResults}
              activePackId={null}
              onViewDetail={() => {}}
              hideViewButton
            />
          )}
        </div>
      )}
    </div>
  );
}
