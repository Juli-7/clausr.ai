"use client";

import { useState, useCallback, useEffect } from "react";
import { DocumentPanel } from "@/components/document-panel";
import { ReasoningPanel } from "@/components/reasoning-panel";
import { ChatInput } from "@/components/chat-input";
import { FileUploadPanel } from "@/components/file-upload-panel";
import { LearningBanner } from "@/components/learning-banner";
import { EvolutionConfirmDialog } from "@/components/evolution-confirm-dialog";

import { useApp } from "@/lib/app-context";
import type { AgentResponse } from "@/lib/agent/shared/types";
import type { ChatRequestFile } from "@/lib/agent/shared/schemas";
import type { ChatTurn } from "@/types/agent-types";
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
  const [setupLoading, setSetupLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [stepStatus, setStepStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLearningBanner, setShowLearningBanner] = useState(false);
  const [showEvolutionDialog, setShowEvolutionDialog] = useState(false);
  const [pendingLesson, setPendingLesson] = useState<AgentResponse["lesson"] | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<ChatRequestFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => "session-" + Date.now());
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);

  const [stepConfirmations, setStepConfirmations] = useState<Record<number, Record<string, boolean>>>({});

  function initFlags(turnIndex: number, findings: Record<string, string> | Record<string, Record<string, string> | string> | undefined) {
    if (!findings || typeof findings !== "object") return;
    setStepConfirmations((prev) => {
      if (prev[turnIndex]) return prev;
      const flags: Record<string, boolean> = {};
      for (const field of Object.keys(findings)) {
        flags[field] = false;
      }
      return { ...prev, [turnIndex]: flags };
    });
  }

  function handleToggleFlag(turnIndex: number, field: string, flagged: boolean) {
    setStepConfirmations((prev) => ({
      ...prev,
      [turnIndex]: { ...(prev[turnIndex] ?? {}), [field]: flagged },
    }));
  }

  // Session loading from history
  useEffect(() => {
    let cancelled = false;
    if (!activeSessionId) return;
    // Reset all state before loading a new session
    setTurns([]);
    setPendingComments([]);
    setStepConfirmations({});
    setError(null);
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
        if (reconstructed.length > 0) setIsSetup(true);
        const initialFlags: Record<number, Record<string, boolean>> = {};
        for (let idx = 0; idx < reconstructed.length; idx++) {
          const findings = reconstructed[idx]?.response?.sections?.findings;
          if (findings && typeof findings === "object") {
            const flags: Record<string, boolean> = {};
            for (const field of Object.keys(findings)) flags[field] = false;
            initialFlags[idx] = flags;
          }
        }
        setStepConfirmations(initialFlags);
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

  const handleSetup = useCallback(async () => {
    setSetupLoading(true);
    setError(null);
    try {
      const setupBody: Record<string, unknown> = { sessionId };
      if (activeSkillId) setupBody.skillName = activeSkillId;
      if (attachedFiles.length > 0) setupBody.files = attachedFiles;

      const setupResp = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupBody),
      });
      if (!setupResp.ok) {
        const err = await setupResp.json().catch(() => ({ error: "Setup failed" }));
        throw new Error(err.error || `Setup HTTP ${setupResp.status}`);
      }
      setIsSetup(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Setup failed";
      setError(msg);
    } finally {
      setSetupLoading(false);
    }
  }, [activeSkillId, sessionId, attachedFiles]);

  const handleSend = useCallback(async (message: string, revisionFields?: string[]) => {
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
    setAttachedFiles([]);

    try {
      if (process.env.NODE_ENV === "development") {
        console.log(`[chat-view] message: ${message.slice(0, 80)}, revisionFields: ${revisionFields?.join(",") ?? "none"}`);
      }

      const chatBody: Record<string, unknown> = { message, sessionId };
      if (revisionFields && revisionFields.length > 0) {
        chatBody.revisionFields = revisionFields;
      }

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatBody),
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
            let updatedTurnIdx = -1;
            setTurns((prev) => {
              if (prev.length === 0) return prev;
              updatedTurnIdx = prev.length - 1;
              return prev.map((t, i) => {
                if (i !== prev.length - 1) return t;
                const steps = t.reasoningSteps.map((s) => ({
                  ...s,
                  body: s.body || "Complete",
                }));
                return {
                  ...t,
                  response: doneEvent.response,
                  reasoningSteps: steps,
                };
              });
            });
            if (updatedTurnIdx >= 0) {
              const findings = doneEvent.response.sections?.findings;
              if (findings && typeof findings === "object") {
                initFlags(updatedTurnIdx, findings as Record<string, string>);
              }
            }
          } else if (event.type === "status") {
            const statusEvent = event as { type: "status"; phase: string; stepTitle?: string };
            const phase = statusEvent.phase;
            setStepStatus(phase);
            if (phase === "evaluating" || phase === "compiling-report" || phase === "computing-verdict") {
            } else if (phase.startsWith("step-")) {
              const stepNum = parseInt(phase.slice(5), 10);
              const stepTitle = statusEvent.stepTitle ?? `Step ${stepNum}`;
              setTurns((prev) => {
                if (prev.length === 0) return prev;
                return prev.map((t, i) => {
                  if (i !== prev.length - 1) return t;
                  const existing = t.reasoningSteps;
                  if (existing.some((s) => s.stepNumber === stepNum)) {
                    return t;
                  }
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
  }, [sessionId, attachedFiles]);

  function handleNewAssessment() {
    setTurns([]);
    setSessionId("session-" + Date.now());
    setLoading(false);
    setSetupLoading(false);
    setIsSetup(false);
    setStepStatus(null);
    setError(null);
    setAttachedFiles([]);
    setPendingComments([]);
    setStepConfirmations({});
    setShowLearningBanner(false);
    setShowEvolutionDialog(false);
    setPendingLesson(null);
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

      {/* Three panels: FileUpload | Document + ChatInput | Reasoning */}
      <div className="flex-1 flex min-h-0">
        <FileUploadPanel
          attachedFiles={attachedFiles}
          filesLoading={filesLoading}
          setupDone={isSetup}
          setupLoading={setupLoading}
          skillName={activeSkillName}
          onFileSelect={handleFileSelect}
          onRemoveFile={removeFile}
          onSetup={handleSetup}
          onFormatSize={formatFileSize}
        />
        <div className="flex-1 flex flex-col min-h-0 border-r border-border-default">
          <div className="flex-1 min-h-0">
            <DocumentPanel
              turns={turns}
              loading={loading}
              stepStatus={stepStatus}
              skillName={activeSkillName}
              clauseTexts={latestResponse?.clauseTexts}
              pendingComments={pendingComments}
              onAddComment={(turnIndex, selectedText, comment, occurrenceIndex) =>
                addComment(turnIndex, selectedText, comment, occurrenceIndex)}
              onRevise={(turnIndex, revisionFields) => {
                const comments = pendingComments.filter((c) => c.turnIndex === turnIndex);
                const feedback = comments.length > 0
                  ? "Revise the assessment based on the following feedback:\n" +
                    comments.map((c) => `- Selected: "${c.selectedText.slice(0, 120)}"\n  Comment: ${c.comment}`).join("\n")
                  : "Please revise the assessment.";
                clearCommentsForTurn(turnIndex);
                handleSend(feedback, revisionFields);
              }}
              revisionFlags={stepConfirmations[turns.length - 1] ?? {}}
              onToggleFlag={handleToggleFlag}
            />
          </div>
          <div className="shrink-0 px-4 py-3 border-t border-border-default">
            <ChatInput onSend={handleSend} loading={loading} isSetup={isSetup} />
          </div>
        </div>
        <div
          className="w-[340px] shrink-0 p-5"
          style={{ background: "var(--color-bg-dark)" }}
        >
          <ReasoningPanel turns={turns} loading={loading} stepStatus={stepStatus} />
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
            }
          }
          setShowEvolutionDialog(false);
        }}
      />
    </div>
  );
}
