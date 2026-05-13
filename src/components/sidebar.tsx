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
          ⚡
        </IconButton>
        <IconButton
          active={openDrawer === "history"}
          onClick={() => setOpenDrawer(openDrawer === "history" ? null : "history")}
          title="History"
        >
          🕐
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
      className="flex items-center justify-center text-lg transition-colors cursor-pointer border-none w-10 h-10 rounded-lg"
      style={{
        color: active ? "var(--color-accent-blue)" : "var(--color-text-muted)",
        background: active ? "var(--color-accent-blue-bg)" : "transparent",
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
