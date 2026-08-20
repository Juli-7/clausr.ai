"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SessionRow {
  id: string;
  name: string;
  createdAt: number;
  starred: boolean;
  shared: boolean;
  userEmail: string;
}

interface SessionSummary {
  sessionId: string;
  skillName: string;
  name: string;
  createdAt: number;
  compliance: {
    step: number;
    selectedPacks: { id: string; title: string }[];
    uploadedFileCount: number;
    docCompleteness: { packId: string; filled: number; total: number }[];
    auditPerPack: { packId: string; passed: number; failed: number; total: number }[];
    auditDone: boolean;
  } | null;
}

function SessionName({ id, name, onRename }: { id: string; name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  useEffect(() => { setValue(name); }, [name]);

  const save = useCallback(async (newName: string) => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== name) {
      await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      onRename(trimmed);
    }
    setEditing(false);
  }, [id, name, onRename]);

  if (editing) {
    return (
      <input
        autoFocus
        className="border-none outline-none bg-transparent"
        style={{ color: "var(--color-text-header)", fontSize: "1rem", fontWeight: 700, width: "100%" }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save(value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(value); if (e.key === "Escape") setEditing(false); }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <h3
      className="cursor-text truncate"
      style={{ color: "var(--color-text-header)", fontSize: "1rem", fontWeight: 700, margin: 0 }}
      onDoubleClick={(e) => { e.stopPropagation(); setValue(name); setEditing(true); }}
      title="Double-click to rename"
    >
      {name || "Unnamed"}
    </h3>
  );
}

export function HistoryDrawer({
  open,
  onClose,
  onSelectSession,
}: {
  open: boolean;
  onClose: () => void;
  onSelectSession?: (id: string, skillName?: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      } else {
        setError("Failed to load sessions");
      }
    } catch {
      setError("Network error — check your connection");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      startTransition(() => fetchSessions());
      setSelectedId(null);
      setDetail(null);
    }
  }, [open, fetchSessions]);

  const fetchSummary = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/sessions/${id}/summary`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch {
      /* silent */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelectSession = useCallback(
    (id: string) => {
      setSelectedId(id);
      fetchSummary(id);
    },
    [fetchSummary]
  );

  const handleRestore = useCallback(
    async (id: string, skillName?: string) => {
      setContinueLoading(true);
      onSelectSession?.(id, skillName);
      onClose();
      setContinueLoading(false);
    },
    [onSelectSession, onClose]
  );

  const session = selectedId ? sessions.find((s) => s.id === selectedId) : null;

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => {
      if (!o) onClose();
    }}>
      <SheetContent
        side="left"
          className="w-[680px] data-[side=left]:w-[680px] data-[side=left]:sm:max-w-[680px] p-0"
        style={{
          left: 56,
          background: "var(--color-bg-dark)",
          borderRight: "1px solid var(--color-border-input)",
        }}
      >
        <div className="flex h-full">
          {/* ── Left panel: session list ── */}
          <div className="flex flex-col w-[280px] shrink-0 border-r" style={{ borderColor: "var(--color-border-default)" }}>
            <div
              className="p-4 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--color-border-default)" }}
            >
              <h2 className="text-base font-bold" style={{ color: "var(--color-text-header)" }}>
                Session History
              </h2>
            </div>
            <ScrollArea className="flex-1 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-full text-center p-4" style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                  Loading sessions...
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full text-center p-4" style={{ color: "var(--color-danger)", fontSize: 13 }}>
                  {error}
                </div>
              ) : sessions.length === 0 ? (
                <div
                  className="flex items-center justify-center h-full text-center p-4"
                  style={{ color: "var(--color-text-muted)", fontSize: 13 }}
                >
                  No sessions yet. Start a compliance check to see history.
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`cursor-pointer p-4 relative group ${
                      s.shared ? "bg-[rgba(41,68,171,0.12)]" : ""
                    }`}
                    onClick={() => handleSelectSession(s.id)}
                    style={{
                      borderBottom: "1px solid var(--color-bg-card)",
                      borderLeft: s.starred
                        ? "3px solid var(--color-amber)"
                        : selectedId === s.id
                        ? "3px solid var(--color-accent-blue)"
                        : "3px solid transparent",
                      background: selectedId === s.id
                        ? "var(--color-accent-blue-bg)"
                        : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                        style={{ color: "var(--color-accent-blue)", background: "var(--color-accent-blue-bg)", fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--color-accent-blue)" }} />
                        {s.name || "Unnamed"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      <span>{new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      {s.userEmail && <><span>·</span><span className="truncate">{s.userEmail}</span></>}
                    </div>
                    <button
                      className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent border-none text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                      title="Delete session"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm("Delete this session?")) return;
                        try {
                          await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
                          if (selectedId === s.id) { setSelectedId(null); setDetail(null); }
                          setSessions((prev) => prev.filter((x) => x.id !== s.id));
                        } catch { /* silent */ }
                      }}
                    >
                      ✕
                    </button>
                    <button
                      className="absolute top-2 w-6 h-6 flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent border-none text-xs"
                      style={{ right: 52, color: "var(--color-text-muted)" }}
                      title={s.shared ? "Unshare in org" : "Share in org"}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await fetch(`/api/sessions/${s.id}/share`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ shared: !s.shared }),
                          });
                          if (res.ok) setSessions((prev) => prev.map((x) => x.id === s.id ? { ...x, shared: !x.shared } : x));
                        } catch { /* silent */ }
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill={s.shared ? "var(--color-accent-blue)" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    </button>
                    <button
                      className="absolute top-2 w-6 h-6 flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent border-none text-sm"
                      style={{ right: 28, color: s.starred ? "var(--color-amber)" : "var(--color-text-muted)" }}
                      title={s.starred ? "Unstar session" : "Star session"}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await fetch(`/api/sessions/${s.id}/star`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ starred: !s.starred }),
                          });
                          if (res.ok) setSessions((prev) => prev.map((x) => x.id === s.id ? { ...x, starred: !x.starred } : x));
                        } catch { /* silent */ }
                      }}
                    >
                      {s.starred ? "★" : "☆"}
                    </button>
                  </div>
                ))
              )}
            </ScrollArea>
          </div>

          {/* ── Right panel: session summary ── */}
          <div className="flex flex-col shrink-0" style={{ width: 380 }}>
            {!selectedId ? (
              <div className="flex items-center justify-center h-full text-center p-8" style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                Select a session to view its summary
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center h-full text-center p-8" style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                Loading session details...
              </div>
            ) : detail ? (
              <div className="flex flex-col h-full">
                <div
                  className="p-3 flex-shrink-0 space-y-1"
                  style={{ borderBottom: "1px solid var(--color-border-default)" }}
                >
                  <div className="flex items-center gap-2">
                    <SessionName
                      id={selectedId}
                      name={session?.name ?? ""}
                      onRename={(newName) => setSessions((prev) => prev.map((x) => x.id === selectedId ? { ...x, name: newName } : x))}
                    />
                  </div>
                  {session && (
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {new Date(session.createdAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                      {session.userEmail && <> · {session.userEmail}</>}
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1 p-3 space-y-3">
                  {detail.compliance ? (
                    <>
                      <StepCard
                        number={1}
                        title="Scope"
                        status={detail.compliance.step >= 1 ? "done" : "pending"}
                      >
                        {detail.compliance.selectedPacks.length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No packs selected</p>
                        ) : (
                          <div className="space-y-1.5">
                            {detail.compliance.selectedPacks.map((p) => (
                              <div key={p.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-body)" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent-blue)" }} />
                                {p.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </StepCard>

                      <StepCard
                        number={2}
                        title="Documents"
                        status={detail.compliance.step >= 2 ? "done" : "pending"}
                      >
                        {detail.compliance.step < 2 ? (
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Not yet started</p>
                        ) : (
                          <div className="space-y-2">
                            <div>
                              <span style={{ fontSize: 10, color: "var(--color-text-body)" }}>
                                {detail.compliance.uploadedFileCount > 0
                                  ? `${detail.compliance.uploadedFileCount} file${detail.compliance.uploadedFileCount !== 1 ? "s" : ""} uploaded`
                                  : "No files uploaded"}
                              </span>
                            </div>
                            {detail.compliance.docCompleteness.length > 0 && (
                              <div>
                                <div className="font-semibold mb-1" style={{ fontSize: 10, color: "var(--color-text-header)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                  Completeness
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {detail.compliance.docCompleteness.map((dc) => {
                                    const pct = dc.total > 0 ? dc.filled / dc.total : 0;
                                    const pack = detail.compliance!.selectedPacks.find(p => p.id === dc.packId);
                                    const title = pack?.title ?? dc.packId;
                                    return (
                                      <div key={dc.packId}>
                                        <div className="flex items-center justify-between" style={{ fontSize: 9, color: "var(--color-text-body)", marginBottom: 2 }}>
                                          <span className="truncate" style={{ maxWidth: 140 }}>{title}</span>
                                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: pct >= 1 ? "var(--color-success)" : "var(--color-text-muted)" }}>
                                            {dc.filled}/{dc.total}
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
                              </div>
                            )}
                          </div>
                        )}
                      </StepCard>

                      <StepCard
                        number={3}
                        title="Audit"
                        status={detail.compliance.step >= 3 ? (detail.compliance.auditDone ? "done" : "running") : "pending"}
                      >
                        {detail.compliance.step < 3 ? (
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Not yet started</p>
                        ) : detail.compliance.auditPerPack.length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Audit not yet complete</p>
                        ) : (
                          <div className="space-y-2">
                            {detail.compliance.auditPerPack.map((stat) => {
                              const pack = detail.compliance!.selectedPacks.find((p) => p.id === stat.packId);
                              return (
                                <div key={stat.packId}>
                                  <div className="truncate" style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-body)", marginBottom: 2 }}>
                                    {pack?.title ?? stat.packId}
                                  </div>
                                  {stat.total > 0 && (
                                    <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
                                      <span style={{ color: "var(--color-success)" }}>{stat.passed}✓</span>
                                      {stat.failed > 0 && <span style={{ color: "var(--color-danger)", marginLeft: 4 }}>{stat.failed}✗</span>}
                                      <span style={{ marginLeft: 4 }}>{stat.passed + stat.failed}/{stat.total} checks</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </StepCard>
                    </>
                    ) : (
                      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        Continue session to view details
                      </div>
                    )}
                </ScrollArea>

                <div className="p-3 flex-shrink-0" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                  <button
                    className="w-full py-2 px-4 rounded-lg text-sm font-medium cursor-pointer border-none transition-colors"
                    style={{ background: continueLoading ? "var(--color-bg-dark)" : "var(--color-accent-blue)", color: continueLoading ? "var(--color-text-muted)" : "#fff" }}
                    disabled={continueLoading}
                    onClick={() => handleRestore(selectedId!, session?.name)}
                  >
                    {continueLoading ? "Loading…" : "Continue Session"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-center p-8" style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                Could not load session details
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StepCard({ number, title, status, children }: { number: number; title: string; status: "done" | "running" | "pending"; children: React.ReactNode }) {
  const isDone = status === "done";
  const isRunning = status === "running";
  const themeColor = isDone ? "var(--color-success)" : isRunning ? "var(--color-accent-blue)" : "var(--color-text-muted)";
  const statusLabel = isDone ? "Complete" : isRunning ? "In progress" : "Pending";
  return (
    <div className="space-y-2" style={{ padding: "10px 0" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center justify-center font-bold"
            style={{
              width: 18, height: 18, borderRadius: "50%", fontSize: 9,
              background: isDone || isRunning ? themeColor : "var(--color-bg-dark)",
              color: isDone || isRunning ? "#fff" : "var(--color-text-muted)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {isDone ? "\u2713" : number}
          </span>
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-header)" }}>
            {title}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: themeColor }}>
          {statusLabel}
        </span>
      </div>
      {children}
    </div>
  );
}
