"use client";

export function LearningBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="flex items-center justify-between shrink-0 px-4 py-2 text-xs"
      style={{
        background: "#3fb95011",
        borderBottom: "1px solid #3fb95033",
      }}
    >
      <span style={{ color: "var(--color-success)" }}>
        🧠 Auto-applied from experience: {message}
      </span>
      <button
        onClick={onDismiss}
        className="text-success cursor-pointer ml-4 bg-transparent border-none text-sm"
      >
        ✕
      </button>
    </div>
  );
}
