"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Lesson {
  text: string;
  confidence: number;
  sourceSkill: string;
}

export function EvolutionConfirmDialog({
  open,
  lesson,
  onConfirm,
  onDismiss,
}: {
  open: boolean;
  lesson: Lesson | null | undefined;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (!lesson) return null;

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onDismiss()}>
      <DialogContent
        className="max-w-md"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-input)",
          color: "var(--color-text-body)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--color-text-header)" }}>
            📖 Lessons Learned from this session
          </DialogTitle>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 4 }}>
            The agent identified a generalizable improvement:
          </p>
        </DialogHeader>
        <div
          style={{
            background: "var(--color-bg-dark)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 8,
            padding: 16,
            marginTop: 12,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--color-text-body)", lineHeight: 1.5 }}>
            &ldquo;{lesson.text}&rdquo;
          </p>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8, display: "flex", gap: 16 }}>
          <span>Confidence: {lesson.confidence}/10</span>
          <span>Skill: {lesson.sourceSkill}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
          This will be added to SKILL.md §7 Experience Accumulation.
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-text-muted"
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            style={{
              background: "var(--color-success-bg)",
              border: "1px solid #2ea043",
            }}
          >
            Confirm &amp; Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
