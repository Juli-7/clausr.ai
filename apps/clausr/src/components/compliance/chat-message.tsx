"use client";

import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const chatCitationStyles = `
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
.reg-callout .callout-loading {
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
}
`;

async function fetchClauseText(code: string, clause: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/compliance/regulation/clause?code=${encodeURIComponent(code)}&clause=${encodeURIComponent(clause)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title ? `${data.title}\n${data.text}` : data.text;
  } catch {
    return null;
  }
}

export function ChatMessageContent({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const badges = container.querySelectorAll<HTMLElement>("cite.citation-marker");
    if (badges.length === 0) return;

    const pending = new Map<HTMLElement, { code: string; clause: string }>();

    badges.forEach((badge) => {
      const code = badge.getAttribute("data-regulation");
      const clause = badge.getAttribute("data-clause");
      if (!code || !clause) return;

      const callout = document.createElement("div");
      callout.className = "reg-callout";
      callout.innerHTML = `
        <div class="callout-label">${code} · §${clause}</div>
        <div class="callout-loading">Loading clause text…</div>
      `;
      badge.replaceWith(callout);
      pending.set(callout, { code, clause });
    });

    Promise.all(
      Array.from(pending.entries()).map(async ([el, { code, clause }]) => {
        const text = await fetchClauseText(code, clause);
        const textEl = el.querySelector(".callout-loading");
        if (textEl) {
          if (text) {
            textEl.className = "callout-text";
            textEl.textContent = text;
          } else {
            textEl.textContent = "Clause text not available.";
          }
        }
      })
    );
  }, [content]);

  return (
    <div ref={ref} className="chat-bubble-markdown" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>
      <style>{chatCitationStyles}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "6px 0" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th style={{
              textAlign: "left", padding: "5px 8px", fontSize: 10,
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em",
              color: "var(--color-text-muted)",
              borderBottom: "1px solid var(--color-border-default)",
              whiteSpace: "nowrap",
            }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{
              padding: "5px 8px",
              borderBottom: "1px solid var(--color-border-default)",
              color: "var(--color-text-body)",
            }}>{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
