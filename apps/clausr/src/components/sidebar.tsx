"use client";

import { useState } from "react";
import { HistoryDrawer } from "@/components/history-drawer";
import { ProfileDrawer } from "@/components/profile-drawer";
import { useApp } from "@/lib/app-context";

type DrawerType = "history" | "profile" | null;

export function Sidebar() {
  const [openDrawer, setOpenDrawer] = useState<DrawerType>(null);
  const { loadSession } = useApp();

  return (
    <>
      <aside
        className="flex flex-col items-center py-4 gap-1 shrink-0 w-14"
        style={{
          background: "var(--color-bg-card)",
          borderRight: "1px solid var(--color-border-default)",
        }}
      >
        <button
          className="flex items-center justify-center transition-colors w-10 h-10 rounded-lg cursor-pointer border-none"
          style={{ color: "var(--color-text-muted)" }}
          title="New Session"
          onClick={() => {
            localStorage.removeItem("compliance-session");
            window.location.href = "/?session=_new";
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-accent-blue-bg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14"/>
            <path d="M5 12h14"/>
          </svg>
        </button>
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
        <Spacer />
        <div className="relative group">
          <a
            href="/enterprise"
            className="flex items-center justify-center transition-colors w-10 h-10 rounded-lg no-underline cursor-pointer"
            style={{ color: "#b8960f", fontSize: 16 }}
          >
            ✨
          </a>
          <div
            className="absolute left-full top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50 pointer-events-none"
            style={{ marginLeft: 6 }}
          >
            <div
              style={{
                width: 0, height: 0,
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
                borderRight: "5px solid rgba(212,175,55,0.2)",
              }}
            />
            <div
              className="text-xs whitespace-nowrap rounded-lg px-3 py-2"
              style={{
                background: "linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.04))",
                border: "1px solid rgba(212,175,55,0.25)",
                color: "var(--color-text-body)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              }}
            >
              <span style={{ color: "#b8960f" }}>✨</span>{" "}
              find the sparkles
              <span style={{ color: "var(--color-text-muted)", marginLeft: 4, fontSize: 10 }}>— collect all 4</span>
            </div>
          </div>
        </div>
        <IconButton
          active={openDrawer === "profile"}
          onClick={() => setOpenDrawer(openDrawer === "profile" ? null : "profile")}
          title="Profile"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </IconButton>
      </aside>

      <HistoryDrawer
        open={openDrawer === "history"}
        onClose={() => setOpenDrawer(null)}
        onSelectSession={loadSession}
      />
      <ProfileDrawer
        open={openDrawer === "profile"}
        onClose={() => setOpenDrawer(null)}
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

function Spacer() {
  return <div style={{ flex: 1 }} />;
}
