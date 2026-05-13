"use client";

export function InlineCommentThread({
  author,
  selectedText,
  comment,
  isRevising,
}: {
  author: string;
  selectedText: string;
  comment: string;
  isRevising?: boolean;
}) {
  return (
    <div
      className="mt-3 px-3 py-2.5 text-xs rounded-r-lg"
      style={{
        background: "#d299220d",
        borderLeft: "3px solid var(--color-amber)",
      }}
    >
      <div>
        <span style={{ fontWeight: 600, color: "var(--color-text-header)" }}>{author}</span>
        <span style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: 11, marginLeft: 4 }}>
          — selected &ldquo;{selectedText}&rdquo;
        </span>
      </div>
      <div style={{ color: "var(--color-text-body)", marginTop: 2 }}>{comment}</div>
      {isRevising && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
          ↪ <strong style={{ color: "var(--color-accent-blue)" }}>Agent is revising...</strong>
        </div>
      )}
    </div>
  );
}
