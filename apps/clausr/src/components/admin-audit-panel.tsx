"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AudEntry {
  id: number; tenantId: string; userId: string; userEmail: string;
  action: string; resourceType: string; resourceId: string;
  metadata: Record<string, unknown>; createdAt: number;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

const fmt = (d: number) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function AdminAuditPanel() {
  const [audit, setAudit] = useState<AudEntry[]>([]);
  const [auditQ, setAuditQ] = useState("");

  const refresh = useCallback(() => {
    const p = new URLSearchParams(); if (auditQ) p.set("action", auditQ);
    api<AudEntry[]>(`/api/admin/audit?${p}`).then(setAudit).catch(() => {});
  }, [auditQ]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Event Log</span>
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Filter action…"
              value={auditQ}
              onChange={(e) => setAuditQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") refresh(); }}
              className="w-48 h-7 text-xs"
            />
            <Button size="xs" variant="outline" onClick={refresh}>Refresh</Button>
          </div>
        </div>

        {audit.length === 0 ? (
          <p className="text-center py-8 text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
            — no events —
          </p>
        ) : (
          <div className="space-y-0.5">
            {audit.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-2.5 py-2 rounded-md text-xs transition-colors hover:bg-muted/50"
              >
                <span className="w-28 shrink-0" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(a.createdAt)}</span>
                <span className="w-32 shrink-0 font-medium truncate" style={{ color: "var(--color-text-header)" }}>{a.userEmail}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{a.action}</Badge>
                {a.resourceType && (
                  <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {a.resourceType}:{a.resourceId.slice(0, 8)}
                  </span>
                )}
                <span className="ml-auto truncate max-w-32 text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {Object.keys(a.metadata).length > 0 ? JSON.stringify(a.metadata) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
