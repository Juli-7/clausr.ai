"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AgentResponse } from "@/lib/agent/types";
import type { ReportTemplate } from "@/lib/agent/template-types";
import { generateDocx } from "@/lib/export-docx";

interface DownloadDropdownProps {
  response: AgentResponse | null;
  template?: ReportTemplate | null;
  skillName?: string;
}

export function DownloadDropdown({ response, template, skillName }: DownloadDropdownProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    }
    if (open) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [open, closeMenu]);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
        width: 224,
        zIndex: 9999,
      });
    }
  }, [open]);

  async function handleDownload() {
    if (!response) return;
    closeMenu();
    setExporting(true);

    try {
      const blob = await generateDocx(response, template, skillName);
      const title = skillName ? `${skillName} Compliance Report` : "Compliance Report";
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}_${date}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[download] Failed to generate .docx:", err);
    } finally {
      setExporting(false);
    }
  }

  const menu = open && (
    <div
      ref={menuRef}
      style={{
        ...menuStyle,
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-input)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        overflow: "hidden",
      }}
    >
      <DownloadOption
        icon="📄"
        label="Word (.docx)"
        hint="with citations"
        onClick={handleDownload}
        disabled={!response || exporting}
      />
      <div style={{ height: 1, background: "var(--color-border-default)" }} />
      <DownloadOption
        icon="📕"
        label="Print / PDF (.pdf)"
        hint="system dialog"
        onClick={() => { closeMenu(); setTimeout(() => window.print(), 0); }}
        disabled={false}
      />
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="h-7 px-3 text-xs cursor-pointer rounded-lg"
        style={{
          background: "transparent",
          border: "1px solid var(--color-border-input)",
          color: "var(--color-text-body)",
          opacity: exporting ? 0.5 : 1,
        }}
      >
        {exporting ? "⏳" : "⬇ Download"}
      </button>
      {typeof window !== "undefined" ? createPortal(menu, document.body) : menu}
    </>
  );
}

function DownloadOption({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  hint: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left flex items-center gap-2 px-3.5 py-2.5 text-xs cursor-pointer bg-transparent border-none"
      style={{
        color: disabled ? "var(--color-text-muted)" : "var(--color-text-body)",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--color-accent-blue-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{hint}</span>
    </button>
  );
}
