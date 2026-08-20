"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ShareData {
  sessionId: string;
  createdAt: string;
  overall: "PASS" | "FAIL" | "PENDING";
  packs: {
    packId: string;
    title: string;
    verdict: string;
    checkResults: {
      name: string;
      verdict: string;
      finding?: string;
      citationRef?: string[];
    }[];
    sourceCitations?: { ref: string; filename?: string; keyExcerpt?: string; extractedText?: string }[];
  }[];
}

export default function ShareViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { token: t } = await params;
      setToken(t);
      try {
        const res = await fetch(`/api/compliance/share/${t}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Failed to load share link");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load share link");
      }
    })();
  }, [params]);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px 60px" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
          摇光合规助手 clausr.ai
        </span>
        <span
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", color: "var(--color-text-muted)" }}
        >
          🔒 Read-only view
        </span>
      </div>

      {error ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🕸</div>
          <div className="font-semibold" style={{ fontSize: 16, color: "var(--color-text-header)", marginBottom: 6 }}>
            {error}
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 20 }}>
            This share link may have been revoked or the audit is not complete.
          </p>
          <Link href="/" className="text-xs font-medium no-underline" style={{ color: "var(--color-accent-blue)" }}>
            ← Go to clausr.ai
          </Link>
        </div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: 80, color: "var(--color-text-muted)", fontSize: 12 }}>
          Loading...
        </div>
      ) : (
        <div>
          {/* Overall verdict */}
          <div
            style={{
              padding: 24, borderRadius: 12, textAlign: "center", marginBottom: 24,
              background: data.overall === "PASS" ? "var(--color-success-bg)" : data.overall === "FAIL" ? "var(--color-danger-bg)" : "var(--color-bg-dark)",
              border: `1px solid ${data.overall === "PASS" ? "var(--color-success)" : data.overall === "FAIL" ? "var(--color-danger)" : "var(--color-border-default)"}`,
            }}
          >
            <div style={{ fontSize: 34, marginBottom: 8 }}>
              {data.overall === "PASS" ? "✓" : data.overall === "FAIL" ? "✗" : "…"}
            </div>
            <div className="font-semibold" style={{ fontSize: 22, color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Overall {data.overall}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
              {data.packs.length} {data.packs.length === 1 ? "pack" : "packs"} audited
              {data.createdAt ? ` · shared ${new Date(data.createdAt).toLocaleDateString()}` : ""}
            </div>
          </div>

          {/* Packs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.packs.map((pack) => (
              <div
                key={pack.packId}
                style={{
                  borderRadius: 10,
                  border: "1px solid var(--color-border-default)",
                  background: "var(--color-bg-card)",
                  overflow: "hidden",
                }}
              >
                {/* Pack header */}
                <div className="flex items-center gap-3" style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-default)" }}>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                      background: pack.verdict === "PASS" ? "var(--color-success-bg)" : pack.verdict === "FAIL" ? "var(--color-danger-bg)" : "var(--color-bg-dark)",
                      color: pack.verdict === "PASS" ? "var(--color-success)" : pack.verdict === "FAIL" ? "var(--color-danger)" : "var(--color-text-muted)",
                    }}
                  >
                    {pack.verdict === "PASS" ? "✓ PASS" : pack.verdict === "FAIL" ? "✗ FAIL" : "PENDING"}
                  </span>
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text-header)" }}>
                    {pack.title}
                  </span>
                </div>

                {/* Checks */}
                <div style={{ padding: "4px 16px 12px" }}>
                  {pack.checkResults.length === 0 && (
                    <div style={{ padding: "14px 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                      No check details available.
                    </div>
                  )}
                  {pack.checkResults.map((cr) => (
                    <div key={cr.name} style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border-default)", fontSize: 12 }}>
                      <div className="flex items-start gap-2">
                        <span style={{ color: cr.verdict === "PASS" ? "var(--color-success)" : cr.verdict === "FAIL" ? "var(--color-danger)" : "var(--color-text-muted)", flexShrink: 0, marginTop: 1 }}>
                          {cr.verdict === "PASS" ? "✓" : cr.verdict === "FAIL" ? "✗" : "…"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold" style={{ color: "var(--color-text-header)" }}>
                            {cr.name.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim()}
                          </div>
                          {cr.finding && (
                            <div style={{ color: "var(--color-text-body)", marginTop: 4, lineHeight: 1.6, fontSize: 11 }}>
                              {cr.finding}
                            </div>
                          )}
                          {cr.citationRef && cr.citationRef.length > 0 && (
                            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {cr.citationRef.map((ref) => (
                                <span
                                  key={ref}
                                  style={{
                                    fontSize: 9, padding: "1px 6px", borderRadius: 3,
                                    background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)",
                                    fontFamily: "'JetBrains Mono', monospace",
                                  }}
                                >
                                  §{ref}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 40, textAlign: "center", fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.7 }}>
            Generated by <Link href="/" className="no-underline" style={{ color: "var(--color-accent-blue)" }}>clausr.ai</Link> — AI-assisted compliance assessment.
            <br />
            AI outputs may contain errors. Verify critical decisions with qualified professionals.
          </div>
        </div>
      )}
    </div>
  );
}
