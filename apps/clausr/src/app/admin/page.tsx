"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdminAuditPanel } from "@/components/admin-audit-panel";
import { CreateUserDialog } from "@/components/create-user-dialog";

interface MemInfo {
  id: string; email: string; name: string; platform_role: string; is_active: number; role: string;
}

interface OrgRow {
  id: string; name: string; slug: string; member_count: number; created_at: number;
}

interface UsgRow { tenantId: string; totalCost: number; totalSessions: number; }

interface ProfileData {
  user: {
    id: string; email: string; name: string;
    platformRole: "superadmin" | "operator"; isActive: boolean;
    memberships: { organizationId: string; organizationName: string; role: string }[];
  };
}

interface PackRow {
  id: string;
  title: string;
  author: string;
  visibility: "author" | "org" | "marketplace";
  regs: string[];
  inds: string[];
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || r.statusText);
  }
  return r.json();
}

const roleClasses: Record<string, string> = {
  superadmin: "text-amber border-amber/20 bg-amber/10",
  admin: "text-amber border-amber/20 bg-amber/10",
  operator: "text-muted-foreground border-border bg-muted",
  expert: "text-[#479ca8] border-[#479ca8]/20 bg-[#479ca8]/10",
  tester: "text-muted-foreground border-border bg-muted",
};

export default function AdminPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [usage, setUsage] = useState<UsgRow[]>([]);
  const [tab, setTab] = useState<"orgs" | "packs" | "audit">("orgs");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [orgDets, setOrgDets] = useState<Record<string, { members: MemInfo[] }>>({});
  const [orgConfigs, setOrgConfigs] = useState<Record<string, { llmModel?: string; llmProvider?: string; temperature?: number; maxTokens?: number; usageLimit?: number; usageLimitPeriod?: "monthly" | "total"; tokenPrice?: number; expertLimit?: number; pricing?: Record<string, { input: number; output: number }> }>>({});
  const pricingEventTypes = ["compliance-chat", "compliance-audit", "create-pack"] as const;
  const [cfgDrafts, setCfgDrafts] = useState<Record<string, { llmModel: string; llmProvider: string; temperature: string; maxTokens: string; usageLimit: string; usageLimitPeriod: "monthly" | "total"; tokenPrice: string; expertLimit: string; pricing: Record<string, { input: string; output: string }> }>>({});
  const [perUserUsage, setPerUserUsage] = useState<Record<string, { userId: string; totalCost: number; totalSessions: number; totalQuantity: number }[]>>({});

  const [showCO, setShowCO] = useState(false); const [coN, setCoN] = useState("");
  const [noOrgUsers, setNoOrgUsers] = useState<{ id: string; email: string; name: string; platformRole: string; isActive: boolean }[]>([]);
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [addUserOrg, setAddUserOrg] = useState("");
  const [addUserRole, setAddUserRole] = useState<"admin" | "expert" | "tester">("tester");

  // Packs tab state
  const [packs, setPacks] = useState<Array<{ id: string; title: string; author: string; visibility: string; regs: string[]; inds: string[]; visibleToOrgIds?: string[] }>>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packSearch, setPackSearch] = useState("");
  const [packVisibilityFilter, setPackVisibilityFilter] = useState<"all" | "author" | "org" | "marketplace">("all");
  const [editingPackOrgs, setEditingPackOrgs] = useState<string | null>(null);

  const isSuper = profile?.user.platformRole === "superadmin";

  const fetchNoOrgUsers = useCallback(async () => {
    try {
      const all = await api<{ id: string; email: string; name: string; platformRole: string; isActive: boolean; memberships: { org_id: string }[] }[]>("/api/admin/users");
      setNoOrgUsers(all.filter((u) => u.memberships.length === 0 && u.platformRole !== "superadmin"));
    } catch {}
  }, []);

  const fetchPacks = useCallback(async () => {
    if (!isSuper) return;
    setPacksLoading(true);
    try {
      const res = await api<{ packs: Array<{ id: string; title: string; author: string; visibility: string; regs: string[]; inds: string[]; visibleToOrgIds?: string[] }> }>("/api/compliance/packs");
      setPacks(res.packs);
    } catch (err) {
      console.error(err);
    } finally {
      setPacksLoading(false);
    }
  }, [isSuper]);

  const refresh = useCallback(() => {
    api<OrgRow[]>("/api/admin/organizations").then((orgs) => {
      setOrgs(orgs);
      orgs.forEach((o) => {
        if (!orgConfigs[o.id]) {
          api<Record<string, unknown>>(`/api/admin/organizations/${o.id}/config`).then((cfg) => {
            setOrgConfigs((p) => ({ ...p, [o.id]: cfg as any }));
          }).catch(() => {});
        }
      });
    }).catch(() => {});
    api<UsgRow[]>("/api/admin/usage").then(setUsage).catch(() => {});
    fetchPacks();
  }, [fetchPacks]);

  useEffect(() => {
    api<ProfileData>("/api/profile").then(setProfile).catch(() => {});
    refresh();
    fetchNoOrgUsers();
  }, [refresh, fetchNoOrgUsers]);

  useEffect(() => {
    if (profile && profile.user.platformRole !== "superadmin" && orgs.length > 0 && !expanded) {
      expandOrg(orgs[0]!.id);
    }
  }, [profile, orgs]);

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api("/api/admin/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: coN }) }); setShowCO(false); setCoN(""); refresh(); }
    catch (err) { alert((err as Error).message); }
  };

  const expandOrg = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    try {
      const [d, cfg, pu] = await Promise.all([
        api<{ members: MemInfo[] }>(`/api/admin/organizations/${id}`),
        api<{ llmModel?: string; llmProvider?: string; temperature?: number; maxTokens?: number; usageLimit?: number; usageLimitPeriod?: "monthly" | "total"; tokenPrice?: number; expertLimit?: number; pricing?: Record<string, { input: number; output: number }> }>(`/api/admin/organizations/${id}/config`).catch((): { llmModel?: string; llmProvider?: string; temperature?: number; maxTokens?: number; usageLimit?: number; usageLimitPeriod?: "monthly" | "total"; tokenPrice?: number; expertLimit?: number; pricing?: Record<string, { input: number; output: number }> } => ({})),
        api<{ perUser: { userId: string; totalCost: number; totalSessions: number; totalQuantity: number }[] }>(`/api/admin/usage/${id}`).catch(() => ({ perUser: [] })),
      ]);
      setOrgDets((p) => ({ ...p, [id]: d }));
      setOrgConfigs((p) => ({ ...p, [id]: cfg }));
      setPerUserUsage((p) => ({ ...p, [id]: pu.perUser }));
      setCfgDrafts((p) => ({
        ...p,
        [id]: {
          llmModel: cfg.llmModel ?? "deepseek-v4-flash",
          llmProvider: cfg.llmProvider ?? "anthropic",
          temperature: cfg.temperature != null ? String(cfg.temperature) : "0.7",
          maxTokens: cfg.maxTokens != null ? String(cfg.maxTokens) : "4096",
          usageLimit: cfg.usageLimit != null ? String(cfg.usageLimit) : "",
          usageLimitPeriod: cfg.usageLimitPeriod ?? "monthly",
          tokenPrice: cfg.tokenPrice != null ? String(cfg.tokenPrice) : "",
          expertLimit: cfg.expertLimit != null ? String(cfg.expertLimit) : "",
          pricing: cfg.pricing ? Object.fromEntries(
            Object.entries(cfg.pricing).map(([k, v]) => [k, { input: String(v.input ?? ""), output: String(v.output ?? "") }])
          ) : {},
        },
      }));
      setExpanded(id);
    } catch (err) { alert((err as Error).message); }
  };

  const addNoOrgMember = async (userId: string) => {
    if (!addUserOrg) return;
    try {
      await api(`/api/admin/organizations/${addUserOrg}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: addUserRole }) });
      setAddingUser(null); setAddUserOrg(""); setAddUserRole("tester");
      await fetchNoOrgUsers();
      if (expanded) await reloadOrg(expanded);
      refresh();
    } catch (err) { alert((err as Error).message); }
  };

  const removeMember = async (oid: string, uid: string) => {
    if (!confirm("Remove member?")) return;
    try {
      await api(`/api/admin/organizations/${oid}/members?userId=${uid}`, { method: "DELETE" });
      reloadOrg(oid); refresh();
    } catch (err) { alert((err as Error).message); }
  };

  const reloadOrg = async (oid: string) => {
    const d = await api<{ members: MemInfo[] }>(`/api/admin/organizations/${oid}`);
    setOrgDets((p) => ({ ...p, [oid]: d }));
  };

  const removeUser = async (id: string, email: string) => {
    if (!confirm(`Delete user "${email}" entirely?`)) return;
    try {
      await api(`/api/admin/users/${id}`, { method: "DELETE" });
      await fetchNoOrgUsers();
      refresh();
    } catch (err) { alert((err as Error).message); }
  };

  const toggleActive = async (id: string, v: boolean) => {
    try { await api(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: v }) }); if (expanded) reloadOrg(expanded); refresh(); }
    catch (err) { alert((err as Error).message); }
  };

  const memberRoleChg = async (oid: string, uid: string, r: "admin" | "expert" | "tester") => {
    try {
      await api(`/api/admin/organizations/${oid}/members`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, role: r }) });
      reloadOrg(oid);
    } catch (err) { alert((err as Error).message); }
  };

  const saveOrgConfig = async (oid: string) => {
    const d = cfgDrafts[oid];
    if (!d) return;
    try {
      const pricingPayload = Object.fromEntries(
        Object.entries(d.pricing ?? {}).flatMap(([k, v]) => {
          const inp = parseFloat(v.input);
          const out = parseFloat(v.output);
          return isNaN(inp) || isNaN(out) ? [] : [[k, { input: inp, output: out } as { input: number; output: number }]];
        })
      );
      await api(`/api/admin/organizations/${oid}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmModel: d.llmModel,
          llmProvider: d.llmProvider,
          temperature: d.temperature ? parseFloat(d.temperature) : undefined,
          maxTokens: d.maxTokens ? parseInt(d.maxTokens, 10) : undefined,
          usageLimit: d.usageLimit ? parseFloat(d.usageLimit) : undefined,
          usageLimitPeriod: d.usageLimitPeriod,
          tokenPrice: d.tokenPrice ? parseFloat(d.tokenPrice) : undefined,
          expertLimit: d.expertLimit ? parseInt(d.expertLimit, 10) : undefined,
          pricing: Object.keys(pricingPayload).length > 0 ? pricingPayload : undefined,
        }),
      });
      const savedPricing = Object.keys(pricingPayload).length > 0 ? pricingPayload : undefined;
      setOrgConfigs((p) => ({ ...p, [oid]: { llmModel: d.llmModel, llmProvider: d.llmProvider, temperature: d.temperature ? parseFloat(d.temperature) : undefined, maxTokens: d.maxTokens ? parseInt(d.maxTokens, 10) : undefined, usageLimit: d.usageLimit ? parseFloat(d.usageLimit) : undefined, usageLimitPeriod: d.usageLimitPeriod, tokenPrice: d.tokenPrice ? parseFloat(d.tokenPrice) : undefined, expertLimit: d.expertLimit ? parseInt(d.expertLimit, 10) : undefined, pricing: savedPricing } }));
    } catch (err) { alert((err as Error).message); }
  };

  const updatePackVisibility = async (packId: string, visibility: "author" | "org" | "marketplace") => {
    try {
      const body: Record<string, unknown> = { visibility };
      if (visibility !== "org") body.visibleToOrgIds = [];
      await api(`/api/compliance/packs/${packId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      fetchPacks();
    } catch (err) { alert((err as Error).message); }
  };

  const updatePackOrgs = async (packId: string, orgIds: string[]) => {
    try {
      await api(`/api/compliance/packs/${packId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibleToOrgIds: orgIds }),
      });
      fetchPacks();
    } catch (err) { alert((err as Error).message); }
  };

  const updateCfgDraft = (oid: string, patch: Partial<{ llmModel: string; llmProvider: string; temperature: string; maxTokens: string; usageLimit: string; usageLimitPeriod: "monthly" | "total"; tokenPrice: string; expertLimit: string; pricing: Record<string, { input: string; output: string }> }>) =>
    setCfgDrafts((p) => ({ ...p, [oid]: { llmModel: "deepseek-v4-flash", llmProvider: "", temperature: "0.7", maxTokens: "4096", usageLimit: "", usageLimitPeriod: "monthly" as const, tokenPrice: "", expertLimit: "", pricing: Object.fromEntries(pricingEventTypes.map((t) => [t, { input: "", output: "" }])), ...p[oid], ...patch } }));

  const usageMap = Object.fromEntries(usage.map((u) => [u.tenantId, u]));

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-primary)" }}>
      <div className="max-w-4xl mx-auto p-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <a
                href="/"
                className="text-xs px-2 py-1 rounded border transition-opacity cursor-pointer no-underline"
                style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
              >← Back</a>
              <h1 className="text-xl font-medium" style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: "italic" }}>
                Admin
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
              {orgs.length} org{orgs.length !== 1 ? "s" : ""}
              {isSuper && ` · ${usage.length} with usage`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreateUserDialog orgs={orgs} expandedOrg={expanded} isSuper={isSuper} onCreated={() => { refresh(); fetchNoOrgUsers(); if (expanded) reloadOrg(expanded); }} />
            {isSuper && (
              <Button variant="outline" size="sm" onClick={() => setShowCO(!showCO)}>
                {showCO ? "Cancel" : "+ Org"}
              </Button>
            )}
          </div>
        </div>

        {/* Create Org Inline */}
        {showCO && (
          <Card className="border-dashed">
            <CardContent className="pt-4">
              <form onSubmit={createOrg} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-muted)" }}>Organization name</label>
                  <Input placeholder="e.g. Acme Corp" value={coN} onChange={(e) => setCoN(e.target.value)} required />
                </div>
                <Button type="submit">Create</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b pb-px" style={{ borderColor: "var(--color-border-default)" }}>
          {(["orgs", "packs", "audit"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 text-xs font-medium uppercase tracking-wider transition-all cursor-pointer border-b-2 -mb-px"
              style={{
                color: tab === t ? "var(--color-accent-blue)" : "var(--color-text-muted)",
                borderColor: tab === t ? "var(--color-accent-blue)" : "transparent",
                background: "transparent",
                fontFamily: '"DM Sans", sans-serif',
              }}
            >{t === "orgs" ? "Organizations" : t === "packs" ? "Packs" : "Audit Log"}</button>
          ))}
        </div>

        {/* ORGS TAB */}
        {tab === "orgs" && (
          <div className="space-y-1">
            {orgs.length === 0 && (
              <p className="text-center py-16 text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                — no organizations —
              </p>
            )}

            {/* undefined org */}
            {noOrgUsers.length > 0 && (
              <div className="mb-1">
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border"
                  style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border-default)", borderRadius: 8, borderBottom: "none", cursor: "default" }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium shrink-0" style={{ background: "rgba(112,106,95,0.1)", color: "var(--color-text-muted)", fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    ?
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>undefined org</span>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{noOrgUsers.length} mem</span>
                </div>
                <div className="px-4 pb-4 rounded-b-lg border" style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border-default)", borderTop: "none" }}>
                  {noOrgUsers.map((u) => (
                    <div key={u.id}>
                      <div className="flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors hover:bg-muted/50">
                        <div className="flex-1 min-w-0 text-xs leading-tight">
                          <div className="truncate font-medium" style={{ color: "var(--color-text-header)" }}>{u.email}</div>
                          <div style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{u.name}</div>
                        </div>
                        <button
                          onClick={() => { setAddingUser(addingUser === u.id ? null : u.id); setAddUserOrg(""); }}
                          className="text-[10px] px-1.5 py-0.5 rounded border transition-opacity cursor-pointer shrink-0"
                          style={{ borderColor: "var(--color-accent-blue)", color: "var(--color-accent-blue)", background: "transparent", fontFamily: "'JetBrains Mono', monospace" }}
                        >{addingUser === u.id ? "Cancel" : "+ org"}</button>
                        <button
                          onClick={() => removeUser(u.id, u.email)}
                          className="text-[10px] px-1.5 py-0.5 rounded border transition-opacity cursor-pointer shrink-0 opacity-40 hover:opacity-100"
                          style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", background: "transparent", fontFamily: "'JetBrains Mono', monospace" }}
                        >del</button>
                      </div>
                      {addingUser === u.id && (
                        <div className="flex gap-2 items-center px-2.5 pb-2">
                          <select
                            value={addUserOrg}
                            onChange={(e) => setAddUserOrg(e.target.value)}
                            className="text-xs px-2 py-1 rounded border bg-transparent outline-none flex-1"
                            style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                            required
                          >
                            <option value="">Select org…</option>
                            {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
                          </select>
                          <select
                            value={addUserRole}
                            onChange={(e) => setAddUserRole(e.target.value as "admin" | "expert" | "tester")}
                            className="text-xs px-2 py-1 rounded border bg-transparent outline-none cursor-pointer"
                            style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                          >
                            <option value="admin">admin</option>
                            <option value="expert">expert</option>
                            <option value="tester">tester</option>
                          </select>
                          <Button size="xs" onClick={() => addNoOrgMember(u.id)} disabled={!addUserOrg}>Add</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {orgs.map((o) => {
              const members = expanded === o.id ? (orgDets[o.id]?.members ?? null) : null;
              const u = usageMap[o.id];
              return (
                <div key={o.id}>
                  {/* Org Row */}
                  <div
                    onClick={() => expandOrg(o.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
                    style={{
                      background: members ? "var(--color-bg-card)" : "transparent",
                      border: members ? "1px solid var(--color-border-default)" : "1px solid transparent",
                      marginBottom: members ? 0 : 0,
                      borderBottom: members ? "none" : "1px solid var(--color-border-default)",
                      borderRadius: members ? "8px 8px 0 0" : 0,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium shrink-0"
                      style={{ background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)", fontFamily: "'Instrument Serif', Georgia, serif" }}
                    >
                      {o.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text-header)" }}>{o.name}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{o.slug}</span>
                    </div>
                    <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{Math.max(0, o.member_count - 1)} mem</span>
                    {(() => {
                      const cfg = orgConfigs[o.id];
                      return (
                        <>
                          {u && (
                            <>
                              <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{u.totalSessions} ses</span>
                              <span className="text-xs font-medium shrink-0" style={{ color: u.totalCost > 0 ? "var(--color-amber)" : "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                                ¥{u.totalCost.toFixed(2)}
                              </span>
                            </>
                          )}
                          {cfg?.usageLimit != null && (
                            <span className="text-xs shrink-0" style={{ color: "var(--color-amber)", fontFamily: "'JetBrains Mono', monospace" }}>lim ¥{cfg.usageLimit}{cfg.usageLimitPeriod === "total" ? "" : "/mo"}</span>
                          )}
                        </>
                      );
                    })()}
                    {isSuper && (
                      <button
                        onClick={(e) => { e.stopPropagation(); api(`/api/admin/organizations/${o.id}`, { method: "DELETE" }).then(() => { if (expanded === o.id) setExpanded(null); refresh(); fetchNoOrgUsers(); }).catch((err) => alert(err.message)); }}
                      className="text-[10px] px-1.5 py-0.5 rounded border transition-opacity cursor-pointer shrink-0 opacity-40 hover:opacity-100"
                      style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", background: "transparent", fontFamily: "'JetBrains Mono', monospace" }}
                    >del</button>
                    )}
                    <svg
                      className="w-3 h-3 shrink-0 transition-transform"
                      style={{ color: "var(--color-text-muted)", transform: members ? "rotate(180deg)" : "none" }}
                      viewBox="0 0 12 12" fill="none"
                    >
                      <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>

                  {/* Expanded Members + Config */}
                  {members && (
                    <div
                      className="px-4 pb-4 rounded-b-lg border"
                      style={{
                        background: "var(--color-bg-card)",
                        borderColor: "var(--color-border-default)",
                        borderTop: "none",
                      }}
                    >
                      <div className="flex flex-col gap-6 pt-3">
                        {/* ── Top: Org Settings ── */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-0.5 rounded-full" style={{ background: "var(--color-border-default)" }} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Org Settings</span>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-muted)" }}>LLM Model</label>
                              <select
                                value={cfgDrafts[o.id]?.llmModel ?? "deepseek-v4-flash"}
                                onChange={(e) => updateCfgDraft(o.id, { llmModel: e.target.value })}
                                className="w-full px-2 py-1.5 rounded border bg-transparent outline-none cursor-pointer text-xs"
                                style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                              >
                                <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-muted)" }}>Temperature</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range" min="0" max="2" step="0.1"
                                  value={parseFloat(cfgDrafts[o.id]?.temperature ?? "0.7")}
                                  onChange={(e) => updateCfgDraft(o.id, { temperature: e.target.value })}
                                  className="flex-1"
                                />
                                <span className="text-xs font-mono w-8 text-right" style={{ color: "var(--color-text-body)" }}>{cfgDrafts[o.id]?.temperature ?? "0.7"}</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-muted)" }}>Max Tokens</label>
                              <input
                                type="number"
                                value={cfgDrafts[o.id]?.maxTokens ?? "4096"}
                                onChange={(e) => updateCfgDraft(o.id, { maxTokens: e.target.value })}
                                className="w-full px-2 py-1.5 rounded border bg-transparent outline-none text-xs"
                                style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                              />
                            </div>
                            {/* Usage against limit */}
                            {(() => {
                              const cfg = orgConfigs[o.id];
                              const limit = cfg?.usageLimit;
                              const d = cfgDrafts[o.id];
                              const users = perUserUsage[o.id] ?? [];
                              const totalRmb = users.reduce((s, u) => s + u.totalCost, 0);
                              return (
                                <div className="pt-2 border-t" style={{ borderColor: "var(--color-border-default)" }}>
                                  <label className="text-xs font-medium mb-2 block" style={{ color: "var(--color-text-muted)" }}>
                                    Total Usage{cfg?.usageLimitPeriod === "total" ? "" : " (this month)"}
                                  </label>
                                  <div className="grid grid-cols-3 gap-2 mb-2">
                                    <div className="p-2 rounded" style={{ background: "var(--color-bg-dark)" }}>
                                      <div className="text-[10px]" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>Sessions</div>
                                      <div className="text-sm font-semibold" style={{ color: "var(--color-text-header)" }}>{u?.totalSessions ?? 0}</div>
                                    </div>
                                    <div className="p-2 rounded" style={{ background: "var(--color-bg-dark)" }}>
                                      <div className="text-[10px]" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>Cost</div>
                                      <div className="text-sm font-semibold" style={{ color: "var(--color-accent-blue)" }}>
                                        ¥{totalRmb.toFixed(2)}
                                      </div>
                                    </div>
                                    <div className="p-2 rounded" style={{ background: "var(--color-bg-dark)" }}>
                                      <div className="text-[10px]" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>Limit</div>
                                      <div className="text-sm font-semibold" style={{ color: limit != null ? "var(--color-amber)" : "var(--color-text-muted)" }}>
                                        {limit != null ? `¥${limit}` : "not set"}
                                      </div>
                                    </div>
                                    {isSuper && (
                                      <div className="p-2 rounded" style={{ background: "var(--color-bg-dark)" }}>
                                        <div className="text-[10px]" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>Events</div>
                                        <div className="text-[10px] font-semibold truncate" style={{ color: "var(--color-accent-blue)" }}>
                                          {cfg?.pricing ? Object.keys(cfg.pricing).length + " configured" : "flat rate"}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {limit != null && (
                                    <div className="mb-3">
                                      <div className="flex justify-between text-[10px] mb-1" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                                        <span>¥{totalRmb.toFixed(2)} / ¥{limit}</span>
                                        <span>{Math.min(Math.round((totalRmb / limit) * 100), 100)}%</span>
                                      </div>
                                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-dark)" }}>
                                        <div
                                          className="h-full rounded-full transition-all"
                                          style={{
                                            width: `${Math.min((totalRmb / limit) * 100, 100)}%`,
                                            background: totalRmb > limit ? "var(--color-danger)" : "var(--color-accent-blue)",
                                          }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {isSuper && d && (
                                    <div className="p-2 rounded space-y-1.5" style={{ background: "var(--color-bg-dark)" }}>
                                      <div className="flex gap-2 items-center">
                                        <label className="text-[10px] font-medium shrink-0" style={{ color: "var(--color-text-muted)" }}>Limit</label>
                                        <div className="relative flex-1">
                                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "var(--color-text-muted)" }}>¥</span>
                                          <input
                                            type="number" min="0" step="0.01"
                                            placeholder="no limit"
                                            value={d.usageLimit}
                                            onChange={(e) => updateCfgDraft(o.id, { usageLimit: e.target.value })}
                                            className="w-full pl-4 pr-1.5 py-1 rounded border bg-transparent outline-none text-[10px]"
                                            style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                                          />
                                        </div>
                                        <select
                                          value={d.usageLimitPeriod}
                                          onChange={(e) => updateCfgDraft(o.id, { usageLimitPeriod: e.target.value as "monthly" | "total" })}
                                          className="px-1.5 py-1 rounded border bg-transparent outline-none cursor-pointer text-[10px]"
                                          style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                                        >
                                          <option value="monthly">/month</option>
                                          <option value="total">total</option>
                                        </select>
                                      </div>
                                      <div className="flex gap-2 items-center">
                                        <label className="text-[10px] font-medium shrink-0" style={{ color: "var(--color-text-muted)" }}>Price</label>
                                        <input
                                          type="number" min="0" step="0.01"
                                          placeholder="0.025"
                                          value={d.tokenPrice}
                                          onChange={(e) => updateCfgDraft(o.id, { tokenPrice: e.target.value })}
                                          className="flex-1 px-1.5 py-1 rounded border bg-transparent outline-none text-[10px]"
                                          style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                                        />
                                        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>¥/1K</span>
                                      </div>
                                      <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium" style={{ color: "var(--color-text-muted)" }}>Per-Event Pricing</label>
                                        <div className="flex flex-wrap gap-2">
                                          {pricingEventTypes.map((et) => {
                                            const ep = d.pricing?.[et];
                                            return (
                                              <div key={et} className="flex-1 min-w-[160px] p-1.5 rounded" style={{ background: "var(--color-bg-primary)" }}>
                                                <div className="text-[9px] font-mono mb-1 truncate" style={{ color: "var(--color-text-muted)" }}>{et}</div>
                                                <div className="flex gap-1">
                                                  <div className="flex-1">
                                                    <label className="text-[8px] block" style={{ color: "var(--color-text-muted)" }}>Input ¥/1K</label>
                                                    <input
                                                      type="number" min="0" step="0.0001"
                                                      placeholder="–"
                                                      value={ep?.input ?? ""}
                                                      onChange={(e) => {
                                                        const next = { ...d.pricing, [et]: { input: e.target.value, output: ep?.output ?? "" } };
                                                        updateCfgDraft(o.id, { pricing: next });
                                                      }}
                                                      className="w-full px-1 py-0.5 rounded border bg-transparent outline-none text-[10px]"
                                                      style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                                                    />
                                                  </div>
                                                  <div className="flex-1">
                                                    <label className="text-[8px] block" style={{ color: "var(--color-text-muted)" }}>Output ¥/1K</label>
                                                    <input
                                                      type="number" min="0" step="0.0001"
                                                      placeholder="–"
                                                      value={ep?.output ?? ""}
                                                      onChange={(e) => {
                                                        const next = { ...d.pricing, [et]: { input: ep?.input ?? "", output: e.target.value } };
                                                        updateCfgDraft(o.id, { pricing: next });
                                                      }}
                                                      className="w-full px-1 py-0.5 rounded border bg-transparent outline-none text-[10px]"
                                                      style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div className="flex gap-2 items-center">
                                        <label className="text-[10px] font-medium shrink-0" style={{ color: "var(--color-text-muted)" }}>Expert Limit</label>
                                        <input
                                          type="number" min="0" step="1"
                                          placeholder="no limit"
                                          value={d.expertLimit}
                                          onChange={(e) => updateCfgDraft(o.id, { expertLimit: e.target.value })}
                                          className="flex-1 px-1.5 py-1 rounded border bg-transparent outline-none text-[10px]"
                                          style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                                        />
                                        <Button size="xs" onClick={() => saveOrgConfig(o.id)}>Save</Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* ── Bottom: Members ── */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-0.5 rounded-full" style={{ background: "var(--color-border-default)" }} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Members</span>
                            {(() => {
                              const cfg = orgConfigs[o.id];
                              const limit = cfg?.expertLimit;
                              if (limit == null) return null;
                              const expertCount = members.filter((m) => m.role === "expert" && m.platform_role !== "superadmin").length;
                              return (
                                <span className="text-[10px] ml-auto" style={{ color: expertCount >= limit ? "var(--color-danger)" : "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                                  experts: {expertCount}/{limit}
                                </span>
                              );
                            })()}
                          </div>

                          {(() => {
                            const visible = members.filter((m) => m.platform_role !== "superadmin");
                            const memberUsageMap = Object.fromEntries((perUserUsage[o.id] ?? []).map((u) => [u.userId, u]));
                            if (visible.length === 0) return <p className="text-xs py-2" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>— no members —</p>;
                            return (
                            <div className="space-y-1 mb-3">
                              {visible.map((m) => {
                                const pu = memberUsageMap[m.id];
                                const price = orgConfigs[o.id]?.tokenPrice ?? 0.025;
                                const rmb = pu ? pu.totalQuantity / 1000 * price : 0;
                                return (
                                <div
                                  key={m.id}
                                  className="flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors hover:bg-muted/50"
                                >
                                  <div className="flex-1 min-w-0 text-xs leading-tight">
                                    <div className="truncate font-medium" style={{ color: "var(--color-text-header)" }}>{m.email}</div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <Badge variant="outline" className={roleClasses[m.role] ?? ""} style={{ fontSize: 9, padding: "0 4px", height: "auto", lineHeight: "14px" }}>{m.role}</Badge>
                                      <span style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                                        ¥{rmb.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                  {m.role !== "admin" && (
                                    <select
                                      value={m.role}
                                      onChange={(e) => memberRoleChg(o.id, m.id, e.target.value as "admin" | "expert" | "tester")}
                                      className="text-[10px] px-1 py-0.5 rounded border bg-transparent cursor-pointer outline-none shrink-0"
                                      style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)", fontFamily: "'JetBrains Mono', monospace" }}
                                    >
                                      <option value="expert">expert</option>
                                      <option value="tester">tester</option>
                                    </select>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleActive(m.id, !m.is_active); }}
                                    className="text-[10px] px-1.5 py-0.5 rounded border transition-opacity cursor-pointer shrink-0 opacity-50 hover:opacity-100"
                                    style={{ borderColor: m.is_active ? "var(--color-success)" : "var(--color-amber)", color: m.is_active ? "var(--color-success)" : "var(--color-amber)", background: "transparent", fontFamily: "'JetBrains Mono', monospace" }}
                                  >{m.is_active ? "disable" : "enable"}</button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeMember(o.id, m.id); }}
                                    className="text-[10px] px-1.5 py-0.5 rounded border transition-opacity cursor-pointer shrink-0 opacity-50 hover:opacity-100"
                                    style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", background: "transparent", fontFamily: "'JetBrains Mono', monospace" }}
                                  >rm</button>
                                </div>
                                );
                              })}
                            </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* AUDIT TAB */}
        {tab === "audit" && <AdminAuditPanel />}

        {/* PACKS TAB (superadmin only) */}
        {tab === "packs" && isSuper && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <h2 className="text-lg font-medium" style={{ color: "var(--color-text-header)" }}>Packs Management</h2>
              <div className="flex gap-2 flex-wrap">
                <Input
                  placeholder="Search packs..."
                  value={packSearch}
                  onChange={(e) => setPackSearch(e.target.value)}
                  className="w-64"
                  style={{ fontSize: 13 }}
                />
                <select
                  value={packVisibilityFilter}
                  onChange={(e) => setPackVisibilityFilter(e.target.value as "all" | "author" | "org" | "marketplace")}
                  className="px-2 py-1.5 rounded border bg-transparent outline-none text-xs cursor-pointer"
                  style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                >
                  <option value="all">All Visibility</option>
                  <option value="author">Author Only</option>
                  <option value="org">Org Visible</option>
                  <option value="marketplace">Marketplace</option>
                </select>
              </div>
            </div>

            {packsLoading ? (
              <p className="text-center py-8 text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>Loading packs...</p>
            ) : (
              <div className="rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <thead>
                      <tr style={{ background: "var(--color-bg-dark)" }}>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Pack</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Author</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Visibility</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Regulations</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Industries</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-text-muted)" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packs
                        .filter((p) => {
                          if (packSearch) {
                            const q = packSearch.toLowerCase();
                            if (!p.title.toLowerCase().includes(q) && !p.author.toLowerCase().includes(q)) return false;
                          }
                          if (packVisibilityFilter !== "all" && p.visibility !== packVisibilityFilter) return false;
                          return true;
                        })
                        .map((p) => (
                          <tr key={p.id} className="border-t" style={{ borderColor: "var(--color-border-default)" }}>
                            <td className="px-3 py-2 font-medium" style={{ color: "var(--color-text-header)" }}>{p.title}</td>
                            <td className="px-3 py-2" style={{ color: "var(--color-text-body)" }}>{p.author || "—"}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                <select
                                  value={p.visibility}
                                  onChange={(e) => updatePackVisibility(p.id, e.target.value as "author" | "org" | "marketplace")}
                                  className="px-2 py-1 rounded border bg-transparent outline-none cursor-pointer text-[10px]"
                                  style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-body)" }}
                                >
                                  <option value="author">Author</option>
                                  <option value="org">Org</option>
                                  <option value="marketplace">Marketplace</option>
                                </select>
                                {p.visibility === "org" && (
                                  <div className="relative">
                                    <button
                                      onClick={() => setEditingPackOrgs(editingPackOrgs === p.id ? null : p.id)}
                                      className="text-[10px] px-1.5 py-0.5 rounded border transition-opacity cursor-pointer text-left"
                                      style={{ borderColor: "var(--color-border-input)", color: "var(--color-text-muted)", background: "var(--color-bg-dark)" }}
                                    >
                                      {p.visibleToOrgIds?.length
                                        ? p.visibleToOrgIds.map((oid) => orgs.find((o) => o.id === oid)?.name ?? oid.slice(0, 8)).join(", ")
                                        : "— select orgs —"}
                                    </button>
                                    {editingPackOrgs === p.id && (
                                      <div
                                        className="absolute z-10 mt-1 p-2 rounded border shadow-lg"
                                        style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border-default)", minWidth: 220 }}
                                      >
                                        <div className="max-h-40 overflow-y-auto space-y-1">
                                          {orgs.map((o) => {
                                            const checked = p.visibleToOrgIds?.includes(o.id) ?? false;
                                            return (
                                              <label key={o.id} className="flex items-center gap-1.5 cursor-pointer text-[10px] px-1 py-0.5 rounded hover:bg-muted/50">
                                                <input
                                                  type="checkbox"
                                                  checked={checked}
                                                  onChange={() => {
                                                    const next = checked
                                                      ? (p.visibleToOrgIds ?? []).filter((id) => id !== o.id)
                                                      : [...(p.visibleToOrgIds ?? []), o.id];
                                                    updatePackOrgs(p.id, next);
                                                  }}
                                                />
                                                <span style={{ color: "var(--color-text-body)" }}>{o.name}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{p.regs.join(", ") || "—"}</td>
                            <td className="px-3 py-2" style={{ color: "var(--color-text-muted)" }}>{p.inds.join(", ") || "—"}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => {
                                  if (confirm(`Delete pack "${p.title}"?`)) {
                                    api(`/api/compliance/packs/${p.id}`, { method: "DELETE" }).then(fetchPacks).catch((err) => alert(err.message));
                                  }
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded border transition-opacity cursor-pointer opacity-50 hover:opacity-100"
                                style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", background: "transparent", fontFamily: "'JetBrains Mono', monospace" }}
                              >del</button>
                            </td>
                          </tr>
                        ))}
                      {packs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--color-text-muted)" }}>
                            — no packs —
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
