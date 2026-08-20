"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import { InlineCommentThread } from "@/components/inline-comment";
import type { HighlightChunk } from "@/components/source-citation-card";
import { CommentPopover } from "@/components/comment-popover";
import type { ChatTurn } from "@/types/agent-types";
import { DownloadDropdown } from "@/components/download-dropdown";
import { sanitizeHtml } from "@/lib/sanitize";
import type { AgentResponse } from "@clausr/engine/types";
import { PdfViewer } from "@/components/pdf-viewer";

interface OverrideEntry {
  newVerdict: string;
  originalVerdict: string;
  newReasoning: string;
  originalReasoning: string;
  reason: string;
  changedBy: string;
  changedAt: number;
}

interface DocumentPanelProps {
  turns: ChatTurn[];
  loading: boolean;
  stepStatus?: string | null;
  skillName?: string;
  clauseTexts?: Record<string, string>;
  pendingComments?: { selectedText: string; comment: string; turnIndex: number; occurrenceIndex: number }[];
  onAddComment?: (turnIndex: number, selectedText: string, comment: string, occurrenceIndex: number) => void;
  onRevise?: (turnIndex: number, revisionFields: string[]) => void;
  revisionFlags?: Record<string, boolean>;
  onToggleFlag?: (turnIndex: number, field: string, flagged: boolean) => void;
  embedded?: boolean;
  overrides?: Record<string, OverrideEntry>;
  overrideEditState?: Record<string, { verdict: string; reasoning: string; reason: string }>;
  overrideSaving?: string | null;
  onOverrideEdit?: (checkName: string, field: string, value: string) => void;
  onOverrideSave?: (checkName: string, values?: { verdict: string; reasoning: string; reason: string }) => void;
  onOverrideStart?: (checkName: string) => void;
  onOverrideCancel?: (checkName: string) => void;
  onOverrideDelete?: (checkName: string) => void;
  footerExtra?: React.ReactNode;
}

export function DocumentPanel({
  turns,
  loading,
  stepStatus,
  skillName,
  clauseTexts,
  pendingComments,
  onAddComment,
  onRevise,
  revisionFlags,
  onToggleFlag,
  embedded,
  overrides,
  overrideEditState,
  overrideSaving,
  onOverrideEdit,
  onOverrideSave,
  onOverrideStart,
  onOverrideCancel,
  onOverrideDelete,
  footerExtra,
}: DocumentPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [turns.length, loading]);

  const [selectionState, setSelectionState] = useState<{
    selectedText: string;
    position: { top: number; left: number };
    turnIndex: number;
    occurrenceIndex: number;
  } | null>(null);

  function getTextOffset(root: HTMLElement, range: Range): number {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node === range.startContainer) {
        return offset + range.startOffset;
      }
      offset += node.textContent?.length ?? 0;
    }
    return offset;
  }

  function handleMouseUp(e: React.MouseEvent, turnIndex: number) {
    const cardEl = e.currentTarget as HTMLElement | null;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectionState(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const text = sel.toString().trim();

      let occurrenceIndex = 0;
      if (cardEl) {
        const cardBody = cardEl.querySelector<HTMLElement>("[data-card-body]");
        if (cardBody) {
          const fullText = cardBody.textContent ?? "";
          const selOffset = getTextOffset(cardBody, range);
          let count = 0;
          let pos = 0;
          while (pos < selOffset) {
            const idx = fullText.indexOf(text, pos);
            if (idx === -1 || idx >= selOffset) break;
            count++;
            pos = idx + 1;
          }
          occurrenceIndex = count;
        }
      }

      setSelectionState({
        selectedText: text,
        position: {
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
        },
        turnIndex,
        occurrenceIndex,
      });
    }, 10);
  }

  if (turns.length === 0 && !loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--color-text-muted)", fontSize: 13 }}
      >
        Select a skill and type a question to begin.
      </div>
    );
  }

  return (
    <div ref={containerRef} className={embedded ? "" : "px-10 py-6"} style={{ height: embedded ? "auto" : "100%" }}>
      {turns.map((turn, i) =>
        turn.response ? (
          <DocumentCard
            key={i}
            turnIndex={i}
            turn={turn}
            embedded={embedded}
            skillName={skillName}
            clauseTexts={clauseTexts}
            pendingComments={pendingComments?.filter((c) => c.turnIndex === i)}
            onMouseUp={(e) => handleMouseUp(e, i)}
            onRevise={onRevise}
            revisionFlags={revisionFlags}
            onToggleFlag={onToggleFlag}
            overrides={overrides}
            overrideEditState={overrideEditState}
            overrideSaving={overrideSaving}
            onOverrideEdit={onOverrideEdit}
            onOverrideSave={onOverrideSave}
            onOverrideStart={onOverrideStart}
            onOverrideCancel={onOverrideCancel}
            onOverrideDelete={onOverrideDelete}
            footerExtra={footerExtra}
          />
        ) : null
      )}

      {loading && turns.length > 0 && !turns[turns.length - 1]?.response && (
        <ReportSkeleton stepStatus={stepStatus} />
      )}

      {loading && turns.length === 0 && (
        <ReportSkeleton stepStatus={stepStatus} />
      )}

      {turns.length > 0 && turns[turns.length - 1]!.error && (
        <div
          className="p-4 rounded-lg mt-4"
          style={{
            border: "1px solid var(--color-danger)",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
          }}
        >
          ⚠️ {turns[turns.length - 1]!.error}
        </div>
      )}

      {selectionState && onAddComment && (
        <CommentPopover
          selectedText={selectionState.selectedText}
          position={selectionState.position}
          onConfirm={(comment) => {
            onAddComment(selectionState.turnIndex, selectionState.selectedText, comment, selectionState.occurrenceIndex);
            setSelectionState(null);
          }}
          onDismiss={() => setSelectionState(null)}
        />
      )}
    </div>
  );
}

function formatLoadingMessage(stepStatus?: string | null): string {
  switch (stepStatus) {
    case "compiling-report":
      return "Compiling compliance report...";
    case "computing-verdict":
      return "Computing verdict...";
    default:
      return "Agent is analyzing...";
  }
}

function ReportSkeleton({ stepStatus }: { stepStatus?: string | null }) {
  return (
    <div
      className="mb-6 rounded-lg overflow-hidden animate-pulse"
      style={{
        border: "1px solid var(--color-border-default)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          background: "var(--color-bg-card)",
        }}
      >
        <div className="px-6 py-4" style={{ background: "var(--color-bg-dark)", borderBottom: "1px solid var(--color-border-default)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="h-4 w-48 rounded" style={{ background: "var(--color-border-default)" }} />
          <div className="h-4 w-16 rounded" style={{ background: "var(--color-border-default)" }} />
        </div>
        <div className="h-3 w-32 rounded" style={{ background: "var(--color-border-default)" }} />
      </div>
      <div className="px-6 py-5 space-y-4">
        <div className="h-3 w-full rounded" style={{ background: "var(--color-border-default)" }} />
        <div className="h-3 w-3/4 rounded" style={{ background: "var(--color-border-default)" }} />
        <div className="h-3 w-5/6 rounded" style={{ background: "var(--color-border-default)" }} />
        <div className="h-3 w-2/3 rounded" style={{ background: "var(--color-border-default)" }} />
        <div className="h-3 w-full rounded" style={{ background: "var(--color-border-default)" }} />
        <div className="h-3 w-4/5 rounded" style={{ background: "var(--color-border-default)" }} />
      </div>
      <div className="flex items-center justify-center py-4" style={{ borderTop: "1px solid var(--color-border-default)", background: "var(--color-bg-dark)" }}>
        <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          {formatLoadingMessage(stepStatus)}
        </span>
      </div>
    </div>
  );
}

interface CheckSourceCitation {
  ref: string;
  fileId?: string;
  filename?: string;
  fileUrl?: string;
  keyExcerpt?: string;
  extractedText?: string;
  pageNumber?: number;
  pageCount?: number;
}

interface CheckDataItem {
  name: string;
  verdict: "PASS" | "FAIL" | "PENDING";
  body: string;
  citationRef?: string[];
  sourceCitations?: CheckSourceCitation[];
}

function buildCheckData(response: AgentResponse): CheckDataItem[] | null {
  const fullCheckResults = response.checkResults as Array<Record<string, unknown>> | undefined;
  if (!fullCheckResults || !Array.isArray(fullCheckResults) || fullCheckResults.length === 0) return null;

  const checkResults = fullCheckResults.map((cr) => ({
    name: cr.name as string,
    verdict: cr.verdict as "PASS" | "FAIL" | "PENDING",
  }));

  if (checkResults.length === 0) return null;

  const sections = response.sections as Record<string, unknown> | undefined;

  return checkResults.map((cr) => {
    let body = "";
    let citationRef: string[] | undefined;
    let sourceCitations: CheckSourceCitation[] | undefined;
    if (fullCheckResults && Array.isArray(fullCheckResults)) {
      const match = fullCheckResults.find((fcr) => fcr.name === cr.name);
      if (match) {
        if (typeof match.finding === "string") body = match.finding;
        if (Array.isArray(match.citationRef)) citationRef = match.citationRef as string[];
        if (Array.isArray(match.sourceCitations)) sourceCitations = match.sourceCitations as CheckSourceCitation[];
        else if (Array.isArray(match.sourceCitation)) {
          sourceCitations = (match.sourceCitation as string[]).map((ref) => ({ ref }));
        }
      }
    }
    if (!body && sections && typeof sections[cr.name] === "string") {
      body = sections[cr.name] as string;
    }
    return { name: cr.name, verdict: cr.verdict, body, citationRef, sourceCitations };
  });
}

interface CitationState {
  regulation: string;
  clause: string;
  text: string;
  position: { top: number; left: number };
}

interface SourceCitationState {
  ref: string;
  fileId?: string;
  filename: string;
  fileUrl?: string;
  excerpt: string;
  text: string;
  pageNumber?: number;
  pageCount?: number;
  highlightChunk?: HighlightChunk;
}

// Client-side cache of clause texts fetched lazily on badge click
const clauseTextCache = new Map<string, string>();

function handleCitationClick(
  e: React.MouseEvent,
  clauseTexts: Record<string, string> | undefined,
  onCitation: (s: CitationState) => void,
  onSourceCitation?: (s: SourceCitationState) => void,
  sourceCitationMap?: Map<string, SourceCitationState>,
  citationSessionId?: string,
) {
  const target = e.target as HTMLElement;
  const cite = target.closest("cite.citation-marker") as HTMLElement | null;
  if (cite) {
    const regulation = cite.getAttribute("data-regulation") ?? "";
    const clause = cite.getAttribute("data-clause") ?? "";
    const rect = cite.getBoundingClientRect();
    const clauseList = clause.split(/,\s*/);
    const popoverW = 360;
    const popoverH = 300;
    const gap = 6;
    const position = {
      left: Math.max(gap, Math.min(rect.left - 100, window.innerWidth - popoverW - gap)),
      top: rect.bottom + gap + popoverH > window.innerHeight
        ? Math.max(gap, rect.top - popoverH - gap)
        : rect.bottom + gap,
    };

    const showPopover = (text: string) =>
      onCitation({ regulation, clause, text, position });

    // Local lookup first: response clauseTexts or client-side cache
    const keys = clauseList.map((cl) => `${regulation}.${cl.trim()}`);
    const cachedTexts = keys.map((key) => clauseTexts?.[key] ?? clauseTextCache.get(key));
    if (cachedTexts.every((t) => !!t)) {
      showPopover(keys.map((key, i) => `§${clauseList[i]!.trim()}: ${cachedTexts[i]}`).join("\n\n"));
      return;
    }

    // Miss → lazy fetch from server, then show
    showPopover("Loading clause text...");
    if (!citationSessionId) return;
    Promise.all(
      keys.map(async (key, i) => {
        const cached = clauseTexts?.[key] ?? clauseTextCache.get(key);
        if (cached) return `§${clauseList[i]!.trim()}: ${cached}`;
        try {
          const res = await fetch(`/api/compliance/session/${citationSessionId}/clause?ref=${encodeURIComponent(key)}`);
          const data = await res.json();
          const t = data.text as string | undefined;
          if (t) {
            clauseTextCache.set(key, t);
            return `§${clauseList[i]!.trim()}: ${t}`;
          }
          return "";
        } catch {
          return "";
        }
      }),
    ).then((texts) => {
      const filled = texts.filter(Boolean);
      showPopover(filled.length > 0 ? filled.join("\n\n") : "Clause text not available.");
    });
    return;
  }

  if (!onSourceCitation) return;
  const scite = target.closest("cite.source-citation-marker") as HTMLElement | null;
  if (scite) {
    const ref = scite.getAttribute("data-source-citation") ?? "";
    if (sourceCitationMap?.has(ref)) {
      onSourceCitation(sourceCitationMap.get(ref)!);
    } else if (citationSessionId) {
      onSourceCitation({ ref, filename: "Loading...", excerpt: "", text: "" });
      fetch(`/api/compliance/session/${citationSessionId}/citation?ref=${encodeURIComponent(ref)}`)
        .then((res) => res.json())
        .then((data) => {
          const highlightChunk = findHighlightChunk(data, undefined, ref);
          onSourceCitation!({
            ref,
            fileId: data.fileId,
            filename: data.filename,
            fileUrl: data.fileUrl,
            excerpt: data.keyExcerpt,
            text: data.extractedText,
            highlightChunk,
            pageNumber: data.pageNumber,
            pageCount: data.pageCount,
          });
        })
        .catch(() => {
          onSourceCitation!({ ref, filename: "Failed to load citation", excerpt: "", text: "" });
        });
    }
  }
}

function DocumentCard({
  turn,
  turnIndex,
  embedded,
  skillName,
  clauseTexts,
  pendingComments,
  onMouseUp,
  onRevise,
  revisionFlags,
  onToggleFlag,
  overrides,
  overrideEditState,
  overrideSaving,
  onOverrideEdit,
  onOverrideSave,
  onOverrideStart,
  onOverrideCancel,
  onOverrideDelete,
  footerExtra,
}: {
  turn: ChatTurn;
  turnIndex: number;
  embedded?: boolean;
  skillName?: string;
  clauseTexts?: Record<string, string>;
  pendingComments?: { selectedText: string; comment: string; occurrenceIndex: number }[];
  onMouseUp?: (e: React.MouseEvent) => void;
  onRevise?: (turnIndex: number, revisionFields: string[]) => void;
  revisionFlags?: Record<string, boolean>;
  onToggleFlag?: (turnIndex: number, field: string, flagged: boolean) => void;
  overrides?: Record<string, OverrideEntry>;
  overrideEditState?: Record<string, { verdict: string; reasoning: string; reason: string }>;
  overrideSaving?: string | null;
  onOverrideEdit?: (checkName: string, field: string, value: string) => void;
  onOverrideSave?: (checkName: string, values?: { verdict: string; reasoning: string; reason: string }) => void;
  onOverrideStart?: (checkName: string) => void;
  onOverrideCancel?: (checkName: string) => void;
  onOverrideDelete?: (checkName: string) => void;
  footerExtra?: React.ReactNode;
}) {
  const { response } = turn;
  if (!response) return null;

  // ── Rich check data from structured response ──
  const checkData = useMemo(() => buildCheckData(response), [response]);

  // ── Legacy content (no check data) ──
  const normalizedContent = useMemo(
    () => (response ? normalizeTables(response.content) : ""),
    [response]
  );
  const highlightedContent = useMemo(
    () => (normalizedContent ? applyHighlights(normalizedContent, pendingComments) : ""),
    [normalizedContent, pendingComments]
  );
  const sections = useMemo(
    () => (highlightedContent ? parseSections(highlightedContent) : []),
    [highlightedContent]
  );
  const checkResults = useMemo(() => {
    const crs = response.checkResults as Array<Record<string, unknown>> | undefined;
    if (!crs || !Array.isArray(crs) || crs.length === 0) return null;
    return crs.map((cr) => ({
      name: cr.name as string,
      verdict: cr.verdict as "PASS" | "FAIL" | "PENDING",
    }));
  }, [response]);
  const checkPills = useMemo(() => {
    if (!checkResults) return null;
    const passed = checkResults.filter((r) => r.verdict === "PASS").length;
    return { results: checkResults, passed, total: checkResults.length };
  }, [checkResults]);

  // ── Citation state (per DocumentCard for LegacyLayout) ──
  const [activeCitation, setActiveCitation] = useState<CitationState | null>(null);
  const [activeSourceCitation, setActiveSourceCitation] = useState<SourceCitationState | null>(null);

  const citationSessionId = response?.sessionId ?? "";

  const sourceCitationMap = useMemo(() => {
    const raw = response?.sourceCitations as Array<Record<string, unknown>> | undefined;
    if (!raw || !Array.isArray(raw)) return new Map<string, SourceCitationState>();
    const map = new Map<string, SourceCitationState>();
    for (const s of raw) {
      const ref = s.ref as string;
      const highlightChunk = findHighlightChunk(s as any, undefined, ref);
      map.set(ref, {
        ref,
        fileId: s.fileId as string | undefined,
        filename: (s.filename as string) ?? ref,
        fileUrl: s.fileUrl as string | undefined,
        excerpt: (s.keyExcerpt as string) ?? "",
        text: (s.extractedText as string) ?? "",
        highlightChunk,
        pageNumber: s.pageNumber as number | undefined,
        pageCount: s.pageCount as number | undefined,
      });
    }
    return map;
  }, [response?.sourceCitations]);

  function onCiteClick(e: React.MouseEvent) {
    handleCitationClick(e, clauseTexts, setActiveCitation, setActiveSourceCitation, sourceCitationMap, citationSessionId);
  }

  // ── Audit layout (checkData exists) ──
  if (checkData) {
    return <AuditLayout
      skillName={skillName}
      response={response}
      checkData={checkData}
      turnIndex={turnIndex}
      revisionFlags={revisionFlags}
      onToggleFlag={onToggleFlag}
      onRevise={onRevise}
      onMouseUp={onMouseUp}
      pendingComments={pendingComments}
      embedded={embedded}
      overrides={overrides}
      overrideEditState={overrideEditState}
      overrideSaving={overrideSaving}
      onOverrideEdit={onOverrideEdit}
      onOverrideSave={onOverrideSave}
      onOverrideStart={onOverrideStart}
      onOverrideCancel={onOverrideCancel}
      onOverrideDelete={onOverrideDelete}
      footerExtra={footerExtra}
    />;
  }

  // ── Legacy layout (no structured check data) ──
  return (
    <LegacyLayout
      response={response}
      skillName={skillName}
      sections={sections}
      checkPills={checkPills}
      checkResults={checkResults}
      turnIndex={turnIndex}
      clauseTexts={clauseTexts}
      citationSessionId={citationSessionId}
      revisionFlags={revisionFlags}
      onToggleFlag={onToggleFlag}
      onRevise={onRevise}
      onCiteClick={onCiteClick}
      onMouseUp={onMouseUp}
      pendingComments={pendingComments}
      embedded={embedded}
    />
  );
}

// ── Audit Result Layout (split panel + timeline) ──

function AuditLayout({
  skillName,
  response,
  checkData,
  turnIndex,
  revisionFlags,
  onToggleFlag,
  onRevise,
  onMouseUp,
  pendingComments,
  embedded,
  overrides,
  overrideEditState,
  overrideSaving,
  onOverrideEdit,
  onOverrideSave,
  onOverrideStart,
  onOverrideCancel,
  onOverrideDelete,
  footerExtra,
}: {
  skillName?: string;
  response: AgentResponse;
  checkData: CheckDataItem[];
  turnIndex: number;
  revisionFlags?: Record<string, boolean>;
  onToggleFlag?: (turnIndex: number, field: string, flagged: boolean) => void;
  onRevise?: (turnIndex: number, revisionFields: string[]) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  pendingComments?: { selectedText: string; comment: string; occurrenceIndex: number }[];
  embedded?: boolean;
  overrides?: Record<string, OverrideEntry>;
  overrideEditState?: Record<string, { verdict: string; reasoning: string; reason: string }>;
  overrideSaving?: string | null;
  onOverrideEdit?: (checkName: string, field: string, value: string) => void;
  onOverrideSave?: (checkName: string, values?: { verdict: string; reasoning: string; reason: string }) => void;
  onOverrideStart?: (checkName: string) => void;
  onOverrideCancel?: (checkName: string) => void;
  onOverrideDelete?: (checkName: string) => void;
  footerExtra?: React.ReactNode;
}) {
  const [activeCitation, setActiveCitation] = useState<CitationState | null>(null);
  const [activeSourceCitation, setActiveSourceCitation] = useState<SourceCitationState | null>(null);

  const citationSessionId = response?.sessionId ?? "";

  const sourceCitationMap = useMemo(() => {
    const raw = response?.sourceCitations as Array<Record<string, unknown>> | undefined;
    if (!raw || !Array.isArray(raw)) return new Map<string, SourceCitationState>();
    const map = new Map<string, SourceCitationState>();
    for (const s of raw) {
      const ref = s.ref as string;
      const highlightChunk = findHighlightChunk(s as any, undefined, ref);
      map.set(ref, {
        ref,
        fileId: s.fileId as string | undefined,
        filename: (s.filename as string) ?? ref,
        fileUrl: s.fileUrl as string | undefined,
        excerpt: (s.keyExcerpt as string) ?? "",
        text: (s.extractedText as string) ?? "",
        highlightChunk,
        pageNumber: s.pageNumber as number | undefined,
        pageCount: s.pageCount as number | undefined,
      });
    }
    return map;
  }, [response?.sourceCitations]);

  function onCiteClick(e: React.MouseEvent) {
    handleCitationClick(e, response?.clauseTexts, setActiveCitation, setActiveSourceCitation, sourceCitationMap, citationSessionId);
  }

  const passed = checkData.filter((r) => r.verdict === "PASS").length;
  const failed = checkData.filter((r) => r.verdict === "FAIL").length;
  const pendingCount = checkData.filter((r) => r.verdict === "PENDING").length;
  const total = passed + failed;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const donutDeg = total > 0 ? (passed / total) * 360 : 0;
  const hasAnyFlagged = revisionFlags && Object.values(revisionFlags).some(Boolean);

  const enrichedResponse = useMemo(() => {
    if (!response) return null;
    const enriched = buildEnrichedContent(response);
    return { ...response, content: enriched };
  }, [response]);

  return (
    <>
      <style>{citationStyles}</style>
      <style>{timelineStyles}</style>
      <div
        className={embedded ? "flex" : "flex rounded-lg overflow-hidden animate-fade-in"}
        onClick={onCiteClick}
        onMouseUp={onMouseUp}
        style={embedded ? {} : {
          border: "1px solid var(--color-border-default)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          background: "var(--color-bg-card)",
          minHeight: 360,
        }}
      >
        {/* ── Sidebar ── */}
        <div
          style={{
            width: 150, flexShrink: 0,
            background: "var(--color-bg-dark)",
            borderRight: "1px solid var(--color-border-default)",
            padding: "20px 16px",
            display: "flex", flexDirection: "column",
          }}
        >
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 15, color: "var(--color-text-header)", marginBottom: 16 }}>
            {skillName || "Compliance Report"}
          </div>

          {(total > 0 || pendingCount > 0) && (
            <>
              <div
                style={{
                  width: 64, height: 64, borderRadius: "50%", margin: "0 auto 14px",
                  position: "relative",
                  background: total > 0
                    ? `conic-gradient(var(--color-success) 0deg ${donutDeg}deg, var(--color-danger) ${donutDeg}deg 360deg)`
                    : "var(--color-bg-darker)",
                }}
              >
                <div
                  style={{
                    position: "absolute", inset: 5, borderRadius: "50%",
                    background: "var(--color-bg-dark)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12, fontWeight: 700, color: "var(--color-text-header)",
                  }}
                >
                  {total > 0 ? `${passRate}%` : "—"}
                </div>
              </div>

              <div style={{ textAlign: "center", marginBottom: 16 }}>
                {passed > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, margin: "0 6px" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: "var(--color-success)" }}>{passed}</span>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>passed</span>
                  </span>
                )}
                {failed > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, margin: "0 6px" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: "var(--color-danger)" }}>{failed}</span>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>failed</span>
                  </span>
                )}
                {pendingCount > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, margin: "0 6px" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: "var(--color-text-muted)" }}>{pendingCount}</span>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>pending</span>
                  </span>
                )}
              </div>
            </>
          )}

          <div style={{ height: 1, background: "var(--color-border-default)", margin: "12px 0" }} />

          <div style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--color-text-body)", fontWeight: 500 }}>Date</strong><br />
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}<br />
            <strong style={{ color: "var(--color-text-body)", fontWeight: 500 }}>Reference</strong><br />
            #{response.sessionId?.slice(-4) || "—"}
          </div>

          <div style={{ height: 1, background: "var(--color-border-default)", margin: "12px 0" }} />

          {response.confidence && (
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "var(--color-text-muted)", marginBottom: 2 }}>AI Confidence</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: confidenceColor(response.confidence.score) }}>
                {response.confidence.score.toFixed(0)}%
              </div>
              <div style={{ fontSize: 9, color: "var(--color-text-muted)" }}>
                {confidenceLabel(response.confidence.score)}
              </div>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {footerExtra}
            <DownloadDropdown
              response={enrichedResponse ?? response}
              skillName={skillName}
            />
            <button
              style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 500,
                padding: "7px 0", borderRadius: 6,
                border: "1px solid var(--color-border-input)",
                background: hasAnyFlagged ? "var(--color-accent-blue)" : "transparent",
                color: hasAnyFlagged ? "white" : "var(--color-text-body)",
                cursor: "pointer", width: "100%", textAlign: "center",
              }}
              onClick={() => {
                if (!revisionFlags) { onRevise?.(turnIndex, []); return; }
                const flagged = Object.entries(revisionFlags)
                  .filter(([, f]) => f)
                  .map(([field]) => field);
                onRevise?.(turnIndex, flagged);
              }}
            >
              Revise Selected
            </button>
          </div>
        </div>

        {/* ── Main panel ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: "1px solid var(--color-border-default)", flexShrink: 0 }}
          >
            <div>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18, color: "var(--color-text-header)" }}>
                Assessment Details
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                <span>Examiner: AI</span>
                <span style={{ color: "var(--color-border-default)", margin: "0 6px" }}>·</span>
                <span>{total + pendingCount} check{(total + pendingCount) !== 1 ? "s" : ""} evaluated{pendingCount > 0 ? `, ${pendingCount} pending` : ""}</span>
              </div>
            </div>
            {pendingComments && pendingComments.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--color-amber)", fontFamily: "'JetBrains Mono', monospace" }}>
                {pendingComments.length} comment{pendingComments.length > 1 ? "s" : ""}
              </div>
            )}
          </div>

          <div
            className="timeline-scroll"
            style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}
            data-card-body="true"
          >
            {checkData.map((cr, i) => {
              const isFail = cr.verdict === "FAIL";
              const isPending = cr.verdict === "PENDING";
              const checked = revisionFlags?.[cr.name] ?? false;
              const isLast = i === checkData.length - 1;

              return (
                <div
                  key={cr.name}
                  className="timeline-item"
                  data-timeline-last={isLast ? "true" : undefined}
                  data-timeline-fail={isFail ? "true" : undefined}
                  style={{
                    display: "flex", gap: 14,
                    padding: "12px 24px 16px 20px",
                    position: "relative",
                    opacity: isPending ? 0.45 : 1,
                    ...(isFail ? {
                      background: "var(--color-danger-bg)",
                    } : {}),
                  }}
                >
                  {/* Timeline dot + line */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 20, paddingTop: 3 }}>
                    <div
                      style={{
                        width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                        background: isPending ? "var(--color-text-muted)" : isFail ? "var(--color-danger)" : "var(--color-success)",
                        position: "relative", zIndex: 1,
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <VerdictBadge verdict={cr.verdict} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-header)" }}>
                        {humanize(cr.name)}
                      </span>
                      {revisionFlags !== undefined && (
                        <span
                          style={{
                            marginLeft: "auto", flexShrink: 0,
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 8px", borderRadius: 4,
                            cursor: "pointer", userSelect: "none",
                            fontSize: 10, fontWeight: 500,
                            fontFamily: "'DM Sans', sans-serif",
                            color: checked ? "var(--color-amber)" : "var(--color-text-muted)",
                            background: checked ? "var(--color-amber-bg)" : "transparent",
                            border: `1px solid ${checked ? "var(--color-amber-border)" : "var(--color-border-default)"}`,
                            transition: "all 0.12s ease",
                          }}
                          onClick={(e) => { e.stopPropagation(); onToggleFlag?.(turnIndex, cr.name, !checked); }}
                          title={checked ? "Remove flag" : "Flag for revision"}
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
                            style={{ flexShrink: 0 }}
                          >
                            <path d="M2 14V2M2 2l7 2.5L2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill={checked ? "currentColor" : "none"}/>
                          </svg>
                          {checked ? "Flagged" : "Flag"}
                        </span>
                      )}
                    </div>
                    <div className="check-body-text" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--color-text-body)" }}>
                      {isPending ? (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Waiting for check...</span>
                      ) : cr.body ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                          {applyHighlights(cr.body, pendingComments)}
                        </ReactMarkdown>
                      ) : (
                        <em style={{ color: "var(--color-text-muted)" }}>No finding details available.</em>
                      )}
                      {!isPending && cr.sourceCitations && cr.sourceCitations.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {cr.sourceCitations.map((sc, j) => {
                            const highlightChunk = findHighlightChunk(sc as any, undefined, sc.ref);
                            const scData: SourceCitationState = {
                              ref: sc.ref,
                              fileId: sc.fileId,
                              filename: sc.filename ?? sc.ref,
                              fileUrl: sc.fileUrl,
                              excerpt: sc.keyExcerpt ?? "",
                              text: sc.extractedText ?? "",
                              highlightChunk,
                              pageNumber: sc.pageNumber,
                              pageCount: sc.pageCount,
                            };
                            return (
                              <cite
                                key={j}
                                className="source-citation-marker"
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); setActiveSourceCitation(scData); }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setActiveSourceCitation(scData); } }}
                              >
                                {sc.ref}
                              </cite>
                            );
                          })}
                        </div>
                      )}
                      {!isPending && cr.citationRef && cr.citationRef.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {cr.citationRef.map((ref, j) => {
                            const dot = ref.indexOf(".");
                            if (dot === -1) return null;
                            const regulation = ref.substring(0, dot);
                            const clause = ref.substring(dot + 1);
                            return (
                              <cite
                                key={j}
                                className="citation-marker"
                                role="button"
                                tabIndex={0}
                                data-regulation={regulation}
                                data-clause={clause}
                              >
                                {regulation} §{clause}
                              </cite>
                            );
                          })}
                        </div>
                      )}

                      {overrides !== undefined && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border-default)" }}>
                          {(() => {
                            const ov = overrides[cr.name];
                            const es = overrideEditState?.[cr.name];
                            const isEditing = overrideEditState !== undefined && cr.name in overrideEditState;
                            const isSaving = overrideSaving === cr.name;
                            const inputS: React.CSSProperties = {
                              width: "100%", padding: "4px 8px", fontSize: 11,
                              border: "1px solid var(--color-border-input)", borderRadius: 4,
                              background: "var(--color-bg-dark)", color: "var(--color-text-body)",
                              outline: "none", fontFamily: "'DM Sans', sans-serif",
                            };
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {isEditing ? (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Override verdict:</span>
                                      {["PASS", "FAIL"].map((v) => (
                                        <div
                                          key={v}
                                          onClick={() => {
                                            const cur = es ?? (ov ? { verdict: ov.newVerdict, reasoning: ov.newReasoning, reason: ov.reason } : { verdict: cr.verdict, reasoning: "", reason: "" });
                                            const next = { ...cur, verdict: v };
                                            onOverrideEdit?.(cr.name, "verdict", v);
                                            onOverrideSave?.(cr.name, next);
                                          }}
                                          style={{
                                            padding: "1px 7px", borderRadius: 3, fontSize: 9, fontWeight: 600, cursor: "pointer",
                                            background: es?.verdict === v
                                              ? (v === "PASS" ? "var(--color-success-bg)" : "var(--color-danger-bg)")
                                              : "var(--color-bg-card)",
                                            color: es?.verdict === v
                                              ? (v === "PASS" ? "var(--color-success)" : "var(--color-danger)")
                                              : "var(--color-text-muted)",
                                            border: "1px solid", borderColor: es?.verdict === v
                                              ? (v === "PASS" ? "var(--color-success)" : "var(--color-danger)")
                                              : "var(--color-border-input)",
                                          }}
                                        >
                                          {v}
                                        </div>
                                      ))}
                                      {isSaving && <span style={{ fontSize: 8, color: "var(--color-text-muted)" }}>saving...</span>}
                                      <button onClick={() => onOverrideCancel?.(cr.name)} style={{ fontSize: 10, padding: "0 5px", border: "none", borderRadius: 3, background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", marginLeft: "auto", lineHeight: 1.4 }} title="Close">
                                        ✕
                                      </button>
                                    </div>
                                    <textarea
                                      style={{ ...inputS, minHeight: 40, resize: "vertical" }}
                                      value={es?.reasoning ?? ""}
                                      onChange={(e) => onOverrideEdit?.(cr.name, "reasoning", e.target.value)}
                                      onBlur={() => onOverrideSave?.(cr.name)}
                                      placeholder="Revised reasoning..."
                                    />
                                    <input
                                      style={inputS}
                                      value={es?.reason ?? ""}
                                      onChange={(e) => onOverrideEdit?.(cr.name, "reason", e.target.value)}
                                      onBlur={() => onOverrideSave?.(cr.name)}
                                      placeholder="Why this change?"
                                    />
                                  </>
                                ) : ov ? (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: ov.newVerdict === "PASS" ? "var(--color-success-bg)" : "var(--color-danger-bg)", color: ov.newVerdict === "PASS" ? "var(--color-success)" : "var(--color-danger)" }}>
                                        {ov.newVerdict}
                                      </span>
                                      <span style={{ fontSize: 8, color: "var(--color-text-muted)" }}>
                                        (overrode <span style={{ textDecoration: "line-through" }}>{ov.originalVerdict}</span>)
                                      </span>
                                      <span style={{ fontSize: 8, color: "var(--color-accent-blue)", marginLeft: "auto" }}>
                                        by {ov.changedBy}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                                      {ov.newReasoning}
                                      {ov.reason && <span style={{ display: "block", fontSize: 9, color: "var(--color-accent-blue)", marginTop: 1, fontStyle: "italic" }}>"{ov.reason}"</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => onOverrideStart?.(cr.name)}
                                        style={{
                                          padding: "1px 6px", fontSize: 9,
                                          border: "1px solid var(--color-border-input)", borderRadius: 3,
                                          background: "transparent", cursor: "pointer", color: "var(--color-text-body)",
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => onOverrideDelete?.(cr.name)}
                                        style={{
                                          padding: "1px 6px", fontSize: 9,
                                          border: "1px solid var(--color-danger)", borderRadius: 3,
                                          background: "transparent", cursor: "pointer", color: "var(--color-danger)",
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  onOverrideStart && (
                                    <button
                                      onClick={() => onOverrideStart(cr.name)}
                                      style={{
                                        alignSelf: "flex-start", padding: "2px 8px", fontSize: 9,
                                        border: "1px solid var(--color-border-input)", borderRadius: 3,
                                        background: "transparent", cursor: "pointer", color: "var(--color-text-body)",
                                      }}
                                    >
                                      Override
                                    </button>
                                  )
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Findings section */}
            {response.sections && typeof response.sections === "object" && "findings" in (response.sections as Record<string, unknown>) && (
              <div style={{ padding: "16px 20px", borderTop: "1px solid var(--color-border-default)", marginTop: 8 }}>
                <div
                  className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded mb-3"
                  style={{ color: "var(--color-text-muted)", background: "var(--color-border-default)" }}
                >
                  Findings
                </div>
                {(Object.entries((response.sections as Record<string, unknown>).findings as Record<string, string>) ?? {}).length === 0 ? (
                  <div className="text-xs" style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
                    All checks passed — no findings to report.
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs mt-1 mb-3">
                    <tbody>
                      {(Object.entries((response.sections as Record<string, unknown>).findings as Record<string, string>) ?? {}).map(([field, value]) => (
                        <tr key={field} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                          <td className="py-2 pr-4" style={{ color: "var(--color-text-muted)", width: 180, whiteSpace: "nowrap" as const }}>
                            {humanize(field)}
                          </td>
                          <td className="py-2" style={{ color: "var(--color-text-body)", fontWeight: 500 }}>
                            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Pending comments */}
          {pendingComments && pendingComments.length > 0 && (
            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--color-border-default)" }}>
              <div
                className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded mb-3"
                style={{ color: "var(--color-text-muted)", background: "var(--color-border-default)" }}
              >
                Comments &mdash; {pendingComments.length}
              </div>
              {pendingComments.map((pc, j) => (
                <InlineCommentThread
                  key={j}
                  author="Reviewer"
                  selectedText={pc.selectedText}
                  comment={pc.comment}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Citation popover */}
      {activeCitation && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setActiveCitation(null)} />
          <div
            className="fixed z-[101] rounded-lg shadow-lg"
            style={{
              top: activeCitation.position.top,
              left: activeCitation.position.left,
              width: 360,
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-input)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--color-border-default)" }}
            >
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-header)" }}>
                UN {activeCitation.regulation} §{activeCitation.clause}
              </span>
              <button onClick={() => setActiveCitation(null)} className="cursor-pointer text-base bg-transparent border-none" style={{ color: "var(--color-text-muted)" }}>✕</button>
            </div>
            <div className="px-4 py-3 text-xs leading-relaxed" style={{ color: "var(--color-text-body)", whiteSpace: "pre-wrap" }}>
              {activeCitation.text}
            </div>
          </div>
        </>
      )}

      {/* Source citation modal */}
      {activeSourceCitation && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/15" onClick={() => setActiveSourceCitation(null)} />
          <div
            className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl max-h-[85vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
            style={{ background: "var(--color-bg-card)" }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-dark)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-base shrink-0" style={{ lineHeight: 1 }}>
                  {activeSourceCitation.filename.toLowerCase().endsWith(".pdf") ? "📄"
                    : activeSourceCitation.filename.toLowerCase().endsWith(".docx") ? "📝"
                    : ["png", "jpg", "jpeg", "gif", "webp", "bmp"].some(e => activeSourceCitation.filename.toLowerCase().endsWith(e)) ? "🖼️"
                    : "📃"}
                </span>
                <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text-header)" }}>
                  {activeSourceCitation.filename}
                </span>
                {activeSourceCitation.pageNumber && (
                  <span className="text-2xs font-medium px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--color-border-default)", color: "var(--color-text-muted)" }}>
                    p.{activeSourceCitation.pageNumber}
                  </span>
                )}
                {activeSourceCitation.highlightChunk && (
                  <span className="text-2xs font-medium px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber)" }}>
                    Chunk {activeSourceCitation.highlightChunk.id}
                  </span>
                )}
              </div>
              <button
                onClick={() => setActiveSourceCitation(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer bg-transparent border-none shrink-0 hover:bg-black/5"
                style={{ color: "var(--color-text-muted)", fontSize: 16 }}
              >
                ✕
              </button>
            </div>
            <div className="flex flex-1 overflow-hidden divide-x" style={{ borderColor: "var(--color-border-default)" }}>
              {activeSourceCitation.highlightChunk && activeSourceCitation.fileUrl && (
                <div className="flex-1 min-w-0 flex flex-col">
                  <div
                    className="text-2xs uppercase tracking-wider font-semibold px-5 pt-4 pb-1"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Document preview
                  </div>
                  <div className="flex-1 px-5 pb-4 min-h-0">
                    <SourceCitationFullPreview
                      key={activeSourceCitation.ref}
                      fileUrl={activeSourceCitation.fileUrl}
                      filename={activeSourceCitation.filename}
                      highlightChunk={activeSourceCitation.highlightChunk}
                      fullText={activeSourceCitation.text}
                      pageCount={activeSourceCitation.pageCount}
                    />
                  </div>
                </div>
              )}
              <div className="w-80 shrink-0 flex flex-col">
                <SourceCitationText
                  chunkText={activeSourceCitation.highlightChunk?.text || activeSourceCitation.excerpt}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Legacy Layout (pre-audit / non-structured content) ──

function LegacyLayout({
  response,
  skillName,
  sections,
  checkPills,
  checkResults,
  turnIndex,
  revisionFlags,
  onToggleFlag,
  onRevise,
  onCiteClick,
  onMouseUp,
  pendingComments,
  embedded,
}: {
  response: AgentResponse;
  skillName?: string;
  sections: { header: string; body: string }[];
  checkPills: { results: { name: string; verdict: string }[]; passed: number; total: number } | null;
  checkResults: { name: string; verdict: string }[] | null;
  turnIndex: number;
  clauseTexts?: Record<string, string>;
  citationSessionId?: string;
  revisionFlags?: Record<string, boolean>;
  onToggleFlag?: (turnIndex: number, field: string, flagged: boolean) => void;
  onRevise?: (turnIndex: number, revisionFields: string[]) => void;
  onCiteClick: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  pendingComments?: { selectedText: string; comment: string; occurrenceIndex: number }[];
  embedded?: boolean;
}) {
  const hasAnyFlagged = revisionFlags && Object.values(revisionFlags).some(Boolean);

  return (
    <div
      className={embedded ? "" : "mb-6 rounded-lg overflow-hidden animate-fade-in"}
      onClick={onCiteClick}
      onMouseUp={onMouseUp}
      style={embedded ? {} : {
        border: "1px solid var(--color-border-default)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        background: "var(--color-bg-card)",
      }}
    >
      <div
        className="px-6 py-4"
        style={{
          borderBottom: "1px solid var(--color-border-default)",
          background: "var(--color-bg-dark)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="font-bold" style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "1.15rem", lineHeight: 1.3 }}>
            {skillName ? `${skillName} Compliance Report` : "Compliance Report"}
          </span>
          <span className="text-2xs font-semibold px-2 py-0.5 rounded"
            style={{ background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)", fontFamily: "'DM Sans', sans-serif" }}>
            Audit Report
          </span>
        </div>
        <div className="flex items-center gap-3 text-2xs" style={{ color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>
          <span>{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          <span>·</span>
          <span>Examiner: AI</span>
          {response.sessionId && (
            <>
              <span>·</span>
              <span>Ref: #{response.sessionId.slice(-4)}</span>
            </>
          )}
        </div>
      </div>

      {checkPills && (
        <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
          <div
            className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded mb-3"
            style={{ color: "var(--color-text-muted)", background: "var(--color-border-default)" }}
          >
            Summary
          </div>
          <ul className="m-0 p-0 list-none">
            {checkPills.results.map((r) => (
              <li key={r.name} className="flex items-center gap-3 py-1">
                <VerdictBadge verdict={r.verdict as "PASS" | "FAIL"} />
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    document.querySelector(`[data-check="${r.name}"]`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="text-xs font-medium no-underline cursor-pointer"
                  style={{ color: "var(--color-accent-blue)" }}
                >
                  {humanize(r.name)}
                </a>
              </li>
            ))}
          </ul>
          <div className="text-2xs mt-2" style={{ color: "var(--color-text-muted)", fontFamily: "'DM Sans', sans-serif" }}>
            {checkPills.passed}/{checkPills.total} checks passed
          </div>
        </div>
      )}

      {response.validationErrors && (response.validationErrors as { message: string }[]).length > 0 && (
        <div className="px-6 py-3" style={{ borderBottom: "1px solid var(--color-border-default)", background: "var(--color-amber-bg)" }}>
          <div className="flex items-start gap-2">
            <span style={{ color: "var(--color-amber)", fontSize: 14, lineHeight: 1 }}>⚠️</span>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-amber)" }}>
                Validation Issues
              </div>
              <ul className="m-0 p-0 list-none">
                {(response.validationErrors as { message: string }[]).map((e, i) => (
                  <li key={i} className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 py-5" data-card-body="true">
        <style>{citationStyles}</style>

        {sections.map((sec, i) => {
          if (!sec.header) {
            return (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                {sec.body}
              </ReactMarkdown>
            );
          }
          const fieldName = sec.header;
          const cr = checkResults?.find((c) => c.name === fieldName);
          const checked = revisionFlags?.[fieldName] ?? false;
          return (
            <div key={i} data-check={fieldName} style={{ marginTop: i > 0 ? 28 : 0 }}>
              <div className="flex items-center gap-3 pb-2" style={{ marginBottom: 12, borderBottom: "1px solid var(--color-border-default)" }}>
                {revisionFlags !== undefined && (
                  <span
                    style={{
                      flexShrink: 0,
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 7px", borderRadius: 4,
                      cursor: "pointer", userSelect: "none",
                      fontSize: 10, fontWeight: 500,
                      fontFamily: "'DM Sans', sans-serif",
                      color: checked ? "var(--color-amber)" : "var(--color-text-muted)",
                      background: checked ? "var(--color-amber-bg)" : "transparent",
                      border: `1px solid ${checked ? "var(--color-amber-border)" : "var(--color-border-default)"}`,
                      transition: "all 0.12s ease",
                    }}
                    onClick={() => onToggleFlag?.(turnIndex, fieldName, !checked)}
                    title={checked ? "Remove flag" : "Flag for revision"}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M2 14V2M2 2l7 2.5L2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill={checked ? "currentColor" : "none"}/>
                    </svg>
                    {checked ? "Flagged" : "Flag"}
                  </span>
                )}
                <div className="flex items-center gap-2" style={{ cursor: revisionFlags !== undefined ? "pointer" : undefined }}
                  onClick={() => revisionFlags !== undefined && onToggleFlag?.(turnIndex, fieldName, !checked)}>
                  <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.02em", color: "var(--color-text-header)" }}>
                    {humanize(fieldName)}
                  </span>
                </div>
                {cr && <span style={{ marginLeft: "auto" }}><VerdictBadge verdict={cr.verdict as "PASS" | "FAIL"} /></span>}
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                {sec.body}
              </ReactMarkdown>
            </div>
          );
        })}

        {response.sections && typeof response.sections === "object" && "findings" in (response.sections as Record<string, unknown>) && (
          <div style={{ marginTop: 32, marginBottom: 20 }}>
            <div className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded mb-3"
              style={{ color: "var(--color-text-muted)", background: "var(--color-border-default)" }}>
              Findings
            </div>
            {(Object.entries((response.sections as Record<string, unknown>).findings as Record<string, string>) ?? {}).length === 0 ? (
              <div className="text-xs" style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
                All checks passed — no findings to report.
              </div>
            ) : (
              <table className="w-full border-collapse text-xs mt-1 mb-3">
                <tbody>
                  {(Object.entries((response.sections as Record<string, unknown>).findings as Record<string, string>) ?? {}).map(([field, value]) => (
                    <tr key={field} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                      <td className="py-2 pr-4" style={{ color: "var(--color-text-muted)", width: 180, whiteSpace: "nowrap" as const }}>
                        {humanize(field)}
                      </td>
                      <td className="py-2" style={{ color: "var(--color-text-body)", fontWeight: 500 }}>
                        <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ height: 1, background: "var(--color-border-default)", marginTop: 16 }} />
          </div>
        )}

        {response.confidence && (
          <div className="flex justify-end mt-4">
            <ConfidenceBadge confidence={response.confidence as ConfidenceData} />
          </div>
        )}
      </div>

      {pendingComments && pendingComments.length > 0 && (
        <div className="px-6 pb-5">
          {pendingComments.map((pc, j) => (
            <InlineCommentThread
              key={j}
              author="Reviewer"
              selectedText={pc.selectedText}
              comment={pc.comment}
            />
          ))}
        </div>
      )}

      <div className="px-6 py-4 flex gap-2" style={{ borderTop: "2px solid var(--color-border-default)", background: "var(--color-bg-dark)" }}>
        <button
          className="px-3 py-1.5 text-xs rounded-lg cursor-pointer"
          style={{
            background: hasAnyFlagged ? "var(--color-accent-blue)" : "transparent",
            border: "1px solid var(--color-border-input)",
            color: hasAnyFlagged ? "white" : "var(--color-text-body)",
          }}
          onClick={() => {
            if (!revisionFlags) { onRevise?.(turnIndex, []); return; }
            const flagged = Object.entries(revisionFlags)
              .filter(([, f]) => f)
              .map(([field]) => field);
            onRevise?.(turnIndex, flagged);
          }}
        >
          Revise Selected
        </button>
        <DownloadDropdown response={response} skillName={skillName} />
      </div>
    </div>
  );
}

// ── Helpers ──

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markChunkText(displayText: string, chunkText: string): string {
  const idx = displayText.indexOf(chunkText);
  if (idx < 0) return escapeHtml(displayText);
  const before = escapeHtml(displayText.substring(0, idx));
  const highlighted = escapeHtml(chunkText);
  const after = escapeHtml(displayText.substring(idx + chunkText.length));
  return `${before}<mark class="source-chunk-highlight" style="background:rgba(255,180,50,0.25);border-radius:2px;padding:1px 2px">${highlighted}</mark>${after}`;
}

function findHighlightChunk(
  sourceCitation: { chunks?: { id: string; text: string; html?: string; bbox?: HighlightChunk["bbox"]; wordBoxes?: HighlightChunk["wordBoxes"]; pageNumber?: number; pageWidth?: number; pageHeight?: number }[] } | undefined,
  _claims: { sourceCitation?: string }[] | undefined,
  ref: string,
): HighlightChunk | undefined {
  if (!sourceCitation?.chunks || sourceCitation.chunks.length === 0) return undefined;
  const chunkId = ref.includes(".") ? ref.split(".")[1] : undefined;
  const chunk = chunkId
    ? sourceCitation.chunks.find(ch => ch.id === chunkId)
    : sourceCitation.chunks[0];
  if (!chunk) {
    console.warn("[findHighlightChunk] chunkId=%s not found in chunks=%j, falling back to chunks[0]", chunkId, sourceCitation.chunks.map(c => c.id));
    return sourceCitation.chunks[0] ? {
      id: sourceCitation.chunks[0].id,
      text: sourceCitation.chunks[0].text,
      html: sourceCitation.chunks[0].html,
      bbox: sourceCitation.chunks[0].bbox,
      wordBoxes: sourceCitation.chunks[0].wordBoxes,
      pageNumber: sourceCitation.chunks[0].pageNumber,
      pageWidth: sourceCitation.chunks[0].pageWidth,
      pageHeight: sourceCitation.chunks[0].pageHeight,
    } : undefined;
  }
  return {
    id: chunk.id,
    text: chunk.text,
    html: chunk.html,
    bbox: chunk.bbox,
    wordBoxes: chunk.wordBoxes,
    pageNumber: chunk.pageNumber,
    pageWidth: chunk.pageWidth,
    pageHeight: chunk.pageHeight,
  };
}

function SourceCitationFullPreview({
  fileUrl,
  filename,
  highlightChunk,
  fullText,
  pageCount,
}: {
  fileUrl: string;
  filename: string;
  highlightChunk: HighlightChunk;
  fullText?: string;
  pageCount?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
  const isPdf = ext === "pdf" && !!highlightChunk.pageNumber;

  const contentHtml = useMemo(() => {
    if (isImage || isPdf) return null;
    const displayText = fullText || highlightChunk.text || "—";
    return markChunkText(displayText, highlightChunk.text || "");
  }, [isImage, isPdf, fullText, highlightChunk.text]);

  useEffect(() => {
    if (isImage || isPdf) return;
    const timer = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      const mark = container.querySelector<HTMLElement>(".source-chunk-highlight");
      if (mark) {
        const offsetTop = mark.offsetTop;
        const containerHeight = container.clientHeight;
        const targetScroll = offsetTop - containerHeight / 2 + mark.clientHeight / 2;
        container.scrollTo({ top: targetScroll, behavior: "smooth" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightChunk.id, highlightChunk.text, isImage, isPdf]);

  if (isPdf) {
    return (
      <PdfViewer
        fileUrl={fileUrl}
        highlight={
          highlightChunk.bbox && highlightChunk.pageWidth && highlightChunk.pageHeight && highlightChunk.pageNumber
            ? { bbox: highlightChunk.bbox, pageNumber: highlightChunk.pageNumber, pageWidth: highlightChunk.pageWidth, pageHeight: highlightChunk.pageHeight }
            : null
        }
        pageCount={pageCount}
      />
    );
  }

  if (isImage) {
    return (
      <div ref={scrollRef} className="rounded-lg relative overflow-auto" style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", height: "100%" }}>
        <div className="relative" style={{ width: "100%" }}>
          <img src={fileUrl} alt={filename} style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="rounded-lg overflow-auto" style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", height: "100%", fontSize: 13, lineHeight: 1.6, padding: 16, whiteSpace: "pre-wrap", color: "var(--color-text-body)" }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentHtml ?? "—") }}
    />
  );
}

function SourceCitationText({ chunkText }: { chunkText: string }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="text-2xs uppercase tracking-wider font-semibold px-5 pt-4 pb-1" style={{ color: "var(--color-text-muted)" }}>
        Cited text
      </div>
      <div className="flex-1 px-5 pb-4 min-h-0">
        <div className="h-full text-sm leading-relaxed p-4 rounded-lg whitespace-pre-wrap overflow-y-auto" style={{
          color: "var(--color-text-body)",
          background: "rgba(255, 180, 50, 0.06)",
          border: "1px solid rgba(255, 180, 50, 0.2)",
          borderLeft: "3px solid var(--color-amber-border)",
        }}>
          {chunkText || "—"}
        </div>
      </div>
    </div>
  );
}

// ── Confidence ──

type ConfidenceData = {
  score: number;
  ocrConfidence: number;
  dataCompleteness?: number;
  llmMultiplier: number;
  llmReasoning: string;
  needsExpert: boolean;
};

function confidenceColor(score: number): string {
  if (score >= 99) return "var(--color-success)";
  if (score >= 80) return "var(--color-success)";
  if (score >= 50) return "var(--color-amber)";
  return "var(--color-danger)";
}

function confidenceLabel(score: number): string {
  if (score >= 99) return "Trust";
  if (score >= 80) return "Reliable";
  if (score >= 50) return "Review";
  return "Expert needed";
}

function ConfidenceBadge({ confidence }: { confidence: ConfidenceData }) {
  const color = confidenceColor(confidence.score);
  const dataCompleteness = confidence.dataCompleteness ?? 100;
  return (
    <div className="relative inline-flex items-center gap-2 group" title={`OCR: ${confidence.ocrConfidence}% · Data: ${dataCompleteness}% · LLM: ×${confidence.llmMultiplier}\n${confidence.llmReasoning}`}>
      <span className="text-2xs font-semibold px-2 py-0.5 rounded" style={{ color, background: `${color}18` }}>
        {confidenceLabel(confidence.score)}
      </span>
      <span className="text-xs font-bold" style={{ color }}>
        {confidence.score.toFixed(0)}%
      </span>
      {confidence.needsExpert && (
        <span className="text-2xs font-medium px-1.5 py-0.5 rounded" style={{ color: "var(--color-danger)", background: "rgba(196, 113, 122, 0.12)" }}>
          Defer to expert
        </span>
      )}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
        <div className="p-3 rounded-lg shadow-lg text-xs" style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", whiteSpace: "nowrap" }}>
          <div style={{ color: "var(--color-text-header)", fontWeight: 600, marginBottom: 6 }}>Confidence Breakdown</div>
          <div style={{ color: "var(--color-text-body)" }}>OCR quality: <span style={{ fontWeight: 500 }}>{confidence.ocrConfidence}%</span></div>
          <div style={{ color: "var(--color-text-body)" }}>Data completeness: <span style={{ fontWeight: 500 }}>{dataCompleteness}%</span></div>
          <div style={{ color: "var(--color-text-body)" }}>LLM assessment: <span style={{ fontWeight: 500 }}>×{confidence.llmMultiplier}</span></div>
          <div style={{ color: "var(--color-text-muted)", marginTop: 4, maxWidth: 220, whiteSpace: "normal" }}>{confidence.llmReasoning}</div>
        </div>
      </div>
    </div>
  );
}

// ── Highlighting ──

function applyHighlights(
  content: string,
  comments?: { selectedText: string; occurrenceIndex: number }[]
): string {
  if (!comments || comments.length === 0) return content;
  let result = content;
  const sorted = [...comments].sort((a, b) => b.occurrenceIndex - a.occurrenceIndex);
  for (const c of sorted) {
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const idx = result.indexOf(c.selectedText, searchFrom);
      if (idx === -1) break;
      if (count === c.occurrenceIndex) {
        const mark = `<mark style="background:#f0c040;color:#000;border-radius:2px;padding:0 1px">${c.selectedText}</mark>`;
        result = result.slice(0, idx) + mark + result.slice(idx + c.selectedText.length);
        break;
      }
      count++;
      searchFrom = idx + 1;
    }
  }
  return result;
}

// ── Markdown components ──

const markdownComponents: Components = {
  p: ({ children }) => <p style={{ marginTop: 12, marginBottom: 0 }}>{children}</p>,
  strong: ({ children }) => (
    <strong style={{ color: "var(--color-text-header)", fontWeight: 600 }}>{children}</strong>
  ),
  table: ({ children }) => (
    <table className="w-full border-collapse text-xs mt-2">{children}</table>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="text-left px-3 py-2 text-xs uppercase tracking-wider"
      style={{ background: "var(--color-bg-card)", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border-default)" }}
    >{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>{children}</td>
  ),
  h2: ({ children }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, marginTop: 28 }}>
      <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "1rem", color: "var(--color-text-header)" }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "linear-gradient(to right, var(--color-border-default), transparent)" }} />
    </div>
  ),
  h3: ({ children }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 24 }}>
      <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "0.9rem", color: "var(--color-text-header)" }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "linear-gradient(to right, var(--color-border-default), transparent)" }} />
    </div>
  ),
};

// ── Styles ──

const citationStyles = `
.citation-marker {
  display: inline-flex;
  align-items: center;
  font-style: normal;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  padding: 2px 6px;
  margin: 0 2px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--color-accent-blue);
  background: var(--color-accent-blue-bg);
  border: 1px solid var(--color-accent-blue-border);
  vertical-align: middle;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.citation-marker:hover {
  background: rgba(41, 68, 171, 0.15);
  border-color: rgba(41, 68, 171, 0.3);
}
.source-citation-marker {
  display: inline-flex;
  align-items: center;
  font-style: normal;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  padding: 2px 6px;
  margin: 0 2px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border);
  vertical-align: middle;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.source-citation-marker:hover {
  background: rgba(196, 113, 122, 0.15);
  border-color: rgba(196, 113, 122, 0.3);
}
`;

const timelineStyles = `
.timeline-item::before {
  content: "";
  position: absolute;
  left: 29px;
  top: 36px;
  bottom: 0;
  width: 1.5px;
  background: var(--color-border-default);
}
.timeline-item[data-timeline-last="true"]::before {
  display: none;
}
`;

// ── Table normalizer ──

function normalizeTables(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tr = line.trim();
    const hasTabs = line.includes("\t");

    if (hasTabs && /\t/.test(line)) {
      const cells = line.split("\t").map((c) => c.trim()).filter((c) => c.length > 0);
      if (cells.length >= 2) {
        const isSeparator = cells.every((c) => /^-{3,}$/.test(c.replace(/[:\s]/g, "")));
        if (isSeparator) {
          result.push("|" + cells.map(() => "---").join("|") + "|");
        } else {
          result.push("| " + cells.join(" | ") + " |");
          if (!inTable) {
            const sepCells = cells.map(() => "---");
            result.push("|" + sepCells.join("|") + "|");
          }
        }
        inTable = true;
        continue;
      }
    }

    const hasPipes = tr.startsWith("|") && tr.includes("|", 1);
    if (hasPipes) {
      if (tr.includes("||")) {
        const rows = tr.split(/\|{2,}/).filter((s) => s.trim().length > 0);
        for (const row of rows) {
          const trimmed = row.trim();
          let fixed = trimmed.startsWith("|") ? trimmed : "| " + trimmed;
          fixed = fixed.endsWith("|") ? fixed : fixed + " |";
          result.push(fixed);
        }
        inTable = true;
        continue;
      }
      result.push(line);
      inTable = true;
      continue;
    }

    if (inTable && tr.length > 0 && !tr.startsWith("|") && !tr.includes("\t")) {
      inTable = false;
    }

    result.push(line);
  }

  return result.join("\n");
}

// ── Section parser ──

interface Section {
  header: string;
  body: string;
}

function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  const headerRegex = /^### (.+)$/gm;
  let lastIndex = 0;
  let lastHeader = "";
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(content)) !== null) {
    if (lastHeader) {
      sections.push({
        header: lastHeader,
        body: content.slice(lastIndex, match.index).replace(/^### .+\n?/, "").trim(),
      });
    } else if (match.index > 0) {
      sections.push({ header: "", body: content.slice(0, match.index).trim() });
    }
    if (match[1]) lastHeader = match[1].trim();
    lastIndex = match.index;
  }

  if (lastHeader) {
    sections.push({
      header: lastHeader,
      body: content.slice(lastIndex).replace(/^### .+\n?/, "").trim(),
    });
  } else if (content.trim()) {
    sections.push({ header: "", body: content.trim() });
  }

  return sections;
}

// ── Verdict Badge ──

function VerdictBadge({ verdict }: { verdict: "PASS" | "FAIL" | "PENDING" }) {
  const pass = verdict === "PASS";
  const pending = verdict === "PENDING";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-2xs font-semibold px-2 py-0.5"
      style={{
        fontFamily: "'DM Sans', sans-serif",
        borderRadius: 2,
        borderLeft: `3px solid ${pass ? "var(--color-success)" : pending ? "var(--color-text-muted)" : "var(--color-danger)"}`,
        background: pass ? "var(--color-success-bg)" : pending ? "var(--color-bg-dark)" : "var(--color-danger-bg)",
        color: pass ? "var(--color-success)" : pending ? "var(--color-text-muted)" : "var(--color-danger)",
      }}
    >
      {pending ? "○" : pass ? "✓" : "✗"} {verdict}
    </span>
  );
}

function humanize(slug: string): string {
  return slug
    .replace(/[-_.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripMd(md: string): string {
  return md.replace(/[#*_~`\[\]()>|]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function buildEnrichedContent(ar: AgentResponse): string {
  const parts: string[] = [];

  if (ar.verdict) {
    parts.push(`**Overall:** ${ar.verdict === "PASS" ? "✓ PASS" : "✗ FAIL"}`);
    parts.push("");
  }

  const checkResults = ar.checkResults as Array<Record<string, unknown>> | undefined;
  if (checkResults && checkResults.length > 0) {
    for (const cr of checkResults) {
      const passed = cr.verdict === "PASS";
      const icon = passed ? "✓" : "✗";
      parts.push(`### ${icon} ${humanize(cr.name as string)}`);
      parts.push(`**Verdict:** ${cr.verdict}`);
      parts.push("");

      if (cr.finding) {
        parts.push(stripMd(cr.finding as string));
        parts.push("");
      }

      const sourceCitations = cr.sourceCitations as Array<Record<string, unknown>> | undefined;
      if (sourceCitations && sourceCitations.length > 0) {
        parts.push("**Source References:**");
        for (const sc of sourceCitations) {
          const cited = (sc.extractedText as string) ?? (sc.keyExcerpt as string) ?? "";
          parts.push(`- ${sc.filename ?? "source"}: "${stripMd(cited).slice(0, 500)}"`);
        }
        parts.push("");
      }

      const citationRef = cr.citationRef as string[] | undefined;
      if (citationRef && citationRef.length > 0) {
        parts.push("**Regulation References:**");
        for (const ref of citationRef) {
          const dot = ref.indexOf(".");
          if (dot === -1) {
            parts.push(`- ${ref}`);
            continue;
          }
          const regulation = ref.substring(0, dot);
          const clause = ref.substring(dot + 1);
          const clauseKey = `${regulation}.${clause}`;
          const clauseText = ar.clauseTexts?.[clauseKey] ?? ar.clauseTexts?.[ref] ?? "";
          parts.push(`- ${regulation} §${clause}${clauseText ? `: ${stripMd(clauseText)}` : ""}`);
        }
        parts.push("");
      }
    }
  }

  return parts.join("\n");
}
