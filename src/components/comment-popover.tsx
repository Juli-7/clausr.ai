"use client";

import { useState, useEffect, useRef } from "react";

interface CommentPopoverProps {
  selectedText: string;
  position: { top: number; left: number } | null;
  onConfirm: (comment: string) => void;
  onDismiss: () => void;
}

export function CommentPopover({ selectedText, position, onConfirm, onDismiss }: CommentPopoverProps) {
  const [comment, setComment] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  if (!position) return null;

  return (
    <>
      {/* Backdrop to catch clicks outside */}
      <div className="fixed inset-0 z-[110]" onClick={onDismiss} />
      <div
        className="fixed z-[111] rounded-lg p-3"
        style={{
          top: position.top + 24,
          left: position.left,
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          width: 320,
        }}
      >
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
          style={{ color: "var(--color-text-muted)" }}>
          Add Comment
        </div>
        <div className="text-xs mb-2 p-2 rounded truncate"
          style={{
            background: "var(--color-bg-dark)",
            color: "var(--color-text-muted)",
            borderLeft: "3px solid var(--color-accent-blue)",
          }}>
          &ldquo;{selectedText.slice(0, 80)}{selectedText.length > 80 ? "..." : ""}&rdquo;
        </div>
        <input
          ref={inputRef}
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && comment.trim()) onConfirm(comment.trim());
            if (e.key === "Escape") onDismiss();
          }}
          placeholder="What should be revised?"
          className="w-full h-8 text-xs rounded px-2.5 mb-2 outline-none"
          style={{
            background: "var(--color-bg-dark)",
            border: "1px solid var(--color-border-input)",
            color: "var(--color-text-body)",
          }}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onDismiss}
            className="h-7 px-3 text-xs rounded-lg cursor-pointer"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-input)",
              color: "var(--color-text-muted)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => comment.trim() && onConfirm(comment.trim())}
            disabled={!comment.trim()}
            className="h-7 px-3 text-xs rounded-lg cursor-pointer text-white"
            style={{
              background: comment.trim() ? "var(--color-accent-blue)" : "var(--color-border-input)",
              border: "none",
              opacity: comment.trim() ? 1 : 0.5,
            }}
          >
            Comment
          </button>
        </div>
      </div>
    </>
  );
}
