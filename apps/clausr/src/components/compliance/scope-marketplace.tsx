"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Pack } from "@/lib/compliance/types";
import { PackCard } from "./pack-card";
import { PackPreviewDrawer } from "./pack-preview-drawer";
import { type FieldDef, type PackFormData } from "./pack-form-modal";
import { ScopeSidebar } from "./scope-sidebar";
import { t, resolveLabel } from "@/lib/compliance/i18n";

interface ScopeMarketplaceProps {
  sessionId: string;
  selectedPackIds: string[];
  onScopeChange: (ids: string[], step?: number) => void;
  hideSidebar?: boolean;
  onStartPackCreation?: () => void;
  onEditPack?: (packId: string, initialData: Partial<PackFormData>) => void;
}

let cachedUserInfo: { role: string; email: string; isExpert: boolean } | null = null;

export function ScopeMarketplace({ sessionId, selectedPackIds, onScopeChange, hideSidebar = false, onStartPackCreation, onEditPack }: ScopeMarketplaceProps) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [regs, setRegs] = useState<string[]>([]);
  const [inds, setInds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [regFilter, setRegFilter] = useState("all");
  const [indFilter, setIndFilter] = useState("all");
  const [previewPack, setPreviewPack] = useState<Pack | null>(null);
  const [userInfo, setUserInfo] = useState<{ role: string; email: string; isExpert: boolean } | null>(cachedUserInfo);
  const [showUpgradeDrawer, setShowUpgradeDrawer] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (cachedUserInfo) return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const memberships: { role: string }[] = d.user?.memberships ?? [];
        const isExpert = memberships.some((m) => m.role === "expert");
        const info = { role: d.user?.platformRole ?? "", email: d.user?.email ?? "", isExpert };
        cachedUserInfo = info;
        setUserInfo(info);
      })
      .catch(() => {/* profile fetch failure is non-fatal */});
  }, []);

  const canCreate = userInfo?.role === "superadmin" || userInfo?.isExpert === true;

  const refreshPacks = useCallback(() => {
    fetch("/api/compliance/packs")
      .then((r) => r.json())
      .then((d) => { setPacks(d.packs); setRegs(d.regs); setInds(d.inds); });
  }, []);

  useEffect(() => { refreshPacks(); }, [refreshPacks]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this pack? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/compliance/packs/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      onScopeChange(selectedPackIds.filter((x) => x !== id));
      setPreviewPack(null);
      refreshPacks();
    } catch { /* delete failure is non-fatal */ }
  }, [refreshPacks, selectedPackIds, onScopeChange]);

  const togglePack = useCallback((id: string) => {
    const next = selectedPackIds.includes(id)
      ? selectedPackIds.filter((x) => x !== id)
      : [...selectedPackIds, id];
    onScopeChange(next);
  }, [selectedPackIds, onScopeChange]);

  const filtered = packs.filter((p) => {
    if (regFilter !== "all" && !p.regs.includes(regFilter)) return false;
    if (indFilter !== "all" && !p.inds.includes(indFilter)) return false;
    const pTitle = resolveLabel(p.title).toLowerCase();
    const pDesc = resolveLabel(p.desc).toLowerCase();
    if (search && !pTitle.includes(search.toLowerCase()) && !pDesc.includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex" style={{ height: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, padding: "16px 16px 0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 shrink-0 flex-wrap">
          <input
            style={{
              flex: 1, minWidth: 140, padding: "5px 10px", fontSize: 11,
              border: "1px solid var(--color-border-input)",
              borderRadius: 6, background: "var(--color-bg-card)",
              color: "var(--color-text-body)",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            style={{
              padding: "5px 8px", fontSize: 10,
              border: "1px solid var(--color-border-input)",
              borderRadius: 6, background: "var(--color-bg-card)",
              color: "var(--color-text-body)",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
            value={regFilter}
            onChange={(e) => setRegFilter(e.target.value)}
          >
            <option value="all">{t("allRegulations")}</option>
            {regs.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            style={{
              padding: "5px 8px", fontSize: 10,
              border: "1px solid var(--color-border-input)",
              borderRadius: 6, background: "var(--color-bg-card)",
              color: "var(--color-text-body)",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
            value={indFilter}
            onChange={(e) => setIndFilter(e.target.value)}
          >
            <option value="all">{t("allIndustries")}</option>
            {inds.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)", fontSize: 11 }}>
              {t("noFilterMatch")}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {/* Create pack card — first in grid */}
              <div
                className="flex flex-col items-center justify-center cursor-pointer animate-fade-in relative"
                style={{
                  background: "linear-gradient(135deg, rgba(41,68,171,0.04), rgba(41,68,171,0.01))",
                  border: "1px dashed var(--color-accent-blue)",
                  borderRadius: 8,
                  minHeight: 180,
                  transition: "border-color .2s, box-shadow .2s",
                }}
                onClick={() => canCreate ? (onStartPackCreation?.() ?? (() => {})) : setShowUpgradeDrawer(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#CBA258";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(203,162,88,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent-blue)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div
                  style={{
                    position: "absolute", top: 6, right: 6,
                    padding: "2px 6px", borderRadius: 4, fontSize: 8,
                    background: "linear-gradient(135deg, #CBA258, #E8D5A3)",
                    color: "#1a1a2e", fontWeight: 700, letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  🏆 Expert
                </div>
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 44, height: 44, borderRadius: 12, fontSize: 20,
                    background: "linear-gradient(135deg, rgba(203,162,88,0.15), rgba(203,162,88,0.05))",
                    color: "#CBA258",
                    marginBottom: 8,
                    transition: "transform .2s",
                  }}
                >
                  🏆
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#CBA258" }}>
                  New Pack
                </div>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2 }}>
                  Create your own AI compliance twin
                </div>
              </div>
              {filtered.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  selected={selectedPackIds.includes(pack.id)}
                  onToggle={togglePack}
                  onPreview={setPreviewPack}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scope sidebar — always visible */}
      {!hideSidebar && <ScopeSidebar
        selectedPackIds={selectedPackIds}
        onRemove={(id) => onScopeChange(selectedPackIds.filter((x) => x !== id))}
        onCreate={() => canCreate ? (onStartPackCreation?.() ?? (() => {})) : setShowUpgradeDrawer(true)}
      />}
      {/* Preview drawer */}
      <PackPreviewDrawer
        pack={previewPack}
        onClose={() => setPreviewPack(null)}
        onToggle={togglePack}
        selected={previewPack ? selectedPackIds.includes(previewPack.id) : false}
        onEdit={previewPack?.canEdit ? (pack) => {
          const p = pack as Pack & { expert?: { name?: string; contact?: string; intro?: string } };
          setPreviewPack(null);
          onEditPack?.(pack.id, {
            title: resolveLabel(pack.title),
            description: resolveLabel(pack.desc),
            icon: pack.icon,
            industries: pack.inds?.join(", "),
            regulations: pack.regs?.join(", "),
            checkPreview: (pack as { checkPreview?: "compact" | "full" }).checkPreview ?? "full",
            version: pack.version ?? "1.0.0",
            status: (pack as { status?: "draft" | "published" }).status ?? "published",
            fields: pack.fields.map((pf) => ({ field: pf.id, label: resolveLabel(pf.label), type: (pf.type === "select" || pf.type === "number" || pf.type === "boolean" ? pf.type : pf.type === "textarea" ? "textarea" : pf.type === "date" ? "date" : "text") as FieldDef["type"], required: pf.required ?? true, options: pf.options?.map((o) => ({ value: o.value, label: resolveLabel(o.label) })), validation: pf.validation })),
            documents: pack.documents.map((d) => ({ type: d.type, title: resolveLabel(d.title), template: d.template, fields: d.fields })),
            checks: pack.checks.map((c) => ({ id: c.id, field: c.field, type: c.type, description: c.description, clause: c.clause, constraint: c.constraint, rounding: c.rounding, depends_on: c.depends_on?.join(", "), sample: c.sample })),
            redlines: pack.redlines?.join("\n"),
            lessons: pack.lessons?.join("\n"),
            expertName: p.expert?.name ?? "",
            expertContact: p.expert?.contact ?? "",
            expertIntro: p.expert?.intro ?? "",
          });
        } : undefined}
        onDelete={previewPack?.canEdit ? handleDelete : undefined}
      />
      {/* Upgrade drawer — shown when unauthorized user clicks New Pack */}
      {showUpgradeDrawer && (
        <div
          className="flex flex-col"
          style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: 380, zIndex: 100,
            background: "var(--color-bg-card)",
            borderLeft: "1px solid var(--color-border-default)",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
            overflow: "auto",
          }}
        >
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 10 }}>
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 32, height: 32, borderRadius: 8, fontSize: 16, background: "var(--color-accent-blue-bg)" }}
            >
              🤖
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-header)" }}>
                Deploy Your AI Twin
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 1 }}>
                Expert-level pack creation
              </div>
            </div>
            <button
              className="flex items-center justify-center border-none rounded-md cursor-pointer"
              style={{ width: 28, height: 28, background: "var(--color-bg-dark)", color: "var(--color-text-muted)" }}
              onClick={() => setShowUpgradeDrawer(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div style={{ padding: "24px 18px", flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-header)", lineHeight: 1.5, marginBottom: 12 }}>
              Deploy your own AI compliance twin
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.8, marginBottom: 20 }}>
              Create custom compliance packs tailored to your products and markets.
              Train an AI twin that knows your supply chain, your documentation, and your
              regulatory obligations — and let it handle audits end-to-end.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {[
                { icon: "🧠", title: "Custom knowledge base", desc: "Upload your specs, manuals, and previous audits" },
                { icon: "⚡", title: "Automated compliance checks", desc: "AI runs readiness checks against any regulation" },
                { icon: "📄", title: "Document generation", desc: "Auto-fill Declarations, risk assessments, and reports" },
                { icon: "🔁", title: "Continuous monitoring", desc: "Get alerted when regulations affecting you change" },
              ].map((f) => (
                <div key={f.title} className="flex gap-3" style={{ padding: "10px 12px", borderRadius: 8, background: "var(--color-bg-dark)" }}>
                  <div style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0 }}>{f.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-header)", marginBottom: 2 }}>{f.title}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                padding: "14px 16px", borderRadius: 8, fontSize: 11, lineHeight: 1.6,
                background: "rgba(41,68,171,0.04)", border: "1px solid rgba(41,68,171,0.12)",
                color: "var(--color-accent-blue)",
              }}
            >
              <strong>Contact your account manager</strong> to upgrade your plan and deploy your AI compliance twin.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
