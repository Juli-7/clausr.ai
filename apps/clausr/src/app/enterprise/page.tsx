"use client";

import Link from "next/link";

const features = [
  {
    icon: "📁",
    title: "Client / Project Management",
    desc: "Group compliance sessions by client or project. Assign auditors, set deadlines, track overall progress across all sessions in one dashboard.",
    mockup: (
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)" }}
      >
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: "var(--color-text-body)", fontWeight: 600 }}>Projects</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <span style={{ fontSize: 6, padding: "1px 5px", borderRadius: 3, background: "var(--color-bg-card)", color: "var(--color-text-muted)" }}>All</span>
            <span style={{ fontSize: 6, padding: "1px 5px", borderRadius: 3, background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)" }}>Active</span>
            <span style={{ fontSize: 6, padding: "1px 5px", borderRadius: 3, background: "var(--color-bg-card)", color: "var(--color-text-muted)" }}>Archived</span>
          </div>
        </div>
        {/* Kanban board */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          {[
            { title: "To do", count: 3, color: "var(--color-text-muted)", cards: ["CE marking review", "Draft doc package"] },
            { title: "In progress", count: 4, color: "var(--color-accent-blue)", cards: ["EU-MDR gap analysis", "Risk assessment"] },
            { title: "Done", count: 7, color: "var(--color-success)", cards: ["ISO 27001 audit", "EMC pre-check"] },
          ].map((col) => (
            <div key={col.title} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 6, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{col.title}</span>
                <span style={{ fontSize: 6, color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{col.count}</span>
              </div>
              {col.cards.map((card) => (
                <div
                  key={card}
                  style={{
                    padding: "5px 7px",
                    marginBottom: 3,
                    borderRadius: 5,
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border-default)",
                    fontSize: 6.5,
                    color: "var(--color-text-body)",
                    lineHeight: 1.4,
                  }}
                >
                  {card}
                  <div style={{ marginTop: 3, display: "flex", gap: 2 }}>
                    <span style={{ fontSize: 5, padding: "1px 3px", borderRadius: 2, background: col.color === "var(--color-accent-blue)" ? "rgba(59,130,246,0.12)" : "var(--color-bg-dark)", color: "var(--color-text-muted)" }}>
                      {col.title === "In progress" ? "2 open" : col.title === "Done" ? "✓ closed" : "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: "⚡",
    title: "Batch Audit",
    desc: "Run compliance audit across all sessions in a project at once. Get a consolidated project-level report instead of reviewing sessions one by one.",
    mockup: (
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)" }}
      >
        <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--color-border-default)" }}>
          <span style={{ fontSize: 10 }}>☰</span>
          <span style={{ fontSize: 8, color: "var(--color-text-body)", fontWeight: 500 }}>Batch audit — Medical Devices</span>
        </div>
        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["EU-MDR", "ISO 27001", "EU-EMC"].map((tag) => (
              <span
                key={tag}
                style={{ fontSize: 7, padding: "2px 6px", borderRadius: 4, background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)" }}
              >
                {tag}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--color-border-default)", overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 2, background: "var(--color-accent-blue)" }} />
            </div>
            <span style={{ fontSize: 8, color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>3/3</span>
          </div>
          <div style={{ fontSize: 8, color: "var(--color-success)" }}>✓ All 3 packs passed</div>
        </div>
      </div>
    ),
  },
  {
    icon: "📋",
    title: "Template Library",
    desc: "Save frequently-used document field values as org-level templates. Reuse across sessions with one click.",
    mockup: (
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)" }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-default)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 8, color: "var(--color-text-body)", fontWeight: 500 }}>Org Templates</span>
            <span style={{ fontSize: 7, color: "var(--color-text-muted)" }}>3 saved</span>
          </div>
          {[
            { label: "Company Address", value: "No. 123, Changyang Rd, Shanghai" },
            { label: "Legal Entity", value: "Clausr AI Technology Co., Ltd." },
            { label: "Certifying Body", value: "TÜV Rheinland" },
          ].map((t) => (
            <div
              key={t.label}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", marginBottom: 3, borderRadius: 4, background: "var(--color-bg-card)" }}
            >
              <span style={{ fontSize: 7, color: "var(--color-text-muted)", width: 60, flexShrink: 0 }}>{t.label}</span>
              <span style={{ fontSize: 7, color: "var(--color-text-body)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.value}</span>
              <span style={{ fontSize: 7, color: "var(--color-accent-blue)" }}>Use</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: "🎨",
    title: "Report Customization",
    desc: "Brand your compliance reports with company logo, cover page, watermark, and custom layout. Choose which sections appear in the exported document.",
    mockup: (
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)" }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 8, color: "var(--color-text-body)", fontWeight: 500 }}>Report settings</span>
        </div>
        <div style={{ padding: "10px 12px" }}>
          {[
            { label: "Cover page", enabled: true },
            { label: "Company logo", enabled: true },
            { label: "Watermark", enabled: false },
            { label: "Table of contents", enabled: true },
            { label: "Signature block", enabled: false },
          ].map((s) => (
            <div
              key={s.label}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}
            >
              <span style={{ fontSize: 8, color: "var(--color-text-body)" }}>{s.label}</span>
              <div
                style={{
                  width: 22, height: 12, borderRadius: 6,
                  background: s.enabled ? "var(--color-accent-blue)" : "var(--color-border-default)",
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    width: 10, height: 10, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 1,
                    left: s.enabled ? 11 : 1,
                    transition: "left 0.2s",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: "✅",
    title: "Sign-off & Approval",
    desc: "Lock a completed audit with a digital sign-off. Track who approved what and when. Prevent further edits after approval.",
    mockup: (
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)" }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 8, color: "var(--color-text-body)", fontWeight: 500 }}>Sign-off required</span>
          <span style={{ fontSize: 7, color: "var(--color-warning)", marginLeft: "auto" }}>Pending</span>
        </div>
        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--color-accent-blue-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--color-accent-blue)" }}>JD</div>
            <div>
              <div style={{ fontSize: 8, color: "var(--color-text-header)", fontWeight: 500 }}>Jane Doe</div>
              <div style={{ fontSize: 7, color: "var(--color-text-muted)" }}>Quality Manager</div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 7, color: "var(--color-success)" }}>Signed 2d ago</div>
          </div>
          <div style={{ padding: "5px 8px", borderRadius: 4, background: "var(--color-bg-card)", border: "1px dashed var(--color-border-default)", fontSize: 8, color: "var(--color-text-muted)", textAlign: "center" }}>
            + Add approver
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: "📊",
    title: "Pack Analytics",
    desc: "See which packs are used most, which checks commonly fail, and how audit results trend over time. Make data-driven decisions about your compliance program.",
    mockup: (
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)" }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-default)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 8, color: "var(--color-text-body)", fontWeight: 500 }}>Pack usage — last 30 days</span>
        </div>
        <div style={{ padding: "10px 12px" }}>
          {[
            { name: "EU-MDR", pct: 85 },
            { name: "ISO 27001", pct: 62 },
            { name: "EU-EMC", pct: 45 },
            { name: "EU-LVD", pct: 30 },
          ].map((p) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 7, color: "var(--color-text-muted)", width: 48, flexShrink: 0 }}>{p.name}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--color-border-default)", overflow: "hidden" }}>
                <div style={{ width: `${p.pct}%`, height: "100%", borderRadius: 3, background: "var(--color-accent-blue)" }} />
              </div>
              <span style={{ fontSize: 7, color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace", width: 24, textAlign: "right" }}>{p.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export default function EnterprisePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center"
      style={{ background: "var(--color-bg-primary)" }}
    >
      {/* Nav */}
      <div
        className="w-full flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--color-border-default)" }}
      >
        <Link
          href="/"
          className="text-sm font-medium no-underline"
          style={{ color: "var(--color-accent-blue)" }}
        >
          ← Back to app
        </Link>
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          摇光合规助手 clausr.ai
        </span>
      </div>

      {/* Hero */}
      <div className="max-w-2xl w-full px-6 pt-20 pb-16 text-center">
        <div
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full mb-6"
          style={{
            background: "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))",
            color: "#b8960f",
            border: "1px solid rgba(212,175,55,0.25)",
          }}
        >
          ✨ Enterprise
        </div>
        <h1
          className="text-3xl font-bold mb-4 leading-tight"
          style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}
        >
          Compliance at scale
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-body)", maxWidth: 480, margin: "0 auto" }}>
          Everything in the free tier, plus project management, batch auditing, branded reports, team collaboration, and advanced analytics for organizations running compliance programs across multiple products and standards.
        </p>
      </div>

      {/* Features */}
      <div className="max-w-5xl w-full px-6 pb-24">
        <div className="flex flex-col gap-20">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`flex flex-col ${i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} items-center gap-8 md:gap-16`}
            >
              <div className="flex-1 w-full max-w-md">
                {f.mockup}
              </div>
              <div className="flex-1 max-w-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ fontSize: 18 }}>{f.icon}</span>
                  <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    {f.title}
                  </h2>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-body)", lineHeight: 1.7 }}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))",
              color: "#b8960f",
              border: "1px solid rgba(212,175,55,0.25)",
            }}
          >
            ✨
          </div>
          <p className="text-sm mb-4" style={{ color: "var(--color-text-body)" }}>
            Ready to scale your compliance program?
          </p>
          <a
            href="mailto:sales@clausr.ai"
            className="text-sm font-medium rounded-lg px-6 py-2.5 no-underline inline-block"
            style={{ background: "var(--color-accent-blue)", color: "#fff" }}
          >
            Contact sales
          </a>
        </div>
      </div>
    </div>
  );
}
