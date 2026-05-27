"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatInput({
  onSend,
  loading = false,
  isSetup = false,
}: {
  onSend: (message: string) => Promise<void>;
  loading?: boolean;
  isSetup?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    if (!value.trim() || loading || !isSetup) return;
    await onSend(value.trim());
    setValue("");
    ref.current?.focus();
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder={
          isSetup
            ? "Ask a question or request a revision..."
            : "Set up your case files first..."
        }
        className="min-h-[40px] max-h-[120px] resize-none flex-1"
        style={{
          background: "var(--color-bg-dark)",
          border: "1px solid var(--color-border-input)",
          borderRadius: 10,
          padding: "10px 14px",
          color: "var(--color-text-body)",
          fontSize: 14,
          outline: "none",
          lineHeight: 1.5,
        }}
        disabled={loading || !isSetup}
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={loading || !value.trim() || !isSetup}
        size="sm"
        style={{
          height: 36,
          padding: "0 16px",
          background: isSetup ? "var(--color-accent-blue)" : "var(--color-bg-dark)",
          border: isSetup ? "1px solid var(--color-accent-blue)" : "1px solid var(--color-border-input)",
          color: isSetup ? "#fff" : "var(--color-text-muted)",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          flexShrink: 0,
          cursor: loading || !value.trim() || !isSetup ? "not-allowed" : "pointer",
          opacity: loading || !value.trim() || !isSetup ? 0.5 : 1,
          transition: "all 0.15s ease",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </Button>
    </div>
  );
}
