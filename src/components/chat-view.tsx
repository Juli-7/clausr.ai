"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { DocumentPanel } from "@/components/document-panel";
import { ReasoningPanel } from "@/components/reasoning-panel";
import { ChatInput } from "@/components/chat-input";
import { LearningBanner } from "@/components/learning-banner";
import { EvolutionConfirmDialog } from "@/components/evolution-confirm-dialog";

import { useApp } from "@/lib/app-context";
import type { AgentResponse } from "@/lib/agent/types";
import type { ChatRequest, ChatRequestFile } from "@/lib/agent/schemas";
import type { ChatTurn } from "@/lib/agent/turn-types";
import type { ReportTemplate } from "@/lib/agent/template-types";

interface PendingComment {
  selectedText: string;
  comment: string;
  turnIndex: number;
  occurrenceIndex: number;
}

export function ChatView() {
  const { activeSkillName, activeSkillId, activeSessionId, clearSession } = useApp();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [stepStatus, setStepStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLearningBanner, setShowLearningBanner] = useState(false);
  const [showEvolutionDialog, setShowEvolutionDialog] = useState(false);
  const [pendingLesson, setPendingLesson] = useState<AgentResponse["lesson"] | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<ChatRequestFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => "session-" + Date.now());
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [sentFiles, setSentFiles] = useState<{ name: string; size: number; type: string }[]>([]);
  const [useTemplate, setUseTemplate] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load template for the active skill
  useEffect(() => {
    if (!activeSkillId) { setTemplate(null); return; }
    fetch("/api/skills")
      .then(r => r.json())
      .then((skills: { name: string; template: ReportTemplate | null }[]) => {
        const skill = skills.find(s => s.name === activeSkillId);
        setTemplate(skill?.template ?? null);
      })
      .catch(() => setTemplate(null));
  }, [activeSkillId]);

  // Session loading from history
  useEffect(() => {
    let cancelled = false;
    if (!activeSessionId) return;
    fetch(`/api/sessions/${activeSessionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSessionId(data.sessionId);
        const reconstructed: ChatTurn[] = [];
        const { messages, responses: responseList } = data;
        let respIdx = 0;
        for (const msg of messages) {
          if (msg.role === "user") {
            const resp = responseList[respIdx] ?? null;
            // Reconstruct attached files from sourceCitations (persisted in the response)
            const restoredFiles = resp?.sourceCitations
              ? resp.sourceCitations.map((sc: { filename: string; fileUrl?: string }) => {
                  const ext = sc.filename.split(".").pop()?.toLowerCase() ?? "";
                  const mimeType =
                    ext === "pdf" ? "application/pdf" :
                    ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext) ? `image/${ext === "jpg" ? "jpeg" : ext}` :
                    ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
                    "application/octet-stream";
                  return { name: sc.filename, size: 0, type: mimeType, dataUrl: undefined };
                })
              : [];
            reconstructed.push({
              userMessage: msg.content,
              attachedFiles: restoredFiles,
              response: resp ? { ...resp, sessionId: data.sessionId } : null,
              reasoningSteps: resp?.reasoningSteps ?? [],
              toolCalls: resp?.toolCalls ?? [],
              liveToolResults: [],
              error: null,
            });
            respIdx++;
          }
        }
        setTurns(reconstructed);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load session");
      })
      .finally(() => {
        if (!cancelled) clearSession();
      });
    return () => { cancelled = true; };
  }, [activeSessionId, clearSession]);

  // Latest completed response (for top bar display)
  const latestResponse = turns.filter((t) => t.response).at(-1)?.response ?? null;

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    setFilesLoading(true);
    const readPromises = Array.from(fileList).map(async (f): Promise<ChatRequestFile> => {
      let dataUrl: string | undefined;
      // Read as data URL for transfer (base64 in JSON body, simpler than multipart)
      try {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
      } catch (err) {
        console.error("[chat-view] Failed to read file:", f.name, err);
      }
      return { name: f.name, size: f.size, type: f.type, dataUrl };
    });

    const newFiles = await Promise.all(readPromises);
    setAttachedFiles((prev) => [...prev, ...newFiles]);
    setFilesLoading(false);
    e.target.value = "";
  }, []);

  function removeFile(name: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function addComment(turnIndex: number, selectedText: string, comment: string, occurrenceIndex: number) {
    setPendingComments((prev) => [...prev, { turnIndex, selectedText, comment, occurrenceIndex }]);
  }

  function clearCommentsForTurn(turnIndex: number) {
    setPendingComments((prev) => prev.filter((c) => c.turnIndex !== turnIndex));
  }

  const handleSend = useCallback(async (message: string) => {
    // Allow sending without a skill — plain chat mode

    const pendingTurn: ChatTurn = {
      userMessage: message,
      attachedFiles: [...attachedFiles],
      response: null,
      reasoningSteps: [],
      toolCalls: [],
      liveToolResults: [],
      error: null,
    };

    setTurns((prev) => [...prev, pendingTurn]);
    setLoading(true);
    setError(null);
    setSentFiles((prev) => [...prev, ...attachedFiles]);
    setAttachedFiles([]);

    try {
      const filesToSend = pendingTurn.attachedFiles.length > 0 ? pendingTurn.attachedFiles : undefined;
      if (process.env.NODE_ENV === "development") {
        const fileSummary = filesToSend?.map(f => `${f.name} (${f.size}B, ${f.type})`).join(", ") ?? "none";
        console.error(`[chat-view] Sending to API — message: ${message.slice(0, 80)}, files: [${fileSummary}], skillName: ${activeSkillId}`);
      }

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          skillName: activeSkillId,
          sessionId,
          files: filesToSend,
          useTemplate,
        } satisfies ChatRequest & { useTemplate?: boolean }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      // Read SSE stream
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const messages = buffer.split("\n\n");
        buffer = messages.pop() ?? "";

        for (const msg of messages) {
          if (!msg.startsWith("data: ")) continue;

          let event: { type: string };
          try {
            event = JSON.parse(msg.slice(6));
          } catch {
            continue;
          }

          if (event.type === "token") {
            const tokenEvent = event as { type: "token"; text: string; stepNumber: number };
            setTurns((prev) => {
              if (prev.length === 0) return prev;
              return prev.map((t, i) => {
                if (i !== prev.length - 1) return t;
                const existing = t.reasoningSteps.find(
                  (s) => s.stepNumber === tokenEvent.stepNumber
                );
                if (existing) {
                  return {
                    ...t,
                    reasoningSteps: t.reasoningSteps.map((s) =>
                      s.stepNumber === tokenEvent.stepNumber
                        ? { ...s, body: s.body + tokenEvent.text }
                        : s
                    ),
                  };
                }
                return {
                  ...t,
                  reasoningSteps: [
                    ...t.reasoningSteps,
                    {
                      stepNumber: tokenEvent.stepNumber,
                      title: `Step ${tokenEvent.stepNumber}`,
                      body: tokenEvent.text,
                    },
                  ],
                };
              });
            });
          } else if (event.type === "tool-result") {
            const trEvent = event as { type: "tool-result"; stepNumber: number; results: { name: string; value: number; limit: number | string; comparison: string; status: "pass" | "fail"; note?: string }[] };
            setTurns((prev) => {
              if (prev.length === 0) return prev;
              return prev.map((t, i) => {
                if (i !== prev.length - 1) return t;
                return {
                  ...t,
                  liveToolResults: [...t.liveToolResults, { stepNumber: trEvent.stepNumber, results: trEvent.results }],
                };
              });
            });
          } else if (event.type === "done") {
            const doneEvent = event as { type: "done"; response: AgentResponse };
            setTurns((prev) => {
              if (prev.length === 0) return prev;
              return prev.map((t, i) => {
                if (i !== prev.length - 1) return t;
                // Preserve reasoning steps (from status events) + mark all complete
                const steps = t.reasoningSteps.map((s) => ({
                  ...s,
                  body: s.body || "Complete",
                }));
                // Ensure tool calls from response are visible
                return {
                  ...t,
                  response: doneEvent.response,
                  reasoningSteps: steps,
                };
              });
            });
          } else if (event.type === "status") {
            const statusEvent = event as { type: "status"; phase: string; stepTitle?: string };
            const phase = statusEvent.phase;
            setStepStatus(phase);
            // Auto phases (compiling-report, computing-verdict) don't create reasoning steps
            if (phase === "compiling-report" || phase === "computing-verdict") {
              // Signal only — document panel shows the loading indicator
            } else if (phase.startsWith("step-")) {
              const stepNum = parseInt(phase.slice(5), 10);
              const stepTitle = statusEvent.stepTitle ?? `Step ${stepNum}`;
              setTurns((prev) => {
                if (prev.length === 0) return prev;
                return prev.map((t, i) => {
                  if (i !== prev.length - 1) return t;
                  const existing = t.reasoningSteps;
                  // If step already exists, it might be re-running — mark it as running
                  if (existing.some((s) => s.stepNumber === stepNum)) {
                    return t; // already present
                  }
                  // Mark all previous steps as complete
                  const updated = existing.map((s) => ({
                    ...s,
                    body: s.body || "Complete",
                  }));
                  return {
                    ...t,
                    reasoningSteps: [
                      ...updated,
                      { stepNumber: stepNum, title: stepTitle, body: "" },
                    ],
                  };
                });
              });
            }
          } else if (event.type === "error") {
            const errEvent = event as { type: "error"; error: string; code?: string; correlationId?: string };
            if (errEvent.correlationId) {
              console.error(`[chat-view] Pipeline error [${errEvent.code ?? "ERROR"}] cid=${errEvent.correlationId}: ${errEvent.error}`);
            }
            throw new Error(errEvent.error);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setTurns((prev) =>
        prev.map((t, i) =>
          i === prev.length - 1 ? { ...t, error: msg } : t
        )
      );
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeSkillId, sessionId, attachedFiles]);

  function handleApprove(turnIndex: number) {
    const turnResponse = turns[turnIndex]?.response;
    if (!turnResponse?.lesson) {
      // Nothing worth saving — record silently, no dialog
      return;
    }
    setPendingLesson(turnResponse.lesson);
    setShowEvolutionDialog(true);
  }

  function handleNewAssessment() {
    setTurns([]);
    setSessionId("session-" + Date.now());
    setSentFiles([]);
    setError(null);
    setAttachedFiles([]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Top bar */}
      <div className="h-12 shrink-0 flex items-center px-5 border-b border-border-default">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Compliance Assessment
        </span>
        {activeSkillName && (
          <span className="ml-4 text-xs text-accent-blue px-2.5 py-0.5 rounded"
            style={{ background: "var(--color-accent-blue-bg)" }}
          >
            {activeSkillName}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {latestResponse && (
            <>
              <span className="text-xs text-text-muted px-2.5 py-0.5 rounded"
                style={{ background: "var(--color-border-default)" }}
              >
                Round {latestResponse.round}
              </span>
              <span className="text-xs text-accent-blue px-2.5 py-0.5 rounded"
                style={{ background: "var(--color-accent-blue-bg)" }}
              >
                Session #{sessionId.slice(-4)}
              </span>
            </>
          )}
          <button
            onClick={handleNewAssessment}
            className="h-7 px-3 text-xs cursor-pointer rounded-lg"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-input)",
              color: "var(--color-text-body)",
            }}
          >
            + New assessment
          </button>
        </div>
      </div>

      {/* Learning banner */}
      {showLearningBanner && pendingLesson && (
        <LearningBanner message={pendingLesson.text} onDismiss={() => setShowLearningBanner(false)} />
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 shrink-0 px-4 py-2 text-xs"
          style={{ background: "#f8514911", borderBottom: "1px solid #f8514933", color: "var(--color-danger)" }}
        >
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer bg-transparent border-none" style={{ color: "var(--color-danger)" }}>✕</button>
        </div>
      )}

      {/* Three panels */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-h-0 border-r border-border-default">
          <DocumentPanel
            turns={turns}
            loading={loading}
            stepStatus={stepStatus}
            skillName={activeSkillName}
            sessionId={sessionId}
            template={template}
            clauseTexts={latestResponse?.clauseTexts}
            pendingComments={pendingComments}
            onAddComment={(turnIndex, selectedText, comment, occurrenceIndex) =>
              addComment(turnIndex, selectedText, comment, occurrenceIndex)}
            onRevise={(turnIndex) => {
              const comments = pendingComments.filter((c) => c.turnIndex === turnIndex);
              if (comments.length > 0) {
                const feedback = comments
                  .map((c) => `- Selected: "${c.selectedText.slice(0, 120)}"\n  Comment: ${c.comment}`)
                  .join("\n");
                handleSend(`Revise the assessment based on the following feedback:\n${feedback}`);
                clearCommentsForTurn(turnIndex);
              } else {
                handleSend("Please revise the assessment based on the findings above.");
              }
            }}
          />
        </div>
        <div
          className="w-[340px] shrink-0 p-5"
          style={{ background: "var(--color-bg-dark)" }}
        >
          <ReasoningPanel turns={turns} loading={loading} stepStatus={stepStatus} sentFiles={sentFiles} />
        </div>
      </div>

      {/* Bottom bar — always visible */}
      <div className="shrink-0 border-t border-border-default"
        style={{ background: "var(--color-bg-card)" }}
      >
        {/* Attachment strip above textbar */}
        {(attachedFiles.length > 0 || filesLoading) && (
          <div className="flex items-center gap-2 px-5 py-2 overflow-x-auto">
            {filesLoading && (
              <div className="flex items-center gap-1.5 text-xs rounded shrink-0" style={{ padding: "4px 10px", color: "var(--color-text-muted)" }}>
                <span>⏳ Reading files...</span>
              </div>
            )}
            {attachedFiles.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-1.5 text-xs rounded shrink-0"
                style={{
                  color: "var(--color-text-muted)",
                  background: "var(--color-border-default)",
                  padding: "4px 10px",
                }}
              >
                <span style={{ color: "var(--color-text-body)" }}>{f.name}</span>
                <span style={{ color: "var(--color-text-muted)" }}>({formatFileSize(f.size)})</span>
                <button onClick={() => removeFile(f.name)} className="text-text-muted cursor-pointer bg-transparent border-none text-xs">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="h-16 flex items-center px-5 gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.docx"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <button
            title="Attach files"
            className="w-9 h-9 flex items-center justify-center shrink-0 rounded-lg text-base cursor-pointer"
            style={{
              background: "transparent",
              border: "1px dashed var(--color-border-input)",
              color: "var(--color-text-muted)",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            📎
          </button>
          {template && (
            <button
              title={useTemplate ? "Using template — click to disable" : "Not using template — click to enable"}
              className="h-7 px-2 text-[10px] font-medium rounded cursor-pointer shrink-0"
              style={{
                background: useTemplate ? "var(--color-accent-blue-bg)" : "transparent",
                border: useTemplate ? "1px solid var(--color-accent-blue-border)" : "1px solid var(--color-border-input)",
                color: useTemplate ? "var(--color-accent-blue)" : "var(--color-text-muted)",
              }}
              onClick={() => setUseTemplate(!useTemplate)}
            >
              {useTemplate ? "📋 Template" : "📋 Chat"}
            </button>
          )}
          <ChatInput onSend={handleSend} loading={loading} />
        </div>
      </div>

      {/* Evolution confirm dialog */}
      <EvolutionConfirmDialog
        open={showEvolutionDialog}
        lesson={pendingLesson}
        onConfirm={async () => {
          if (pendingLesson && activeSkillId && sessionId) {
            try {
              const res = await fetch("/api/agent/evolution-confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId,
                  skillId: activeSkillId,
                  lessonText: pendingLesson.text,
                  confirmed: true,
                }),
              });
              if (res.ok) setShowLearningBanner(true);
            } catch {
              setShowLearningBanner(false);
            }
          }
          setShowEvolutionDialog(false);
        }}
        onDismiss={async () => {
          if (pendingLesson && activeSkillId && sessionId) {
            try {
              await fetch("/api/agent/evolution-confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId,
                  skillId: activeSkillId,
                  lessonText: pendingLesson.text,
                  confirmed: false,
                }),
              });
            } catch {
              // Silent — dismissal is non-critical
            }
          }
          setShowEvolutionDialog(false);
        }}
      />
    </div>
  );
}
