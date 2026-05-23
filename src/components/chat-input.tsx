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
    <>
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
            ? "Review the analysis, request additional checks, or ask a follow-up..."
            : "Set up your case files first..."
        }
        className="min-h-[40px] max-h-[120px] resize-none flex-1"
        style={{
          background: "var(--color-bg-dark)",
          border: "1px solid var(--color-border-input)",
          borderRadius: 8,
          padding: "0 14px",
          color: "var(--color-text-body)",
          fontSize: 14,
          outline: "none",
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
          background: isSetup ? "var(--color-success-bg)" : "var(--color-bg-dark)",
          border: isSetup ? "1px solid #2ea043" : "1px solid var(--color-border-input)",
          color: isSetup ? "#fff" : "var(--color-text-muted)",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          flexShrink: 0,
          transition: "all 0.15s ease",
        }}
      >
        {isSetup ? "Analysis" : "Set up first"}
      </Button>
    </>
  );
}
