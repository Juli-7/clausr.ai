"use client";

import { useEffect, useRef } from "react";
import { ScriptExecutionCard } from "@/components/script-execution-card";
import type { ChatTurn } from "@/types/agent-types";

interface ReasoningPanelProps {
  turns: ChatTurn[];
  loading: boolean;
  stepStatus?: string | null;
}

export function ReasoningPanel({ turns, loading, stepStatus }: ReasoningPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasContent = turns.length > 0;

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [turns, loading]);

  if (!hasContent && !loading) {
    return (
      <div
        className="flex items-center justify-center h-full text-center p-5"
        style={{ color: "var(--color-text-muted)", fontSize: 13 }}
      >
        Audit trail will appear here.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="shrink-0 px-4 py-3 border-b border-border-default">
        <div
          className="text-2xs uppercase tracking-wider font-semibold"
          style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Audit Trail
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", padding: "8px" }}>

        {turns.map((turn, turnIdx) => (
          <div key={turnIdx} className="mb-4">
            {/* User message entry */}
            <div
              className="mb-2 p-3 rounded-lg text-xs"
              style={{
                border: "1px solid var(--color-border-subtle)",
                background: "var(--color-bg-card)",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-2xs font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--color-accent-blue-bg)",
                    color: "var(--color-accent-blue)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  User · Turn {turnIdx + 1}
                </span>
              </div>
              <p style={{ color: "var(--color-text-body)", lineHeight: 1.5, margin: 0 }}>
                {turn.userMessage}
              </p>
            </div>

            {/* Error */}
            {turn.error && (
              <div
                className="mb-2 p-2 rounded text-xs"
                style={{ color: "var(--color-danger)", background: "rgba(196, 113, 122, 0.08)" }}
              >
                ⚠️ {turn.error}
              </div>
            )}

            {/* Reasoning steps */}
            {turn.reasoningSteps.length > 0 && (
              <div className="mb-2">
                {turn.reasoningSteps.map((step, i) => {
                  const isStreaming =
                    turn.response === null && i === turn.reasoningSteps.length - 1;
                  const isFail =
                    step.body.includes("FAIL") || step.title.includes("FAIL");

                  return (
                    <StepCard
                      key={i}
                      stepNumber={step.stepNumber}
                      subStep={step.subStep}
                      action={step.title}
                      isFail={isFail}
                      isStreaming={isStreaming}
                    >
                      {step.body && (
                        <div
                          className="text-xs ml-7 leading-relaxed"
                          style={{
                            color: "var(--color-text-muted)",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {step.body}
                        </div>
                      )}
                      <div
                        className="ml-7 mt-1.5 text-xs font-semibold"
                        style={{
                          color: isFail ? "var(--color-danger)" : "var(--color-success)",
                        }}
                      >
                        {isStreaming
                          ? "Running..."
                          : isFail
                            ? `✗ FAIL — ${extractRegulation(step.body) || "Non-compliance"}`
                            : "✓ Complete"}
                      </div>
                    </StepCard>
                  );
                })}
              </div>
            )}

            {/* Live tool results or stored tool calls */}
            {turn.liveToolResults.length > 0 ? (
              <div className="mt-1 mb-2">
                {turn.liveToolResults.map((tr, i) =>
                  tr.results.map((r, j) => (
                    <ScriptExecutionCard
                      key={`${i}-${j}`}
                      toolName={`numerical check - ${r.name}`}
                      status={r.status === "pass" ? "success" : "error"}
                      summary={`${r.value} ${r.comparison} → ${r.status}`}
                    />
                  ))
                )}
              </div>
            ) : turn.response?.toolCalls && turn.response.toolCalls.length > 0 ? (
              <div className="mt-1 mb-2">
                {turn.response.toolCalls.map((tc, i) => (
                  <ScriptExecutionCard
                    key={i}
                    toolName={tc.toolName}
                    status={tc.status}
                    summary={tc.summary}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {loading && (
          <div className="flex items-center justify-center py-6">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-6 h-6 rounded-full animate-spin"
                style={{
                  border: "2px solid var(--color-border-default)",
                  borderTopColor: "var(--color-accent-blue)",
                }}
              />
              <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                {stepStatus ? formatStepPhase(stepStatus) : "Analyzing..."}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatStepPhase(phase: string): string {
  if (phase === "evaluating") return "Evaluating results...";
  if (phase.startsWith("step-")) return `Executing step ${phase.slice(5)}...`;
  if (phase.startsWith("executing-")) return phase.replace(/-/g, " ") + "...";
  return phase.replace(/-/g, " ") + "...";
}

function extractRegulation(text: string): string | null {
  const match = text.match(/R\d+|§[\d.]+/);
  return match ? match[0] : null;
}

function StepCard({
  stepNumber,
  subStep,
  action,
  children,
  isStreaming,
}: {
  stepNumber: number;
  subStep?: number;
  action: string;
  children?: React.ReactNode;
  isFail?: boolean;
  isStreaming?: boolean;
}) {
  const label = subStep ? `${stepNumber}.${subStep}` : `${stepNumber}`;

  return (
    <div
      className="p-3 rounded-lg mb-1.5"
      style={{
        border: isStreaming
          ? "1px solid var(--color-accent-blue)"
          : "1px solid var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-5 h-5 rounded text-2xs font-semibold flex items-center justify-center shrink-0"
          style={{
            background: isStreaming
              ? "var(--color-accent-blue-bg)"
              : "var(--color-bg-dark)",
            color: isStreaming
              ? "var(--color-accent-blue)"
              : "var(--color-text-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {label}
        </div>
        <div className="text-xs font-medium" style={{ color: "var(--color-text-header)" }}>
          {action}
          {isStreaming && (
            <span className="ml-1.5 inline-block w-1.5 h-3 align-middle" style={{ background: "var(--color-accent-blue)", animation: "blink 0.8s step-end infinite" }} />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
