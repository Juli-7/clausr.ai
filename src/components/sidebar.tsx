"use client";

import { useState } from "react";
import { SkillsDrawer } from "@/components/skills-drawer";
import { HistoryDrawer } from "@/components/history-drawer";
import { SettingsPopover } from "@/components/settings-popover";
import { useApp } from "@/lib/app-context";

type DrawerType = "skills" | "history" | null;

export function Sidebar() {
  const [openDrawer, setOpenDrawer] = useState<DrawerType>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { setActiveSkill, loadSession } = useApp();

  return (
    <>
      <aside
        className="flex flex-col items-center py-4 gap-1 shrink-0 w-14"
        style={{
          background: "var(--color-bg-card)",
          borderRight: "1px solid var(--color-border-default)",
        }}
      >
        <IconButton
          active={openDrawer === "skills"}
          onClick={() => setOpenDrawer(openDrawer === "skills" ? null : "skills")}
          title="Skills Database"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 14c-2 0-3 1-3 3 0-2-1-3-3-3s-3 1-3 3c0-2-1-3-3-3"/>
            <path d="M6 10h12"/>
            <rect x="3" y="4" width="18" height="16" rx="2"/>
          </svg>
        </IconButton>
        <IconButton
          active={openDrawer === "history"}
          onClick={() => setOpenDrawer(openDrawer === "history" ? null : "history")}
          title="History"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </IconButton>
        <Divider />
        <SettingsPopover
          open={settingsOpen}
          onOpenChange={(open) => setSettingsOpen(open)}
        />
      </aside>

      <SkillsDrawer
        open={openDrawer === "skills"}
        onClose={() => setOpenDrawer(null)}
        onSelectSkill={(id, name) => {
          setActiveSkill(id, name);
          setOpenDrawer(null);
        }}
      />
      <HistoryDrawer
        open={openDrawer === "history"}
        onClose={() => setOpenDrawer(null)}
        onSelectSession={loadSession}
      />
    </>
  );
}

function IconButton({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center transition-colors cursor-pointer border-none w-10 h-10 rounded-lg"
      style={{
        color: active ? "var(--color-accent-blue)" : "var(--color-text-muted)",
        background: active ? "var(--color-accent-blue-bg)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--color-accent-blue-bg)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="w-6 h-px my-2"
      style={{ background: "var(--color-border-default)" }}
    />
  );
}
