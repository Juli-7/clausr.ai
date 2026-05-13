"use client";

interface ScriptExecutionCardProps {
  toolName: string;
  status: "success" | "error";
  summary: string;
}

export function ScriptExecutionCard({ toolName, status, summary }: ScriptExecutionCardProps) {
  return (
    <div
      className="p-3 rounded-lg mb-2 font-mono text-xs"
      style={{
        background: "#0d1117",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{
          color: status === "success" ? "var(--color-success)" : "var(--color-danger)",
          fontWeight: 600,
        }}>
          {status === "success" ? "✓" : "✗"}
        </span>
        <span style={{ color: "var(--color-text-header)", fontWeight: 600 }}>
          {toolName}
        </span>
      </div>
      <div style={{ height: 1, background: "var(--color-border-default)", marginBottom: 8 }} />
      <div style={{ color: "var(--color-text-muted)" }}>
        {summary}
      </div>
    </div>
  );
}
