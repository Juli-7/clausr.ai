"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import { SourceCitationCard } from "@/components/source-citation-card";
import type { HighlightChunk } from "@/components/source-citation-card";
import { InlineCommentThread } from "@/components/inline-comment";
import { CommentPopover } from "@/components/comment-popover";
import { DownloadDropdown } from "@/components/download-dropdown";
import type { Citation } from "@/lib/agent/types";
import type { ChatTurn } from "@/lib/agent/turn-types";
import type { ReportTemplate } from "@/lib/agent/template-types";

interface DocumentPanelProps {
  turns: ChatTurn[];
  loading: boolean;
  stepStatus?: string | null;
  skillName?: string;
  sessionId?: string;
  template?: ReportTemplate | null;
  clauseTexts?: Record<string, string>;
  pendingComments?: { selectedText: string; comment: string; turnIndex: number; occurrenceIndex: number }[];
  onAddComment?: (turnIndex: number, selectedText: string, comment: string, occurrenceIndex: number) => void;
  onRevise?: (turnIndex: number) => void;
}

export function DocumentPanel({
  turns,
  loading,
  stepStatus,
  skillName,
  sessionId,
  template,
  clauseTexts,
  pendingComments,
  onAddComment,
  onRevise,
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
        style={{ color: "var(--color-amber)", fontSize: 13 }}
      >
        Select a skill from the sidebar and type a question to begin.
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
            sessionId={sessionId}
            template={template}
            clauseTexts={clauseTexts}
            pendingComments={pendingComments?.filter((c) => c.turnIndex === i)}
            onMouseUp={(e) => handleMouseUp(e, i)}
            onRevise={onRevise}
          />
        ) : null
      )}

      {loading && turns.length > 0 && !turns[turns.length - 1].response && (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              {formatLoadingMessage(stepStatus)}
            </span>
          </div>
        </div>
      )}

      {loading && turns.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              {formatLoadingMessage(stepStatus)}
            </span>
          </div>
        </div>
      )}

      {turns.length > 0 && turns[turns.length - 1].error && (
        <div
          className="p-4 rounded-lg mt-4"
          style={{
            border: "1px solid var(--color-danger)",
            background: "#f8514911",
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

function findHighlightChunk(
  sourceCitation: { chunks?: { id: string; text: string; bbox?: HighlightChunk["bbox"]; wordBoxes?: HighlightChunk["wordBoxes"]; pageNumber?: number }[] } | undefined,
  claims: { chunkRef?: string; sourceRef?: number }[] | undefined,
  ref: number,
): HighlightChunk | undefined {
  if (!claims || !sourceCitation?.chunks) return undefined;
  const matchingClaim = claims.find(c => {
    if (c.chunkRef) {
      const m = c.chunkRef.match(/^S(\d+)\.(.+)$/);
      return m && parseInt(m[1], 10) === ref;
    }
    return c.sourceRef === ref;
  });
  if (matchingClaim?.chunkRef) {
    const chunkMatch = matchingClaim.chunkRef.match(/^S\d+\.(.+)$/);
    const chunkId = chunkMatch?.[1];
    const chunk = chunkId ? sourceCitation.chunks.find(ch => ch.id === chunkId) : undefined;
    if (chunk) {
      return {
        id: chunk.id,
        text: chunk.text,
        bbox: chunk.bbox,
        wordBoxes: chunk.wordBoxes,
        pageNumber: chunk.pageNumber,
      };
    }
  }
  return undefined;
}

function DocumentCard({
  turn,
  turnIndex,
  skillName,
  sessionId,
  template,
  clauseTexts,
  pendingComments,
  onMouseUp,
  onRevise,
}: {
  turn: ChatTurn;
  turnIndex: number;
  skillName?: string;
  sessionId?: string;
  template?: ReportTemplate | null;
  clauseTexts?: Record<string, string>;
  pendingComments?: { selectedText: string; comment: string; occurrenceIndex: number }[];
  onMouseUp?: (e: React.MouseEvent) => void;
  onRevise?: (turnIndex: number) => void;
}) {
  const { response } = turn;
  if (!response) return null;

  // Extract for use in click handlers (narrowed after null guard)
  const sourceCitations = response.sourceCitations;

  const [activeCitation, setActiveCitation] = useState<{
    regulation: string;
    clause: string;
    text: string;
    position: { top: number; left: number };
  } | null>(null);

  const [activeSourceCitation, setActiveSourceCitation] = useState<{
    ref: number;
    fileId?: string;
    filename: string;
    fileUrl?: string;
    excerpt: string;
    text: string;
    pageNumber?: number;
    highlightChunk?: HighlightChunk;
    position: { top: number; left: number };
  } | null>(null);

  // Normalize tables, then enhance citations to inline HTML, then apply highlights
  const normalizedContent = useMemo(
    () => normalizeTables(response.content),
    [response.content]
  );
  const enhancedContent = useMemo(
    () => enhanceCitations(normalizedContent, response.citations, sourceCitations),
    [normalizedContent, response.citations, sourceCitations]
  );
  const highlightedContent = useMemo(
    () => applyHighlights(enhancedContent, pendingComments),
    [enhancedContent, pendingComments]
  );

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
      setActiveSourceCitation(null);
      setActiveCitation({
        regulation,
        clause,
        text,
        position: {
          top: rect.bottom + 6,
          left: Math.max(10, rect.left - 100),
        },
      });
    } else {
      const scite = target.closest("cite.source-citation-marker") as HTMLElement | null;
      if (scite) {
        const ref = parseInt(scite.getAttribute("data-source-ref") ?? "0", 10);
        const sc = sourceCitations?.find(r => r.ref === ref);
        const filename = sc?.filename ?? "Unknown file";
        const excerpt = sc?.keyExcerpt ?? "";
        const text = sc?.extractedText ?? "";
        const rect = scite.getBoundingClientRect();

        const highlightChunk = findHighlightChunk(sc, response?.claims, ref);

        setActiveCitation(null);
        setActiveSourceCitation({
          ref,
          fileId: sc?.fileId,
          filename,
          fileUrl: sc?.fileUrl,
          excerpt,
          text,
          pageNumber: sc?.pageNumber,
          highlightChunk,
          position: {
            top: rect.bottom + 6,
            left: Math.max(10, rect.left - 100),
          },
        });
      } else {
        setActiveCitation(null);
        setActiveSourceCitation(null);
      }
    }
  }

  return (
    <div
      className="mb-6 rounded-lg overflow-hidden"
      onMouseUp={onMouseUp}
      style={{
        border: "1px solid var(--color-border-default)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        background: "var(--color-bg-card)",
      }}
    >
      {/* Card header */}
      <div
        className="px-6 py-4"
        style={{
          borderBottom: "2px solid var(--color-border-default)",
          background: "var(--color-bg-dark)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold" style={{ color: "var(--color-text-header)" }}>
            {skillName ? `${skillName} Compliance Report` : "Compliance Report"}
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{
              color: response.verdict === "FAIL" ? "var(--color-danger)" : "var(--color-success)",
              background: response.verdict === "FAIL" ? "#f8514918" : "#3fb95018",
            }}
          >
            Round {response.round}/5
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          <span>{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          <span>·</span>
          <span>Examiner: AI</span>
          {sessionId && (
            <>
              <span>·</span>
              <span>Ref: #{sessionId.slice(-4)}</span>
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
            background: "#f8514911",
          }}
        >
          <div className="flex items-start gap-2">
            <span style={{ color: "var(--color-danger)", fontSize: 14, lineHeight: 1 }}>⚠️</span>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-danger)" }}>
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

        {template && response.sections ? (
          // ── Template-aware rendering: iterate template sections ──
          template.sections.map((section) => {
            const sectionData = response.sections?.[section.id];

            return (
              <div key={section.id} style={{ marginBottom: 20 }}>
                {/* Section header */}
                <div
                  className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded mb-3"
                  style={{ color: "var(--color-text-muted)", background: "var(--color-border-default)" }}
                >
                  {section.title}
                </div>

                {section.type === "fields" && section.fields && typeof sectionData === "object" && sectionData ? (
                  <table className="w-full border-collapse text-xs mt-1 mb-3">
                    <tbody>
                      {section.fields.map((f) => (
                        <tr key={f.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                          <td className="py-2 pr-4" style={{ color: "var(--color-text-muted)", width: 180, whiteSpace: "nowrap" as const }}>
                            {f.label}
                          </td>
                          <td className="py-2" style={{ color: "var(--color-text-body)", fontWeight: 500 }}>
                            <span dangerouslySetInnerHTML={{ __html: applyHighlights(enhanceCitations((sectionData as Record<string, string>)[f.id] ?? "—", response.citations, sourceCitations), pendingComments) }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {section.type === "markdown" && typeof sectionData === "string" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={markdownComponents}
                  >
                    {applyHighlights(enhanceCitations(sectionData, response.citations, sourceCitations), pendingComments)}
                  </ReactMarkdown>
                ) : null}

                {section.type === "table" && typeof sectionData === "string" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={markdownComponents}
                  >
                    {applyHighlights(enhanceCitations(sectionData, response.citations, sourceCitations), pendingComments)}
                  </ReactMarkdown>
                ) : null}

                {section.type === "verdict" ? (
                  <div className="p-4 rounded-lg mt-2" style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase" style={{ color: response.verdict === "FAIL" ? "var(--color-danger)" : "var(--color-success)" }}>
                        {response.verdict === "FAIL" ? "✗ FAIL" : "✓ PASS"}
                      </span>
                      {response.confidence ? (
                        <ConfidenceBadge confidence={response.confidence} />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Thin section divider */}
                <div style={{ height: 1, background: "var(--color-border-default)", marginTop: 16 }} />
              </div>
            );
          })
        ) : (
          // ── Fallback: render raw markdown (current behavior) ──
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={markdownComponents}
          >
            {highlightedContent}
          </ReactMarkdown>
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

        {/* Source citation popover */}
        {activeSourceCitation && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setActiveSourceCitation(null)} />
            <div
              className="fixed z-[101] rounded-lg shadow-lg"
              style={{
                top: activeSourceCitation.position.top,
                left: activeSourceCitation.position.left,
                width: 380,
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-amber-border)",
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid var(--color-border-default)" }}
              >
                <span className="text-xs font-semibold" style={{ color: "var(--color-text-header)" }}>
                  Source: {activeSourceCitation.filename}
                  {activeSourceCitation.highlightChunk && ` — Chunk ${activeSourceCitation.highlightChunk.id}`}
                </span>
                <button onClick={() => setActiveSourceCitation(null)} className="text-text-muted cursor-pointer text-base bg-transparent border-none">✕</button>
              </div>
              {/* Image preview with highlight */}
              {activeSourceCitation.highlightChunk && activeSourceCitation.fileUrl && (
                <SourceCitationPopoverImage
                  fileUrl={activeSourceCitation.fileUrl}
                  filename={activeSourceCitation.filename}
                  highlightChunk={activeSourceCitation.highlightChunk}
                />
              )}
              {/* Cited excerpt */}
              <div className="px-4 py-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>
                  {activeSourceCitation.highlightChunk ? "Cited excerpt" : "Key excerpt"}
                </div>
                <div className="text-xs leading-relaxed" style={{ color: "var(--color-text-body)" }}>
                  {activeSourceCitation.highlightChunk?.text || activeSourceCitation.excerpt}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Extracted text
                </div>
                <div
                  className="text-xs leading-relaxed p-2 rounded"
                  style={{
                    color: "var(--color-text-muted)",
                    background: "var(--color-bg-dark)",
                    borderLeft: "2px solid var(--color-amber-border)",
                    whiteSpace: "pre-wrap",
                    maxHeight: 180,
                    overflowY: "auto",
                  }}
                >
                  {activeSourceCitation.text || "No text extracted."}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Source citations */}
      {response.sourceCitations && response.sourceCitations.length > 0 && (
        <div className="px-6 py-4" style={{ borderTop: "1px solid var(--color-border-default)" }}>
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            📄 Source Evidence
          </div>
          <div className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
            Referenced source files used in this assessment.
          </div>
          {response.sourceCitations.map((sc) => {
            const highlightChunk = findHighlightChunk(sc, response.claims, sc.ref);
            return (
              <SourceCitationCard
                key={sc.ref}
                refNumber={sc.ref}
                fileId={sc.fileId}
                filename={sc.filename}
                fileUrl={sc.fileUrl}
                extractedText={sc.extractedText}
                keyExcerpt={sc.keyExcerpt}
                pageNumber={sc.pageNumber}
                highlightChunk={highlightChunk}
              />
            );
          })}
        </div>
      )}

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

      {/* Actions footer — Revise + Download */}
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
            background: "transparent",
            border: "1px solid var(--color-border-input)",
            color: "var(--color-text-body)",
          }}
          onClick={() => onRevise?.(turnIndex)}
        >
          Revise
        </button>
        <DownloadDropdown
          response={response}
          template={template ?? undefined}
          skillName={skillName}
        />
      </div>

      {/* Verdict box — only shown in fallback mode (template renders verdict inline) */}
      {response.verdict && !(template && response.sections) && (
        <div
          className="mx-6 mb-5 p-4 rounded-lg"
          style={{
            border: `1px solid ${response.verdict === "FAIL" ? "var(--color-danger)" : "var(--color-success)"}`,
            background: response.verdict === "FAIL" ? "#f8514911" : "#3fb95011",
          }}
        >
          <span
            className="text-xs font-bold uppercase"
            style={{
              color: response.verdict === "FAIL" ? "var(--color-danger)" : "var(--color-success)",
            }}
          >
            {response.verdict === "FAIL" ? "✗ FAIL" : "✓ PASS"}
          </span>
        </div>
      )}
    </div>
  );
}

function SourceCitationPopoverImage({
  fileUrl,
  filename,
  highlightChunk,
}: {
  fileUrl: string;
  filename: string;
  highlightChunk: HighlightChunk;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number; ox: number; oy: number } | null>(null);

  const highlightRects: { x: number; y: number; width: number; height: number }[] = [];
  if (highlightChunk.wordBoxes && displaySize && imgRef.current) {
    const nw = imgRef.current.naturalWidth;
    const nh = imgRef.current.naturalHeight;
    if (nw > 0 && nh > 0) {
      const sx = displaySize.w / nw;
      const sy = displaySize.h / nh;
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
    <div className="px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--color-text-muted)" }}>
        Source region
      </div>
      <div
        className="rounded relative overflow-hidden flex items-center justify-center"
        style={{
          height: 120,
          background: "var(--color-bg-dark)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <img
          ref={imgRef}
          src={fileUrl}
          alt={filename}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          onLoad={(e) => {
            const img = e.currentTarget;
            const cw = 352; // container width minus padding
            const ch = 120;
            const nw = img.naturalWidth;
            const nh = img.naturalHeight;
            const scale = Math.min(cw / nw, ch / nh);
            setDisplaySize({
              w: nw * scale,
              h: nh * scale,
              ox: (cw - nw * scale) / 2,
              oy: (ch - nh * scale) / 2,
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
    </div>
  );
}

// ── Confidence Badge ──

function confidenceColor(score: number): string {
  if (score >= 99) return "#1a7f37";
  if (score >= 80) return "#3fb950";
  if (score >= 50) return "#d29922";
  return "#f85149";
}

function confidenceLabel(score: number): string {
  if (score >= 99) return "Trust";
  if (score >= 80) return "Reliable";
  if (score >= 50) return "Review";
  return "Expert needed";
}

function ConfidenceBadge({ confidence }: { confidence: { score: number; ocrConfidence: number; dataCompleteness: number; llmMultiplier: number; llmReasoning: string; needsExpert: boolean } }) {
  const color = confidenceColor(confidence.score);
  return (
    <div className="relative inline-flex items-center gap-2 group" title={`OCR: ${confidence.ocrConfidence}% · Data: ${confidence.dataCompleteness}% · LLM: ×${confidence.llmMultiplier}\n${confidence.llmReasoning}`}>
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ color, background: `${color}18` }}>
        {confidenceLabel(confidence.score)}
      </span>
      <span className="text-xs font-bold" style={{ color }}>
        {confidence.score.toFixed(0)}%
      </span>
      {confidence.needsExpert && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: "#f85149", background: "#f8514918" }}>
          Defer to expert
        </span>
      )}
      {/* Tooltip popover on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
        <div className="p-3 rounded-lg shadow-lg text-xs" style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", whiteSpace: "nowrap" }}>
          <div style={{ color: "var(--color-text-header)", fontWeight: 600, marginBottom: 6 }}>Confidence Breakdown</div>
          <div style={{ color: "var(--color-text-body)" }}>OCR quality: <span style={{ fontWeight: 500 }}>{confidence.ocrConfidence}%</span></div>
          <div style={{ color: "var(--color-text-body)" }}>Data completeness: <span style={{ fontWeight: 500 }}>{confidence.dataCompleteness}%</span></div>
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
  p: ({ children, ..._rest }) => <p style={{ marginTop: 12, marginBottom: 0 }}>{children}</p>,
  strong: ({ children, ..._rest }) => (
    <strong style={{ color: "var(--color-text-header)", fontWeight: 600 }}>{children}</strong>
  ),
  table: ({ children, ..._rest }) => (
    <table className="w-full border-collapse text-xs mt-2">{children}</table>
  ),
  thead: ({ children, ..._rest }) => <thead>{children}</thead>,
  tbody: ({ children, ..._rest }) => <tbody>{children}</tbody>,
  tr: ({ children, ..._rest }) => <tr>{children}</tr>,
  th: ({ children, ..._rest }) => (
    <th className="text-left px-3 py-2 text-xs uppercase tracking-wider"
      style={{ background: "var(--color-bg-card)", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border-default)" }}
    >{children}</th>
  ),
  td: ({ children, ..._rest }) => (
    <td className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>{children}</td>
  ),
  h2: ({ children, ..._rest }) => (
    <div className="mb-7 mt-1">
      <span className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded mb-2"
        style={{ color: "var(--color-text-muted)", background: "var(--color-border-default)" }}
      >{children}</span>
    </div>
  ),
};

// ── Citation enhancement ──

function enhanceCitations(content: string, citations: Citation[], sourceCitations?: { ref: number; filename: string; fileUrl?: string; extractedText?: string; keyExcerpt?: string }[]): string {
  const map = new Map<string, Citation>();
  for (const c of citations) map.set(c.ref, c);

  // Escape HTML entities for safe attribute insertion
  const escapeAttr = (s: string) =>
    s.replace(/["'&<>]/g, (c) =>
      ({ '"': "&quot;", "'": "&#39;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c
    );

  // 1) Replace [R48.5.11] markers FIRST
  content = content.replace(/\[(R\d+\.\d+(?:\.\d+)*)\]/g, (match, refStr) => {
    const c = map.get(refStr);
    if (c) {
      const reg = escapeAttr(c.regulation);
      const clause = escapeAttr(c.clause);
      return `<cite class="citation-marker" role="button" tabindex="0" data-ref="${escapeAttr(refStr)}" data-regulation="${reg}" data-clause="${clause}">${reg} §${clause}</cite>`;
    }
    return match;
  });

  // 2) Replace [SN] markers with source citation badges
  if (sourceCitations && sourceCitations.length > 0) {
    content = content.replace(/\[S(\d+)\]/gi, (match, refStr) => {
      const ref = parseInt(refStr, 10);
      const found = sourceCitations.some(sc => sc.ref === ref);
      if (found) {
        return `<cite class="source-citation-marker" role="button" tabindex="0" data-source-ref="${ref}">S${ref}</cite>`;
      }
      return match;
    });
  }

  return content;
}

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
  color: var(--color-amber);
  background: var(--color-amber-bg);
  border: 1px solid var(--color-amber-border);
  vertical-align: middle;
}
`;

// ── Table normalizer ──

function normalizeTables(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
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
