"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ChatInput({
  onSend,
  loading = false,
}: {
  onSend: (message: string) => Promise<void>;
  loading?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    if (!value.trim() || loading) return;
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
        placeholder="Review the analysis, request additional checks, or ask a follow-up..."
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
        disabled={loading}
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={loading || !value.trim()}
        size="sm"
        style={{
          height: 36,
          padding: "0 16px",
          background: "var(--color-success-bg)",
          border: "1px solid #2ea043",
          color: "#fff",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        Send for analysis
      </Button>
    </>
  );
}
