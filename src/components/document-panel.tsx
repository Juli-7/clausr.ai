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

      // Calculate which occurrence of this text the user selected
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
    <div ref={containerRef} className="px-10 py-8" style={{ maxWidth: "56rem", height: "100%", overflowY: "auto" }}>
      {turns.map((turn, i) =>
        turn.response ? (
          <DocumentCard
            key={i}
            turnIndex={i}
            turn={turn}
            skillName={skillName}
            clauseTexts={clauseTexts}
            pendingComments={pendingComments?.filter((c) => c.turnIndex === i)}
            onMouseUp={(e) => handleMouseUp(e, i)}
            onRevise={onRevise}
            revisionFlags={revisionFlags}
            onToggleFlag={onToggleFlag}
          />
        ) : null
      )}

      {loading && turns.length > 0 && !turns[turns.length - 1].response && (
        <ReportSkeleton stepStatus={stepStatus} />
      )}

      {loading && turns.length === 0 && (
        <ReportSkeleton stepStatus={stepStatus} />
      )}

      {turns.length > 0 && turns[turns.length - 1].error && (
        <div
          className="p-4 rounded-lg mt-4"
          style={{
            border: "1px solid var(--color-danger)",
            background: "rgba(196, 113, 122, 0.08)",
            color: "var(--color-danger)",
          }}
        >
          ⚠️ {turns[turns.length - 1].error}
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
        background: "#ffffff",
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
    lastHeader = match[1].trim();
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

function findHighlightChunk(
  sourceCitation: { chunks?: { id: string; text: string; html?: string; bbox?: HighlightChunk["bbox"]; wordBoxes?: HighlightChunk["wordBoxes"]; pageNumber?: number; pageWidth?: number; pageHeight?: number }[] } | undefined,
  claims: { sourceCitation?: string }[] | undefined,
  ref: string,
): HighlightChunk | undefined {
  if (!sourceCitation?.chunks) return undefined;
  const chunkId = ref.includes(".") ? ref.split(".")[1] : undefined;
  if (!chunkId) return undefined;
  const chunk = sourceCitation.chunks.find(ch => ch.id === chunkId);
  if (!chunk) return undefined;
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

function DocumentCard({
  turn,
  turnIndex,
  skillName,
  clauseTexts,
  pendingComments,
  onMouseUp,
  onRevise,
  revisionFlags,
  onToggleFlag,
}: {
  turn: ChatTurn;
  turnIndex: number;
  skillName?: string;
  clauseTexts?: Record<string, string>;
  pendingComments?: { selectedText: string; comment: string; occurrenceIndex: number }[];
  onMouseUp?: (e: React.MouseEvent) => void;
  onRevise?: (turnIndex: number, revisionFields: string[]) => void;
  revisionFlags?: Record<string, boolean>;
  onToggleFlag?: (turnIndex: number, field: string, flagged: boolean) => void;
}) {
  const { response } = turn;

  const [activeCitation, setActiveCitation] = useState<{
    regulation: string;
    clause: string;
    text: string;
    position: { top: number; left: number };
  } | null>(null);

  const [activeSourceCitation, setActiveSourceCitation] = useState<{
    ref: string;
    fileId?: string;
    filename: string;
    fileUrl?: string;
    excerpt: string;
    text: string;
    pageNumber?: number;
    highlightChunk?: HighlightChunk;
  } | null>(null);

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

  if (!response) return null;

  // Extract for use in click handlers (narrowed after null guard)
  const sourceCitations = response.sourceCitations;

  function handleContentClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;

    const cite = target.closest("cite.citation-marker") as HTMLElement | null;
    if (cite) {
      const regulation = cite.getAttribute("data-regulation") ?? "";
      const clause = cite.getAttribute("data-clause") ?? "";
      const rect = cite.getBoundingClientRect();
      // Handle multi-clause citations like "6.1, 6.2, 5.11"
      const clauseList = clause.split(/,\s*/);
      const clauseTextsList: string[] = [];
      for (const cl of clauseList) {
        const key = `${regulation}.${cl.trim()}`;
        const t = clauseTexts?.[key];
        if (t) clauseTextsList.push(`§${cl.trim()}: ${t}`);
      }
      const text = clauseTextsList.length > 0 ? clauseTextsList.join("\n\n") : "Clause text not available.";
      // Clamp popover position so it doesn't overflow the viewport
      const popoverW = 360;
      const popoverH = 300;
      const gap = 6;
      const left = Math.max(gap, Math.min(rect.left - 100, window.innerWidth - popoverW - gap));
      const top = rect.bottom + gap + popoverH > window.innerHeight
        ? Math.max(gap, rect.top - popoverH - gap)
        : rect.bottom + gap;
      setActiveSourceCitation(null);
      setActiveCitation({
        regulation,
        clause,
        text,
        position: { top, left },
      });
    } else {
      const scite = target.closest("cite.source-citation-marker") as HTMLElement | null;
      if (scite) {
        const ref = scite.getAttribute("data-source-citation") ?? "";
        const sc = sourceCitations?.find(r => r.ref === ref);
        const filename = sc?.filename ?? "Unknown file";
        const excerpt = sc?.keyExcerpt ?? "";
        const text = sc?.extractedText ?? "";
        setActiveCitation(null);
        setActiveSourceCitation({
          ref,
          fileId: sc?.fileId,
          filename,
          fileUrl: sc?.fileUrl,
          excerpt,
          text,
          highlightChunk: findHighlightChunk(sc, response?.claims, ref),
          pageNumber: sc?.pageNumber,
        });
      } else {
        setActiveCitation(null);
        setActiveSourceCitation(null);
      }
    }
  }

  return (
    <div
      className="mb-6 rounded-lg overflow-hidden animate-fade-in"
      onClick={handleContentClick}
      onMouseUp={onMouseUp}
      style={{
        border: "1px solid var(--color-border-default)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        background: "#ffffff",
      }}
    >
      {/* Card header */}
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
            style={{ background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)", fontFamily: "'JetBrains Mono', monospace" }}>
            Round {response.round}/5
          </span>
        </div>
        <div className="flex items-center gap-3 text-2xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
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

      {/* Validation warning banner */}
      {response.validationErrors && response.validationErrors.length > 0 && (
        <div
          className="px-6 py-3"
          style={{
            borderBottom: "1px solid var(--color-border-default)",
            background: "var(--color-amber-bg)",
          }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "var(--color-amber)", fontSize: 14, lineHeight: 1 }}>⚠️</span>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-amber)" }}>
                Validation Issues
              </div>
              <ul className="m-0 p-0 list-none">
                {response.validationErrors.map((e, i) => (
                  <li key={i} className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Card body */}
      <div className="px-6 py-5" data-card-body="true" onClick={handleContentClick}>
        <style>{citationStyles}</style>

        {/* Narrative report from LLM analysis */}
        {revisionFlags ? (
          sections.map((sec, i) => {
            if (!sec.header) {
              return (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                  {sec.body}
                </ReactMarkdown>
              );
            }
            const fieldName = sec.header;
            const checked = revisionFlags?.[fieldName] ?? false;
            return (
              <div key={i}>
                <div className="revision-row" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 24, cursor: "pointer" }}
                  onClick={() => onToggleFlag?.(turnIndex, fieldName, !checked)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 3, color: checked ? "#E2A6A9" : "#2944AB" }}>
                    <path d="M4 2v12M4 2l8 3-8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {checked && <circle cx="4" cy="2" r="1.5" fill="currentColor"/>}
                  </svg>
                  <span style={{ fontSize: 20, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: checked ? "#E2A6A9" : "#2944AB" }}>
                    {humanize(fieldName)}
                  </span>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
                  {sec.body}
                </ReactMarkdown>
              </div>
            );
          })
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
            {highlightedContent}
          </ReactMarkdown>
        )}

        {/* Findings section (FAIL-only) — no checkboxes, display only */}
        {response.sections?.findings !== undefined && typeof response.sections.findings === "object" && (
          <div style={{ marginTop: 32, marginBottom: 20 }}>
            <div
              className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded mb-3"
              style={{ color: "var(--color-text-muted)", background: "var(--color-border-default)" }}
            >
              Findings
            </div>
            {(Object.entries(response.sections.findings) as [string, string][]).length === 0 ? (
              <div className="text-xs" style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
                All checks passed — no findings to report.
              </div>
            ) : (
              <table className="w-full border-collapse text-xs mt-1 mb-3">
                <tbody>
                  {(Object.entries(response.sections.findings) as [string, string][]).map(([field, value]) => (
                    <tr key={field} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                      <td className="py-2 pr-4" style={{ color: "var(--color-text-muted)", width: 180, whiteSpace: "nowrap" as const }}>
                        {humanize(field)}
                      </td>
                      <td className="py-2" style={{ color: "var(--color-text-body)", fontWeight: 500 }}>
                        <span dangerouslySetInnerHTML={{ __html: applyHighlights(value, pendingComments) }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ height: 1, background: "var(--color-border-default)", marginTop: 16 }} />
          </div>
        )}

        {/* Confidence badge */}
        {response.confidence && (
          <div className="flex justify-end mt-4">
            <ConfidenceBadge confidence={response.confidence} />
          </div>
        )}

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
                <button onClick={() => setActiveCitation(null)} className="text-text-muted cursor-pointer text-base bg-transparent border-none">✕</button>
              </div>
              <div className="px-4 py-3 text-xs leading-relaxed" style={{ color: "var(--color-text-body)", whiteSpace: "pre-wrap" }}>
                {activeCitation.text}
              </div>
            </div>
          </>
        )}

        {/* Source citation panel — centered, not full-screen */}
        {activeSourceCitation && (
          <>
            <div className="fixed inset-0 z-[100] bg-black/10" onClick={() => setActiveSourceCitation(null)} />
            <div
              className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-3xl max-h-[85vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
              style={{ background: "var(--color-bg-card)" }}
            >
              <div
                className="flex items-center justify-between px-5 py-3 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--color-border-default)" }}
              >
                <span className="text-sm font-semibold" style={{ color: "var(--color-text-header)" }}>
                  Source: {activeSourceCitation.filename}
                  {activeSourceCitation.highlightChunk && ` — Chunk ${activeSourceCitation.highlightChunk.id}`}
                  {activeSourceCitation.pageNumber && ` (Page ${activeSourceCitation.pageNumber})`}
                </span>
                <button onClick={() => setActiveSourceCitation(null)} className="text-xl cursor-pointer bg-transparent border-none" style={{ color: "var(--color-text-muted)", lineHeight: 1 }}>✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {/* Visual preview with chunk highlighted — format-agnostic, driven by available data */}
                {activeSourceCitation.highlightChunk && activeSourceCitation.fileUrl && (
                  <SourceCitationFullPreview
                    fileUrl={activeSourceCitation.fileUrl}
                    filename={activeSourceCitation.filename}
                    highlightChunk={activeSourceCitation.highlightChunk}
                  />
                )}
                {/* Full extracted text with chunk highlighted */}
                <SourceCitationText
                  fullText={activeSourceCitation.text}
                  chunkText={activeSourceCitation.highlightChunk?.text || activeSourceCitation.excerpt}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pending comments for this turn */}
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

      {/* Actions footer — Revise Selected + Download */}
      <div
        className="px-6 py-4 flex gap-2"
        style={{
          borderTop: "2px solid var(--color-border-default)",
          background: "var(--color-bg-dark)",
        }}
      >
        <button
          className="px-3 py-1.5 text-xs rounded-lg cursor-pointer"
          style={{
            background: revisionFlags && Object.values(revisionFlags).some((f) => f)
              ? "var(--color-accent-blue)" : "transparent",
            border: "1px solid var(--color-border-input)",
            color: revisionFlags && Object.values(revisionFlags).some((f) => f)
              ? "white" : "var(--color-text-body)",
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
        <DownloadDropdown
          response={response}
          skillName={skillName}
        />
      </div>
    </div>
  );
}

function SourceCitationFullPreview({
  fileUrl,
  filename,
  highlightChunk,
}: {
  fileUrl: string;
  filename: string;
  highlightChunk: HighlightChunk;
}) {
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number; ox: number; oy: number } | null>(null);

  // Only render for image/PDF — full page with word box overlays.
  // Skip HTML chunks: showing highlightChunk.html means the entire preview
  // is the chunk itself fully highlighted, which provides no context.
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const pageUrl = isPdf && highlightChunk.pageNumber
    ? `${fileUrl.replace(/\/+$/, "")}/page/${highlightChunk.pageNumber}`
    : fileUrl;

  const highlightRects: { x: number; y: number; width: number; height: number }[] = [];
  if (highlightChunk.wordBoxes && displaySize) {
    const refWidth = highlightChunk.pageWidth ?? 0;
    const refHeight = highlightChunk.pageHeight ?? 0;
    if (refWidth > 0 && refHeight > 0) {
      const sx = displaySize.w / refWidth;
      const sy = displaySize.h / refHeight;
      for (const wb of highlightChunk.wordBoxes) {
        highlightRects.push({
          x: wb.x * sx + displaySize.ox,
          y: wb.y * sy + displaySize.oy,
          width: wb.width * sx,
          height: wb.height * sy,
        });
      }
    }
  }

  return (
    <div
      className="rounded-lg relative overflow-hidden flex items-center justify-center"
      style={{
        background: "var(--color-bg-dark)",
        border: "1px solid var(--color-border-default)",
        minHeight: 200,
        maxHeight: "55vh",
      }}
    >
      <img
        src={pageUrl}
        alt={`${filename}${highlightChunk.pageNumber ? ` page ${highlightChunk.pageNumber}` : ""}`}
        style={{ maxWidth: "100%", maxHeight: "55vh", objectFit: "contain", display: "block" }}
        onLoad={(e) => {
          const img = e.currentTarget;
          const parent = img.parentElement;
          if (!parent) return;
          const cw = parent.clientWidth;
          const ch = parent.clientHeight;
          const refW = highlightChunk.pageWidth ?? img.naturalWidth;
          const refH = highlightChunk.pageHeight ?? img.naturalHeight;
          if (refW <= 0 || refH <= 0) return;
          const scale = Math.min(cw / refW, ch / refH);
          setDisplaySize({
            w: refW * scale,
            h: refH * scale,
            ox: (cw - refW * scale) / 2,
            oy: (ch - refH * scale) / 2,
          });
        }}
      />
      {highlightRects.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {highlightRects.map((rect, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                background: "rgba(255, 180, 50, 0.3)",
                border: "1px solid rgba(255, 150, 30, 0.7)",
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function SourceCitationText({
  fullText,
  chunkText,
}: {
  fullText?: string;
  chunkText: string;
}) {
  const displayText = fullText || chunkText || "No text extracted.";
  const idx = chunkText ? displayText.indexOf(chunkText) : -1;
  const safeBefore = escapeHtml(displayText.substring(0, idx >= 0 ? idx : displayText.length));
  const safeAfter = idx >= 0 ? escapeHtml(displayText.substring(idx + chunkText.length)) : "";
  const safeHighlight = idx >= 0 ? escapeHtml(chunkText) : "";
  const html = idx >= 0
    ? safeBefore + `<mark class="source-chunk-highlight">${safeHighlight}</mark>` + safeAfter
    : safeBefore;

  return (
    <div className="mt-4">
      <div className="text-2xs uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>
        Extracted text
      </div>
      <div
        className="text-sm leading-relaxed p-3 rounded whitespace-pre-wrap"
        style={{
          color: "var(--color-text-body)",
          background: "var(--color-bg-dark)",
          borderLeft: "2px solid var(--color-amber-border)",
          maxHeight: "40vh",
          overflowY: "auto",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .source-chunk-highlight {
          background: rgba(255, 180, 50, 0.25);
          border-left: 3px solid rgba(255, 150, 30, 0.7);
          padding: 1px 4px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}

// ── Confidence Badge ──

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

function ConfidenceBadge({ confidence }: { confidence: { score: number; ocrConfidence: number; dataCompleteness?: number; llmMultiplier: number; llmReasoning: string; needsExpert: boolean } }) {
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
      {/* Tooltip popover on hover */}
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
  // Sort descending so earlier replacements don't shift positions of later ones
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

// ── Shared markdown component overrides ──

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
  border: 1px solid rgba(41, 68, 171, 0.18);
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
  background: rgba(196, 113, 122, 0.08);
  border: 1px solid rgba(196, 113, 122, 0.18);
  vertical-align: middle;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.source-citation-marker:hover {
  background: rgba(196, 113, 122, 0.15);
  border-color: rgba(196, 113, 122, 0.3);
}
`;

// ── Table normalizer ──

function normalizeTables(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tr = line.trim();
    const hasTabs = line.includes("\t");

    // Tab-separated → pipe-separated
    if (hasTabs && /\t/.test(line)) {
      const cells = line.split("\t").map((c) => c.trim()).filter((c) => c.length > 0);
      if (cells.length >= 2) {
        // Detect separator rows (all cells are dashes like ---, ------, etc.)
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

    // Pipe-separated — detect concatenated rows
    const hasPipes = tr.startsWith("|") && tr.includes("|", 1);
    if (hasPipes) {
      // Double pipes mean concatenated rows
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

      // Normal pipe row — separator already provided by LLM
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

function humanize(slug: string): string {
  return slug
    .replace(/[-_.]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
