"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ProfileData {
  user: {
    id: string; email: string; name: string;
    platformRole: "superadmin" | "operator"; isActive: boolean;
    memberships: { organizationId: string; organizationName: string; organizationSlug: string; role: string }[];
  };
  usage: { totalCost: number; totalSessions: number; totalQuantity: number };
  orgUsage: { orgId: string; orgName: string; perUser: { userId: string; totalCost: number; totalSessions: number; totalQuantity: number }[]; config: { usageLimit?: number; usageLimitPeriod?: string; tokenPrice?: number } }[];
}

const roleStyle: Record<string, { fg: string; bg: string }> = {
  superadmin: { fg: "#b8943e", bg: "rgba(184,148,62,0.1)" },
  operator:   { fg: "#706a5f", bg: "rgba(112,106,95,0.1)" },
  admin:      { fg: "#b8943e", bg: "rgba(184,148,62,0.1)" },
  expert:     { fg: "#479ca8", bg: "rgba(71,156,168,0.1)" },
  tester:     { fg: "#706a5f", bg: "rgba(112,106,95,0.1)" },
};

function RoleBadge({ r }: { r: string }) {
  const s = roleStyle[r] ?? roleStyle.tester!;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 500, color: s.fg, background: s.bg, fontFamily: '"JetBrains Mono", monospace' }}><span style={{ width: 3, height: 3, borderRadius: "50%", background: s.fg }} />{r}</span>;
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMsg(null);
    if (!current || !next) { setMsg({ text: "Fill in all fields", ok: false }); return; }
    if (next !== confirm) { setMsg({ text: "New passwords do not match", ok: false }); return; }
    if (next.length < 6) { setMsg({ text: "Password must be at least 6 characters", ok: false }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ text: d.error || "Failed to change password", ok: false }); return; }
      setMsg({ text: "Password changed successfully", ok: true });
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(onClose, 1200);
    } catch { setMsg({ text: "Network error", ok: false }); }
    finally { setBusy(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: 5, border: "1px solid var(--color-border-input)",
    background: "transparent", outline: "none", fontSize: 13, color: "var(--color-text-body)",
    boxSizing: "border-box",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent style={{ background: "var(--color-bg-primary)", border: "1px solid var(--color-border-default)", borderRadius: 10, maxWidth: 380, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-header)", margin: "0 0 16px", fontFamily: "'Instrument Serif', Georgia, serif" }}>Change Password</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} style={inputStyle} />
          <input type="password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} style={inputStyle} />
          <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <button
              disabled={busy}
              onClick={submit}
              style={{
                padding: "6px 16px", borderRadius: 5, border: "none", fontSize: 12, fontWeight: 500,
                cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
                background: "var(--color-accent-blue)", color: "white",
              }}
            >
              {busy ? "Saving…" : "Change Password"}
            </button>
            {msg && <span style={{ fontSize: 11, color: msg.ok ? "var(--color-amber)" : "#c4717a" }}>{msg.text}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-text-muted)", margin: "0 0 8px" }}>Security</h2>
      <button
        onClick={() => setOpen(true)}
        className="hover:bg-[var(--color-accent-blue-bg)]"
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6,
          border: "1px solid var(--color-border-default)", background: "transparent",
          color: "var(--color-text-body)", fontSize: 12, fontWeight: 500, cursor: "pointer",
          transition: "background .1s", width: "100%",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        Change Password
      </button>
      <PasswordDialog open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

export function ProfileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open]);

  const isSuperOrAdmin = data
    ? data.user.platformRole === "superadmin" || data.user.memberships.some((m) => m.role === "admin")
    : false;

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent
        side="left"
        className="p-0"
        showCloseButton={false}
        style={{
          width: 400,
          maxWidth: 400,
          left: 56,
          background: "var(--color-bg-dark)",
          borderRight: "1px solid var(--color-border-input)",
        }}
      >
        <div className="flex flex-col h-full">
          <div
            className="flex items-center justify-between shrink-0 px-5 py-4"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <span className="font-bold text-base tracking-tight" style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Profile
            </span>
            <button
              className="h-7 w-7 flex items-center justify-center cursor-pointer rounded-lg transition-all duration-150"
              style={{ background: "transparent", border: "1px solid var(--color-border-input)", color: "var(--color-text-muted)" }}
              onClick={onClose}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {loading ? (
              <div style={{ textAlign: "center", color: "#706a5f", fontSize: 13, paddingTop: 40 }}>Loading…</div>
            ) : !data ? (
              <div style={{ textAlign: "center", color: "#c4717a", fontSize: 13, paddingTop: 40 }}>Failed to load profile</div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#2944AB", color: "white", fontSize: 16, fontWeight: 600, fontFamily: '"Instrument Serif", serif' }}>
                    {data.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text-header)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.user.name}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.user.email}</div>
                  </div>
                </div>

                {/* Organizations */}
                <section style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-text-muted)", margin: "0 0 8px" }}>Organizations</h2>
                  {data.user.memberships.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>Not assigned to any organization</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {data.user.memberships.map((m) => {
                        const ou = data.orgUsage.find((o) => o.orgId === m.organizationId);
                        const cfg = ou?.config;
                        return (
                        <div key={m.organizationId} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", border: "1px solid var(--color-border-default)", borderRadius: 6, background: "var(--color-bg-card)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)", fontSize: 12, fontWeight: 600, fontFamily: '"Instrument Serif", serif' }}>
                              {m.organizationName.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, fontSize: 13, color: "var(--color-text-header)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.organizationName}</div>
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: '"JetBrains Mono", monospace' }}>{m.organizationSlug}</div>
                            </div>
                            <RoleBadge r={m.role} />
                          </div>
                          {cfg && cfg.usageLimit != null && (
                            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--color-text-muted)", fontFamily: '"JetBrains Mono", monospace', paddingLeft: 36 }}>
                              <span>Limit: ¥{cfg.usageLimit}{cfg.usageLimitPeriod === "total" ? " total" : "/mo"}</span>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Personal Usage */}
                <section style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-text-muted)", margin: "0 0 8px" }}>Usage</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    <div style={{ padding: "10px", border: "1px solid var(--color-border-default)", borderRadius: 6, background: "var(--color-bg-card)" }}>
                      <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2, fontFamily: '"JetBrains Mono", monospace' }}>Sessions</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-header)" }}>{data.usage.totalSessions}</div>
                    </div>
                    <div style={{ padding: "10px", border: "1px solid var(--color-border-default)", borderRadius: 6, background: "var(--color-bg-card)" }}>
                      <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2, fontFamily: '"JetBrains Mono", monospace' }}>Cost (RMB)</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-accent-blue)" }}>¥{data.usage.totalCost.toFixed(2)}</div>
                    </div>
                  </div>
                </section>

                {/* Change Password */}
                <PasswordSection />

                {/* Legal / Disclosure */}
                <section style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-text-muted)", margin: "0 0 8px" }}>Information</h2>
                  <a href="/terms" className="hover:bg-[var(--color-accent-blue-bg)]" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border-default)", textDecoration: "none", color: "var(--color-text-body)", fontSize: 12, fontWeight: 500, transition: "background .1s", marginBottom: 4 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    Terms of Service
                  </a>
                  <a href="/disclosure" className="hover:bg-[var(--color-accent-blue-bg)]" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border-default)", textDecoration: "none", color: "var(--color-text-body)", fontSize: 12, fontWeight: 500, transition: "background .1s", marginBottom: 4 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    Service Disclosure
                  </a>
                  <a href="/contact" className="hover:bg-[var(--color-accent-blue-bg)]" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border-default)", textDecoration: "none", color: "var(--color-text-body)", fontSize: 12, fontWeight: 500, transition: "background .1s" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    Contact / Complaint
                  </a>
                </section>

                {/* Logout */}
                <section style={{ marginBottom: 16 }}>
                  <button
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST" });
                      window.location.href = "/login";
                    }}
                    className="hover:bg-[var(--color-accent-blue-bg)]"
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6,
                      border: "1px solid var(--color-border-default)", background: "transparent",
                      color: "var(--color-text-body)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                      transition: "background .1s", width: "100%",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Log Out
                  </button>
                </section>

                {/* Admin link */}
                {isSuperOrAdmin && (
                  <a href="/admin" className="hover:bg-[var(--color-accent-blue-bg)]" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border-default)", textDecoration: "none", color: "var(--color-text-body)", fontSize: 12, fontWeight: 500, transition: "background .1s" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4"/></svg>
                    Admin Panel
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
