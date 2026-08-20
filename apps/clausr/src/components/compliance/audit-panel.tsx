"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { AuditResult, AuditOverride } from "@/lib/compliance/types";
import { DocumentPanel } from "@/components/document-panel";
import type { ChatTurn } from "@/types/agent-types";
import { AuditSidebar } from "./audit-sidebar";
import { t } from "@/lib/compliance/i18n";

interface AuditPanelProps {
  sessionId: string;
  selectedPackIds: string[];
  auditResults: AuditResult[];
  auditRunning: boolean;
  auditDone: boolean;
  agentResponses: Record<string, string>;
  onSessionRefresh: () => void;
  onAddChatMessage: (text: string) => void;
  onCallTool?: (name: string, input: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onSendText?: (text: string) => Promise<void>;
  hideSidebar?: boolean;
}

function ShareAuditButton({ sessionId }: { sessionId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const createLink = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/compliance/session/${sessionId}/share-link`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const full = `${window.location.origin}${data.url}`;
        setUrl(full);
        await navigator.clipboard.writeText(full).catch(() => {});
        setMsg("Link copied to clipboard — anyone with it can view this audit.");
      } else {
        setMsg(data.error ?? "Failed to create link");
      }
    } catch {
      setMsg("Failed to create link");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  const revokeLink = useCallback(async () => {
    setBusy(true);
    try {
      await fetch(`/api/compliance/session/${sessionId}/share-link`, { method: "DELETE" });
      setUrl(null);
      setMsg("Share link revoked.");
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  if (url) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
        <span
          className="text-[10px] truncate"
          style={{ padding: "6px 8px", borderRadius: 6, background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-body)", fontFamily: "'JetBrains Mono', monospace", textAlign: "center" }}
          title={url}
        >
          {url}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="text-[10px] flex-1 border-none rounded-md cursor-pointer font-medium"
            style={{ padding: "6px 0", background: "var(--color-success-bg)", color: "var(--color-success)" }}
            onClick={() => { navigator.clipboard.writeText(url).catch(() => {}); setMsg("Link copied."); }}
          >
            Copy
          </button>
          <button
            className="text-[10px] flex-1 border-none rounded-md cursor-pointer font-medium"
            style={{ padding: "6px 0", background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
            onClick={revokeLink}
            disabled={busy}
          >
            Revoke
          </button>
        </div>
        {msg && <span style={{ fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>{msg}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
      <button
        className="text-xs border-none rounded-md font-medium cursor-pointer"
        style={{ width: "100%", padding: "7px 0", background: "var(--color-bg-card)", border: "1px solid var(--color-border-input)", color: "var(--color-text-body)" }}
        onClick={createLink}
        disabled={busy}
      >
        🔗 Share audit
      </button>
      {msg && <span style={{ fontSize: 10, color: "var(--color-text-muted)", textAlign: "center" }}>{msg}</span>}
    </div>
  );
}

function PackReport({ packId, agentResponses, sessionId, onSendText }: {
  packId: string;
  agentResponses: Record<string, string>;
  sessionId: string;
  onSendText?: (text: string) => Promise<void>;
}) {
  const [pendingComments, setPendingComments] = useState<
    { selectedText: string; comment: string; turnIndex: number; occurrenceIndex: number }[]
  >([]);
  const [revisionFlags, setRevisionFlags] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, AuditOverride>>({});
  const [editState, setEditState] = useState<Record<string, { verdict: string; reasoning: string; reason: string }>>({});
  const editStateRef = useRef(editState);
  editStateRef.current = editState;
  const [saving, setSaving] = useState<string | null>(null);
  const saveGenRef = useRef<Record<string, number>>({});

  const raw = agentResponses[packId];
  const turns = useMemo(() => {
    if (!raw) return [];
    try {
      const ar = JSON.parse(raw);
      const turn: ChatTurn = {
        userMessage: "",
        attachedFiles: [],
        response: ar,
        reasoningSteps: ar.reasoningSteps || [],
        toolCalls: ar.toolCalls || [],
        liveToolResults: [],
        error: null,
      };
      return [turn];
    } catch { return []; }
  }, [raw]);

  const checks = useMemo(() => {
    if (!raw) return [];
    try {
      const ar = JSON.parse(raw);
      const results = ar.checkResults as Array<{ name: string; verdict: string; finding?: string }> | undefined;
      if (!results) return [];
      return results.map((r: { name: string; verdict: string; finding?: string }) => ({
        name: r.name,
        verdict: r.verdict,
        reasoning: r.finding ?? "",
      }));
    } catch { return []; }
  }, [raw]);

  const clauseTexts = turns[0]?.response?.clauseTexts || {};

  useEffect(() => {
    if (!raw) return;
    fetch(`/api/compliance/session/${sessionId}/audit-override`)
      .then((r) => r.json())
      .then((data) => setOverrides(data.overrides ?? {}))
      .catch(() => {});
  }, [sessionId, raw]);

  const handleAddComment = useCallback(
    (turnIndex: number, selectedText: string, comment: string, occurrenceIndex: number) => {
      setPendingComments((prev) => {
        const next = [...prev, { selectedText, comment, turnIndex, occurrenceIndex }];
        fetch(`/api/compliance/session/${sessionId}/comments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comments: next }),
        }).catch(() => {});
        return next;
      });
    },
    [sessionId]
  );

  const handleToggleFlag = useCallback(
    (_turnIndex: number, field: string, flagged: boolean) => {
      setRevisionFlags((prev) => ({ ...prev, [field]: flagged }));
    },
    []
  );

  const handleRevise = useCallback((_turnIndex: number, fields: string[]) => {
    if (fields.length === 0) return;
    let message = `I want to revise the following checks: ${fields.join(", ")}.`;
    if (pendingComments.length > 0) {
      message += ` My comments:\n${pendingComments.map((pc) => `- On "${pc.selectedText}": "${pc.comment}"`).join("\n")}`;
    }
    onSendText?.(message);
  }, [onSendText, pendingComments]);

  const startEdit = useCallback((checkName: string) => {
    const ov = overrides[checkName];
    const orig = checks.find((c) => c.name === checkName);
    setEditState((prev) => ({
      ...prev,
      [checkName]: {
        verdict: ov?.newVerdict ?? orig?.verdict ?? "PASS",
        reasoning: ov?.newReasoning ?? orig?.reasoning ?? "",
        reason: ov?.reason ?? "",
      },
    }));
  }, [overrides, checks]);

  const saveOverride = useCallback(async (checkName: string, values?: { verdict: string; reasoning: string; reason: string }) => {
    const es = values ?? editStateRef.current[checkName];
    if (!es) return;
    const gen = (saveGenRef.current[checkName] ?? 0) + 1;
    saveGenRef.current[checkName] = gen;
    setSaving(checkName);
    const orig = checks.find((c) => c.name === checkName);
    try {
      await fetch(`/api/compliance/session/${sessionId}/audit-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkId: checkName,
          originalVerdict: orig?.verdict ?? "",
          newVerdict: es.verdict,
          originalReasoning: orig?.reasoning ?? "",
          newReasoning: es.reasoning,
          reason: es.reason,
        }),
      });
      if (saveGenRef.current[checkName] !== gen) return;
      const res = await fetch(`/api/compliance/session/${sessionId}/audit-override`);
      const data = await res.json();
      setOverrides(data.overrides ?? {});
    } catch {}
    if (saveGenRef.current[checkName] === gen) setSaving(null);
  }, [sessionId, checks]);

  const cancelEdit = useCallback((checkName: string) => {
    setEditState((prev) => {
      const next = { ...prev };
      delete next[checkName];
      return next;
    });
  }, []);

  const updateEditField = useCallback((checkName: string, field: string, value: string) => {
    setEditState((prev) => {
      const cur = prev[checkName] ?? { verdict: "PASS", reasoning: "", reason: "" };
      const next = { ...prev, [checkName]: { ...cur, [field]: value } };
      editStateRef.current = next;
      return next;
    });
  }, []);

  const deleteOverride = useCallback(async (checkName: string) => {
    setSaving(checkName);
    try {
      await fetch(`/api/compliance/session/${sessionId}/audit-override?checkId=${encodeURIComponent(checkName)}`, {
        method: "DELETE",
      });
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[checkName];
        return next;
      });
    } catch {}
    setSaving(null);
  }, [sessionId]);

  if (!raw) {
    return (
      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--color-border-default)", fontSize: 10, color: "var(--color-text-muted)" }}>
        Running checks...
      </div>
    );
  }

  if (turns.length === 0) return null;

  return (
    <div style={{ marginTop: 8, borderTop: "1px solid var(--color-border-default)" }}>
      <DocumentPanel
        turns={turns}
        loading={false}
        clauseTexts={clauseTexts}
        pendingComments={pendingComments}
        onAddComment={handleAddComment}
        revisionFlags={revisionFlags}
        onToggleFlag={handleToggleFlag}
        onRevise={handleRevise}
        embedded
        overrides={overrides}
        overrideEditState={editState}
        overrideSaving={saving}
        onOverrideEdit={updateEditField}
        onOverrideSave={saveOverride}
        onOverrideStart={startEdit}
        onOverrideCancel={cancelEdit}
        onOverrideDelete={deleteOverride}
        footerExtra={<ShareAuditButton sessionId={sessionId} />}
      />
    </div>
  );
}

export function AuditPanel({
  sessionId, selectedPackIds, auditResults, auditRunning, auditDone,
  agentResponses, hideSidebar,
  onSessionRefresh, onAddChatMessage, onCallTool, onSendText,
}: AuditPanelProps) {
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);
  const [packs, setPacks] = useState<{ id: string; title: string }[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all(
      selectedPackIds.map((id) =>
        fetch(`/api/compliance/packs/${id}`).then((r) => r.json())
      )
    ).then((data) => {
      setPacks(data.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title })));
    });
  }, [selectedPackIds]);

  const startAudit = useCallback(async () => {
    setAuditError(null);
    if (onSendText) {
      await onSendText("start the audit for my selected packs");
    } else {
      onAddChatMessage(t("auditStarted"));
      await onSessionRefresh();
    }
  }, [onAddChatMessage, onSendText, onSessionRefresh]);

  const totalChecks = packs.reduce((acc, p) => {
    const r = auditResults.find((a) => a.packId === p.id);
    return acc + (r ? r.items.filter((i) => i.status === "done").length : 0);
  }, 0);

  const totalExpected = packs.reduce((acc, p) => {
    const r = auditResults.find((a) => a.packId === p.id);
    return acc + (r ? r.items.length : 0);
  }, 0);

  const hasSkeleton = totalExpected > 0;

  return (
    <div className="flex" style={{ height: "100%" }}>
      <div className="flex-1 min-w-0" style={{ padding: "8px 16px 16px", overflowY: "auto" }}>
        {packs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)", fontSize: 11 }}>
            {t("noScopeAudit")}
          </div>
        ) : (
          <div>
            {/* Progress bar (show whenever skeleton exists) */}
            {hasSkeleton && (
              <div style={{ marginBottom: 16 }}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                    {auditRunning ? t("auditInProgress") : t("auditReady")}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "var(--color-text-muted)" }}>
                    {totalChecks}/{totalExpected}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "var(--color-bg-dark)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%", borderRadius: 2,
                      background: "var(--color-accent-blue)",
                      width: `${(totalChecks / totalExpected) * 100}%`,
                      transition: "width .3s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Expandable pack cards */}
            {packs.map((pack) => {
              const result = auditResults.find((r) => r.packId === pack.id);
              const items = result?.items || [];
              const passed = items.filter((i) => i.statusLabel === "PASS").length;
              const failed = items.filter((i) => i.statusLabel === "FAIL").length;
              const pending = items.filter((i) => i.statusLabel === "PENDING").length;
              const isExpanded = expandedPackId === pack.id;

              return (
                <div
                  key={pack.id}
                  className="rounded-lg overflow-hidden"
                  style={{
                    marginBottom: 8,
                    border: `1px solid var(--color-border-default)`,
                    background: "var(--color-bg-card)",
                  }}
                >
                  <div
                    className="flex items-center gap-3 cursor-pointer select-none"
                    style={{ padding: "10px 14px" }}
                    onClick={() => setExpandedPackId(isExpanded ? null : pack.id)}
                  >
                    <span style={{
                      fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0,
                      transition: "transform .15s ease",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}>
                      ▶
                    </span>
                    <span className="text-sm font-medium truncate" style={{ flex: 1, color: "var(--color-text-header)" }}>
                      {pack.title}
                    </span>
                    {items.length > 0 && (
                      <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        {passed > 0 && <span style={{ color: "var(--color-success)" }}>{passed}✓</span>}
                        {failed > 0 && <span style={{ color: "var(--color-danger)", marginLeft: 4 }}>{failed}✗</span>}
                        {pending > 0 && <span style={{ color: "var(--color-text-muted)", marginLeft: 4 }}>{pending}…</span>}
                        <span style={{ marginLeft: 6, fontSize: 10 }}>{items.length} {t("checks")}</span>
                      </span>
                    )}
                  </div>
                  {isExpanded && (
                    <PackReport
                      packId={pack.id}
                      agentResponses={agentResponses}
                      sessionId={sessionId}
                      onSendText={onSendText}
                    />
                  )}
                </div>
              );
            })}

            {/* Start / intro */}
            {!hasSkeleton && (
              <div
                className="flex flex-col items-center justify-center"
                style={{ padding: "40px 20px", textAlign: "center" }}
              >
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: 16, maxWidth: 360 }}>
                  {t("auditD")}
                </div>
                <button
                  className="text-xs border-none rounded-md cursor-pointer font-medium"
                  style={{ padding: "10px 28px", background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)" }}
                  onClick={startAudit}
                >
                  {t("startAudit")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!hideSidebar && (
        <AuditSidebar
          selectedPackIds={selectedPackIds}
          auditResults={auditResults}
          activePackId={expandedPackId}
          onViewDetail={(id) => setExpandedPackId(id)}
          hideViewButton
        />
      )}
    </div>
  );
}
