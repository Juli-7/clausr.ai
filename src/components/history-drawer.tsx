"use client";

import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SessionRow {
  id: string;
  skillName: string;
  title: string;
  verdict: string;
  lastMessage: string;
  roundCount: number;
  timestamp: number;
  starred: boolean;
  confidenceScore?: number;
  confidenceColor?: string;
  needsExpert?: boolean;
}

export function HistoryDrawer({
  open,
  onClose,
  onSelectSession,
}: {
  open: boolean;
  onClose: () => void;
  onSelectSession?: (id: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-[380px] sm:max-w-[380px] p-0"
        style={{
          left: 56,
          background: "var(--color-bg-dark)",
          borderRight: "1px solid var(--color-border-input)",
        }}
      >
        <div className="flex flex-col h-full">
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
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="cursor-pointer p-4 relative group"
                  onClick={() => {
                    onSelectSession?.(session.id);
                    onClose();
                  }}
                  style={{
                    borderBottom: "1px solid var(--color-bg-card)",
                    borderLeft: session.starred ? "3px solid #f0c040" : "3px solid transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1f6feb0d")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h4
                      className="text-sm font-medium pr-2"
                      style={{ color: "var(--color-text-header)" }}
                    >
                      {session.title || "New conversation"}
                    </h4>
                    {session.confidenceScore != null ? (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0"
                        style={{
                          color: session.confidenceColor ?? "#3fb950",
                          background: `${session.confidenceColor ?? "#3fb950"}18`,
                        }}
                      >
                        {session.confidenceScore.toFixed(0)}%
                      </span>
                    ) : (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0"
                        style={{
                          color: session.verdict === "FAIL" ? "#f85149" : "#3fb950",
                          background: session.verdict === "FAIL" ? "#f8514918" : "#3fb95018",
                        }}
                      >
                        {session.verdict}
                      </span>
                    )}
                  </div>
                  {session.needsExpert && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded mb-1 inline-block" style={{ color: "#f85149", background: "#f8514918" }}>
                      Expert review needed
                    </span>
                  )}
                  <p className="text-xs mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {session.skillName}
                  </p>
                  <p className="text-xs truncate pr-12" style={{ color: "var(--color-text-muted)" }}>
                    {session.lastMessage}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    <span>{session.roundCount} {session.roundCount === 1 ? "round" : "rounds"}</span>
                    <span>·</span>
                    <span>{new Date(session.timestamp).toLocaleDateString()}</span>
                  </div>
                  <button
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent border-none text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                    title="Delete session"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm("Delete this session?")) return;
                      try {
                        await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
                        fetchSessions();
                      } catch { /* silent */ }
                    }}
                  >
                    ✕
                  </button>
                  <button
                    className="absolute top-2 w-6 h-6 flex items-center justify-center rounded cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent border-none text-sm"
                    style={{ right: 28, color: session.starred ? "#f0c040" : "var(--color-text-muted)" }}
                    title={session.starred ? "Unstar session" : "Star session"}
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const res = await fetch(`/api/sessions/${session.id}/star`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ starred: !session.starred }),
                        });
                        if (res.ok) fetchSessions();
                      } catch { /* silent */ }
                    }}
                  >
                    {session.starred ? "★" : "☆"}
                  </button>
                </div>
              ))
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
