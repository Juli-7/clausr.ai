"use client";

interface ChatSuggestionsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function ChatSuggestions({ suggestions, onSelect }: ChatSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      data-suggestions="true"
      className="shrink-0 scrollbar-hide"
      style={{
        display: "flex", gap: 3, overflowX: "auto", whiteSpace: "nowrap",
        padding: "3px 10px 0",
        scrollbarWidth: "none",
      }}
    >
      {suggestions.map((s, i) => (
        <button
          key={i}
          className="border-none rounded-full cursor-pointer"
          style={{
            fontSize: 9, padding: "2px 8px",
            border: "1px solid var(--color-border-default)",
            background: "var(--color-bg-card)",
            color: "var(--color-text-muted)",
            fontFamily: "'DM Sans', sans-serif",
            transition: "all .15s",
          }}
          onClick={() => onSelect(s)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-accent-blue-bg)";
            e.currentTarget.style.color = "var(--color-accent-blue)";
            e.currentTarget.style.borderColor = "var(--color-accent-blue)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-bg-card)";
            e.currentTarget.style.color = "var(--color-text-muted)";
            e.currentTarget.style.borderColor = "var(--color-border-default)";
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
