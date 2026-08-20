"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { StepPanel } from "./step-panel";

const ChatMessageContent = dynamic(() => import("./chat-message").then((m) => ({ default: m.ChatMessageContent })), { ssr: false });
import { PackFormModal } from "./pack-form-modal";
import type { ComplianceSession, Step } from "@/lib/compliance/types";
import { t, getLang, setLang, subscribe } from "@/lib/compliance/i18n";
import { ChatSuggestions } from "./chat-suggestions";
import { validateFile } from "@/lib/file-limits";
import { useApp } from "@/lib/app-context";
import { useTheme } from "@/lib/theme-context";

const TOOL_PHASES: Record<string, string> = {
  list_packs: "📋 Listing packs…",
  read_pack: "📄 Reading pack…",
  create_pack: "📦 Creating pack…",
  set_scope: "🎯 Setting scope…",
  update_doc_field: "💾 Saving document field…",
  batch_update_doc_fields: "💾 Saving document fields…",
  attach_file: "📎 Uploading file…",
  detach_file: "🗑 Removing file…",
  get_file_content: "📖 Reading file…",
  run_validation: "✅ Running validation checks…",
  prepare_for_audit: "🔧 Preparing audit…",
  start_audit: "🔍 Starting audit…",
  setup_pack_audit: "🔧 Setting up audit…",
  run_pending_checks: "✅ Running checks…",
  retry_check: "🔄 Retrying check…",
  get_pack_audit_state: "📊 Reading audit results…",
  finalize_audit: "📝 Finalizing audit…",
  export_document: "📤 Exporting document…",
  get_session_state: "👀 Reading session…",
  go_to_phase: "➡️ Changing phase…",
  search_clauses: "🔎 Searching regulations…",
  get_regulation_text: "📜 Reading regulation…",
  search_files: "🔎 Searching files…",
  suggest_lesson: "💡 Suggesting lesson…",
};

const STEP_SUGGESTIONS: Record<number, string[]> = {
  1: ["展示所有合规包", "哪些合规包适用于电子产品？", "搜索机械法规"],
  2: ["填写符合性声明", "上传测试报告", "运行文档验证"],
  3: ["开始审核", "显示审核结果", "将执行哪些检查？"],
};

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      className="flex items-center justify-center border-none rounded cursor-pointer shrink-0"
      style={{ width: 22, height: 22, background: "var(--color-bg-dark)", color: "var(--color-text-muted)", fontSize: 11, lineHeight: 1 }}
      onClick={toggle}
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

export function ComplianceLayout({ sessionId: initialSessionId }: { sessionId?: string }) {
  const [session, setSession] = useState<ComplianceSession | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string; toolStatus?: "running" | "done" | "hint"; userInitiated?: boolean; result?: unknown }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [lang, setLangState] = useState(getLang());
  const [mode, setMode] = useState<"auto" | "manual">("manual");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [packForm, setPackForm] = useState<{ packId?: string; initialData?: Record<string, unknown> } | null>(null);
  const enterPackCreationModeRef = useRef<(() => void) | null>(null);

  const exitPackForm = useCallback(() => {
    setPackForm(null);
  }, []);

  const [leftWidth, setLeftWidth] = useState(340);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const leftWidthRef = useRef(leftWidth);
  leftWidthRef.current = leftWidth;

  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "content">("content");

  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef(true);
  const lastManualStepChange = useRef(0);
  const { activeSessionId, loadSession: appLoadSession, clearSession } = useApp();
  const appLoadSessionRef = useRef(appLoadSession);
  appLoadSessionRef.current = appLoadSession;
  const hasNamedRef = useRef(false);

  useEffect(() => {
    setSuggestions(STEP_SUGGESTIONS[session?.step ?? 1] ?? []);
  }, [session?.step]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const saved = parseInt(localStorage.getItem("compliance-chat-width") || "", 10);
    if (saved >= 240 && saved <= 600) setLeftWidth(saved);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current;
      setLeftWidth(Math.max(240, Math.min(600, dragStartWidth.current + delta)));
    };
    const onUp = () => {
      setIsDragging(false);
      localStorage.setItem("compliance-chat-width", String(leftWidthRef.current));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidthRef.current;
    setIsDragging(true);
  }, []);

  const loadComplianceSession = useCallback((id: string, onError?: () => void) => {
    const ls = appLoadSessionRef.current;
    fetch(`/api/compliance/session/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => {
        hasNamedRef.current = false;
        localStorage.setItem("compliance-session", data.id);
        ls(data.id);
        setSession(data);
        const storedResults: { tool: string; result: unknown }[] = data.toolCalls ?? [];
        const enrichedMessages = storedResults.length > 0
          ? data.messages.map((m: { role: string; content: string }) => {
              if (m.role === "tool") {
                const found = storedResults.find((r) => r.tool === m.content);
                if (found) return { ...m, result: found.result };
              }
              return m;
            })
          : data.messages;
        setMessages(enrichedMessages.length > 0 ? enrichedMessages : [{ role: "assistant", content: t("welcomeMsg") }]);
      })
      .catch(() => onError?.());
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    if (activeSessionId === session?.id) return;
    loadComplianceSession(activeSessionId);
  }, [activeSessionId, session?.id, loadComplianceSession]);

  useEffect(() => {
    const stored = !initialSessionId ? localStorage.getItem("compliance-session") : null;
    const targetId = initialSessionId && initialSessionId !== "_new" ? initialSessionId : (stored || null);

    const createFresh = () => {
      hasNamedRef.current = false;
      const ls = appLoadSessionRef.current;
      fetch("/api/compliance/session", { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          localStorage.setItem("compliance-session", data.sessionId);
          ls(data.sessionId);
          const s: ComplianceSession = {
            id: data.sessionId,
            step: data.step,
            selectedPackIds: [],
            docData: {},
            uploadedFiles: [],
            auditResults: [],
            messages: [],
            precheckDone: false,
            auditDone: false,
            auditRunning: false,
            agentResponses: {},
            comments: "[]",
            toolCalls: [],
            validationChecks: [],
            validationScore: 0,
          };
          setSession(s);
          setMessages([{ role: "assistant", content: t("welcomeMsg") }]);
        });
    };

    if (initialSessionId === "_new") {
      createFresh();
    } else if (targetId) {
      loadComplianceSession(targetId, createFresh);
    } else {
      createFresh();
    }
  }, [initialSessionId]);

  useEffect(() => subscribe(() => setLangState(getLang())), []);

  useEffect(() => {
    if (chatBodyRef.current && isAtBottomRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input]);

  const handleScroll = useCallback(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    const threshold = 80;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setShowScrollBtn(!isAtBottomRef.current);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  const updateSessionName = useCallback((name: string) => {
    if (!session) return;
    fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {});
  }, [session]);

  const handleNewSession = useCallback(() => {
    clearSession();
    hasNamedRef.current = false;
    localStorage.removeItem("compliance-session");
    fetch("/api/compliance/session", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        localStorage.setItem("compliance-session", data.sessionId);
        appLoadSessionRef.current(data.sessionId);
        setSession({
          id: data.sessionId,
          step: data.step,
          selectedPackIds: [],
          docData: {},
          uploadedFiles: [],
          auditResults: [],
          messages: [],
          precheckDone: false,
          auditDone: false,
          auditRunning: false,
          agentResponses: {},
          comments: "[]",
          validationChecks: [],
          validationScore: 0,
        });
        setMessages([{ role: "assistant", content: t("welcomeMsg") }]);
      });
  }, [clearSession]);

  // Conditional audit poll — only runs while audit is active, fetches lightweight status only
  useEffect(() => {
    if (!session?.auditRunning) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/compliance/session/${session.id}/audit/status`);
      if (!res.ok) return;
      const data = await res.json();
      setSession((prev) => prev ? {
        ...prev,
        auditResults: data.auditResults,
        auditRunning: data.auditRunning,
        auditDone: data.auditDone,
        agentResponses: data.agentResponses ?? prev.agentResponses,
      } : prev);
    }, 2000);
    return () => clearInterval(interval);
  }, [session?.id, session?.auditRunning]);

  const callTool = useCallback(async (name: string, input: Record<string, unknown>) => {
    if (!session) return null;
    if (mode === "auto") {
      setMessages((prev) => [...prev, { role: "tool", content: `${name} — disabled in auto mode`, toolStatus: "hint", userInitiated: true }]);
      return null;
    }
    const res = await fetch(`/api/compliance/session/${session.id}/tool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, input }),
    });
    if (!res.ok) return null;
    const response = await res.json();
    // Update session from tool response — single round-trip, no second fetch
    const { session: sessionData, ...result } = response;
    if (sessionData) {
      setSession((prev) => prev ? { ...sessionData, step: mode === "manual" ? prev.step : sessionData.step } : sessionData);
    }
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "tool" && m.content === name && m.toolStatus === "running");
      if (idx === -1) return [...prev, { role: "tool", content: name, toolStatus: "done", userInitiated: true }];
      const realIdx = prev.length - 1 - idx;
      const updated = [...prev];
      const item = updated[realIdx];
      if (item) updated[realIdx] = { ...item, toolStatus: "done" };
      return updated;
    });
    return result;
  }, [session, mode]);

  const handleFileUpload = useCallback((file: File) => {
    if (!session) return;
    const err = validateFile(file);
    if (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}` }]);
      return;
    }
    setSession((prev) => prev ? {
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, { name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, time: new Date().toISOString().slice(0, 10), downloadUrl: URL.createObjectURL(file) }],
    } : prev);
    setMessages((prev) => [...prev, { role: "tool", content: "attach_file", toolStatus: "running", userInitiated: true }]);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await callTool("attach_file", { name: file.name, size: `${(file.size / 1024).toFixed(1)} KB`, time: new Date().toISOString().slice(0, 10), dataUrl });
      await callTool("extract_file_content", { fileName: file.name });
    };
    reader.readAsDataURL(file);
  }, [session, callTool]);

  const stepToPhase: Record<number, string> = { 1: "scope", 2: "documents", 3: "audit" };

  const handleScopeChange = useCallback(async (packIds: string[], suggestedStep?: number) => {
    if (!session) return;
    const scopeResult = await callTool("set_scope", { packIds });
    if (suggestedStep) await callTool("go_to_phase", { phase: stepToPhase[suggestedStep] });
    if (scopeResult) {
      setSession((prev) => prev ? { ...prev, selectedPackIds: scopeResult.selectedPackIds, step: (suggestedStep ?? prev.step) as Step } : prev);
    }
  }, [session, callTool]);

  const handleStepChange = useCallback(async (step: 1 | 2 | 3) => {
    if (!session) return;
    lastManualStepChange.current = Date.now();
    setSession((prev) => prev ? { ...prev, step } : prev);
    await callTool("go_to_phase", { phase: stepToPhase[step] });
  }, [session, callTool]);

  const handleSessionRefresh = useCallback(async () => {
    if (!session) return;
    const res = await fetch(`/api/compliance/session/${session.id}`);
    if (res.ok) {
      const data = await res.json();
      setSession((prev) => {
        if (!prev) return data;
        return {
          ...data,
          step: mode === "manual" ? prev.step : data.step,
          // Preserve optimistic auditRunning=true from tool-call handler.
          // The SSE tool-result/done events race against the background audit;
          // the server may report auditRunning=false before the frontend has
          // had a chance to poll. Only the polling endpoint (which reads
          // directly from server truth) is allowed to set auditRunning=false.
          auditRunning: prev.auditRunning || data.auditRunning,
        };
      });
    }
  }, [session, mode]);

  const handleAddChatMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content: text }]);
  }, []);

  const handleToolCall = useCallback((label: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content: label }]);
  }, []);

  const handleToolMessage = useCallback((name: string, isHint?: boolean) => {
    setMessages((prev) => [...prev, { role: "tool", content: name, toolStatus: isHint ? "hint" : "done", userInitiated: true }]);
  }, []);

  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || !session) return;
    if (!textOverride && loading) return;
    if (!textOverride) {
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      if (!hasNamedRef.current) {
        hasNamedRef.current = true;
        updateSessionName(text.slice(0, 60));
      }
    }
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    setPhase("🤔 Thinking…");

    const res = await fetch(`/api/compliance/session/${session.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, lang }),
    });

    if (!res.ok) {
      setMessages((prev) => [...prev, { role: "assistant", content: t("errorMsg") }]);
      setLoading(false);
      setPhase("");
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { setLoading(false); setPhase(""); return; }

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "token") {
            setPhase("");
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, content: last.content + event.text };
                return updated;
              }
              return [...prev, { role: "assistant", content: event.text }];
            });
          } else if (event.type === "tool-call") {
            setPhase(TOOL_PHASES[event.tool] || `🔧 Running ${event.tool}…`);
            setMessages((prev) => [...prev, { role: "tool", content: event.tool, toolStatus: "running" }]);
            if (event.tool === "setup_pack_audit" || event.tool === "run_pending_checks") {
              // Optimistically set auditRunning so polling starts before the server round-trip completes.
              // The background audit runs in parallel and can finish before handleSessionRefresh returns.
              setSession((prev) => prev ? { ...prev, auditRunning: true } : prev);
            }
          } else if (event.type === "tool-result") {
            setPhase("✅ Processing result…");
            setMessages((prev) => {
              const idx = [...prev].reverse().findIndex((m) => m.role === "tool" && m.content === event.tool && m.toolStatus === "running");
              if (idx === -1) return prev;
              const realIdx = prev.length - 1 - idx;
              const updated = [...prev];
              const msg = updated[realIdx];
              if (msg) {
                updated[realIdx] = { ...msg, toolStatus: "done", result: event.result as Record<string, unknown> | undefined };
              }
              return updated;
            });
            handleSessionRefresh();
          } else if (event.type === "done") {
            setPhase("");
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && event.response && last.content !== event.response) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, content: event.response };
                return updated;
              }
              return prev;
            });
            handleSessionRefresh();
          } else if (event.type === "error") {
            setPhase("");
            setMessages((prev) => [...prev, { role: "assistant", content: `❌ Error: ${event.error}` }]);
          }
        } catch {}
      }
    }
    // Force session refresh to pick up auditRunning state and start polling
    try { await handleSessionRefresh(); } catch {}
    setLoading(false);
    setPhase("");
  }, [input, session, loading, handleSessionRefresh]);

  enterPackCreationModeRef.current = () => {
    if (!session || loading) return;
    setPackForm({});
    sendMessage("I want to create a new compliance pack. Guide me through setting it up.");
  };
  const enterPackCreationMode = useCallback(() => {
    enterPackCreationModeRef.current?.();
  }, []);

  const handleEditPack = useCallback((packId: string, initialData: Record<string, unknown>) => {
    setPackForm({ packId, initialData });
  }, []);

  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, []);

  const isStreamingAssistant = loading && !phase && messages[messages.length - 1]?.role === "assistant";

  const regCalloutStyles = (
    <style>{`
.reg-callout {
  margin: 8px 0 10px;
  padding: 10px 14px;
  border-left: 3px solid rgba(88,166,255,0.35);
  background: rgba(88,166,255,0.06);
  border-radius: 0 8px 8px 0;
  font-size: 12px;
  line-height: 1.6;
}
.reg-callout .callout-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-accent-blue);
  margin-bottom: 4px;
}
.reg-callout .callout-text {
  color: var(--color-text-body);
}
`}</style>
  );

  const chatPanel = (
    <div
      className="flex flex-col"
      style={{
        width: isMobile ? "100%" : leftWidth,
        minWidth: isMobile ? undefined : 240,
        borderRight: isMobile ? "none" : "1px solid var(--color-border-default)",
        background: "var(--color-bg-card)",
        display: isMobile && mobileView !== "chat" ? "none" : "flex",
        position: "relative",
      }}
      >
        {regCalloutStyles}
        <div
        className="flex items-center justify-between shrink-0 px-4 py-2"
        style={{ borderBottom: "1px solid var(--color-border-default)", minHeight: 44 }}
      >
        <span className="text-xs font-semibold tracking-wide" style={{ color: "var(--color-text-header)", fontFamily: "'JetBrains Mono', monospace" }}>
          摇光合规助手 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>clausr.ai</span>
        </span>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center justify-center border-none rounded cursor-pointer shrink-0 text-2xs font-semibold"
            style={{
              width: 44, height: 24,
              background: mode === "auto" ? "var(--color-success-bg)" : "var(--color-accent-blue-bg)",
              color: mode === "auto" ? "var(--color-success)" : "var(--color-accent-blue)",
            }}
            onClick={() => setMode(mode === "auto" ? "manual" : "auto")}
            title={mode === "auto" ? "Switch to manual mode" : "Switch to auto mode"}
          >
            {mode === "auto" ? "Auto" : "Manual"}
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="flex items-center justify-center border-none rounded cursor-pointer shrink-0 text-2xs font-semibold"
              style={{ width: 24, height: 24, background: "var(--color-bg-dark)", color: "var(--color-text-muted)" }}
              onClick={() => setLang(lang === "en" ? "zh" : "en")}
              title={lang === "en" ? "切换至中文" : "Switch to English"}
            >
              {lang === "en" ? "中" : "EN"}
            </button>
          </div>
        </div>
      </div>

      <div ref={chatBodyRef} className="flex-1 overflow-y-auto" style={{ padding: "6px 8px" }} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: 11, lineHeight: 1.7 }}>
            {t("chatStart")}
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === "tool") {
            const running = msg.toolStatus === "running";
            const isHint = msg.toolStatus === "hint";
            const isUser = msg.userInitiated;
            const isRegTool = msg.content === "search_clauses" || msg.content === "get_regulation_text";
            if (isRegTool && msg.result && !running) {
              const result = msg.result as Record<string, unknown>;
              const results = (result.results as Array<Record<string, unknown>>) ?? (result.regulationCode ? [result] : []);
              return (
                <div key={i} style={{ padding: "3px 4px" }}>
                  {results.map((r, ri) => (
                    <div key={ri} className="reg-callout" style={{ margin: "2px 0" }}>
                      <div className="callout-label">
                        {r.regulationCode as string} · §{r.clauseNumber as string}{r.title ? ` · ${r.title as string}` : ""}
                      </div>
                      <div className="callout-text">{r.text as string}</div>
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div
                key={i}
                className="flex gap-2 mb-1"
                style={{ flexDirection: isUser ? "row-reverse" : "row", padding: "3px 4px" }}
              >
                {!isUser && <div style={{ width: 24 }} />}
                <div
                  className="text-xs leading-relaxed"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, padding: "2px 8px", borderRadius: 4,
                    background: isHint ? "var(--color-bg-dark)" : isUser ? "var(--color-accent-blue-bg)" : running ? "var(--color-amber-bg)" : "var(--color-bg-dark)",
                    border: "1px solid",
                    borderColor: isHint ? "var(--color-border-default)" : isUser ? "var(--color-accent-blue-border)" : running ? "var(--color-amber-border)" : "var(--color-border-default)",
                    color: isHint ? "var(--color-text-muted)" : isUser ? "var(--color-accent-blue)" : running ? "var(--color-amber)" : "var(--color-text-muted)",
                  }}
                >
                  {running ? "⚡" : isHint ? "⛔" : isUser ? "→" : "✓"} {msg.content}
                </div>
              </div>
            );
          }
          return (
            <div
              key={i}
              className="mb-1 animate-fade-in"
              style={{ padding: "2px 4px" }}
            >
              <div
                className="text-xs leading-relaxed"
                style={{
                  maxWidth: "88%",
                  padding: msg.role === "user" ? "7px 10px" : "2px 4px",
                  borderRadius: msg.role === "user" ? 7 : 0,
                  background: msg.role === "user" ? "var(--color-accent-blue)" : "transparent",
                  border: "none",
                  color: msg.role === "user" ? "var(--color-primary-foreground)" : "var(--color-text-body)",
                  overflowWrap: "break-word", overflow: "hidden",
                  marginLeft: msg.role === "user" ? "auto" : 0,
                }}
              >
                {msg.role === "user" ? (
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</span>
                ) : (
                  <>
                    <span style={{ fontSize: 9, fontWeight: 500, color: "var(--color-text-muted)", marginRight: 4, letterSpacing: "0.02em" }}>{t("assistantLabel")}</span>
                    <ChatMessageContent content={msg.content} />
                  </>
                )}
              </div>
            </div>
          );
        })}
        {isStreamingAssistant && <span className="streaming-cursor" />}
        {loading && (
          <div style={{ padding: "6px 34px" }}>
            {phase ? (
              <span style={{ fontSize: 10, color: "var(--color-text-muted)", lineHeight: 1.4 }}>{phase}</span>
            ) : (
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full" style={{ background: "var(--color-border-default)", animation: "blink 1.2s infinite" }} />
                <div className="w-1 h-1 rounded-full" style={{ background: "var(--color-border-default)", animation: "blink 1.2s infinite", animationDelay: ".2s" }} />
                <div className="w-1 h-1 rounded-full" style={{ background: "var(--color-border-default)", animation: "blink 1.2s infinite", animationDelay: ".4s" }} />
              </div>
            )}
          </div>
        )}
      </div>

      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="flex items-center justify-center border-none cursor-pointer"
          style={{
            position: "absolute",
            bottom: 72, right: 14, zIndex: 20,
            width: 28, height: 28, borderRadius: "50%",
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-muted)",
            boxShadow: "0 2px 6px rgba(0,0,0,.08)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      <div
        className="shrink-0"
        style={{
          padding: "5px 8px 6px",
          borderTop: "1px solid var(--color-border-default)",
          opacity: loading ? 0.45 : 1,
          transition: "opacity 0.2s",
        }}
      >
        <ChatSuggestions suggestions={suggestions} onSelect={(text) => { setInput(text); textareaRef.current?.focus(); }} />
        <div
          className="flex items-end gap-1.5 rounded-lg"
          style={{ padding: "4px 5px", background: "var(--color-bg-dark)", border: "1px solid var(--color-border-input)" }}
        >
          <label className="shrink-0 flex items-center justify-center cursor-pointer" style={{ width: 22, height: 22, color: "var(--color-text-muted)" }} title={t("attachFile")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
            <input type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }} />
          </label>
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent border-none outline-none text-xs leading-relaxed resize-none"
            style={{ fontFamily: "'DM Sans', sans-serif", color: "var(--color-text-body)", padding: "3px 4px", minHeight: 20, maxHeight: 150 }}
            placeholder={t("inputPlaceholder")}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResizeTextarea();
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            rows={1}
            disabled={loading}
          />
          <button
            className="flex items-center justify-center shrink-0 border-none rounded-md cursor-pointer disabled:opacity-30"
            style={{ width: 26, height: 26, background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)" }}
            disabled={loading || !input.trim()}
            onClick={() => sendMessage()}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  const contentPanel = (
    <div
      className="flex-1 min-w-0"
      style={{
        overflow: "hidden",
        display: isMobile && mobileView !== "content" ? "none" : "block",
      }}
    >
      {packForm ? (
        <PackFormModal
          inline
          packId={packForm.packId}
          initialData={packForm.initialData as Partial<import("./pack-form-modal").PackFormData> | undefined}
          onClose={exitPackForm}
          onSuccess={() => {
            exitPackForm();
            handleSessionRefresh();
          }}
        />
      ) : (
        <StepPanel
          session={session}
          mode={mode}
          onStepChange={handleStepChange}
          onScopeChange={handleScopeChange}
          onSessionRefresh={handleSessionRefresh}
          onAddChatMessage={handleAddChatMessage}
          onToolMessage={handleToolMessage}
          onSendText={sendMessage}
          onCallTool={callTool}
          onFileUpload={handleFileUpload}
          onStartPackCreation={enterPackCreationMode}
          onEditPack={handleEditPack}
        />
      )}
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <div className="flex" style={{ flex: 1, minHeight: 0, position: "relative" }}>
      {chatPanel}
      {!isMobile && (
        <div
          onMouseDown={handleDragStart}
          style={{
            width: 4,
            cursor: "col-resize",
            background: isDragging ? "var(--color-accent-blue)" : "transparent",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.background = "var(--color-border-default)"; }}
          onMouseLeave={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        />
      )}
      {contentPanel}
      {isMobile && (
        <div
          className="flex shrink-0"
          style={{
            height: 44,
            borderTop: "1px solid var(--color-border-default)",
            background: "var(--color-bg-card)",
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
          }}
        >
          <button
            className="flex-1 flex items-center justify-center gap-1.5 border-none text-xs cursor-pointer"
            style={{
              background: mobileView === "chat" ? "var(--color-bg-dark)" : "transparent",
              color: mobileView === "chat" ? "var(--color-accent-blue)" : "var(--color-text-muted)",
              fontWeight: mobileView === "chat" ? 600 : 400,
            }}
            onClick={() => setMobileView("chat")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Chat
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 border-none text-xs cursor-pointer"
            style={{
              background: mobileView === "content" ? "var(--color-bg-dark)" : "transparent",
              color: mobileView === "content" ? "var(--color-accent-blue)" : "var(--color-text-muted)",
              fontWeight: mobileView === "content" ? 600 : 400,
            }}
            onClick={() => setMobileView("content")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            Content
          </button>
        </div>
      )}
      </div>

      <div
        className="shrink-0"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "5px 12px",
          background: "linear-gradient(to top, var(--color-bg-card), color-mix(in srgb, var(--color-bg-card) 60%, transparent))",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
          <path d="M12 3l1.9 5.7a2 2 0 0 0 1.4 1.4L21 12l-5.7 1.9a2 2 0 0 0-1.4 1.4L12 21l-1.9-5.7a2 2 0 0 0-1.4-1.4L3 12l5.7-1.9a2 2 0 0 0 1.4-1.4z"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--color-text-muted)" }}>
          内容由 AI 生成合成
        </span>
      </div>
    </div>
  );
}
