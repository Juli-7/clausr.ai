"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface SkillData {
  name: string;
  description: string;
  triggers: string[];
  skillmd: string;
  regulationIds: string[];
  scripts: { name: string; path: string; desc: string; params: string }[];
  hasTemplate: boolean;
}

export function SkillsDrawer({
  open,
  onClose,
  onSelectSkill,
}: {
  open: boolean;
  onClose: () => void;
  onSelectSkill?: (id: string, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SkillData | null>(null);
  const [skills, setSkills] = useState<SkillData[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/skills")
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        setSkills(data);
        setSelected(null);
      })
      .catch(() => setSkills([]));
  }, [open]);

  const filtered = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.triggers.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const detail = selected;

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent
        side="left"
        className="p-0"
        showCloseButton={false}
        style={{
          width: 920,
          maxWidth: 920,
          left: 56,
          background: "var(--color-bg-dark)",
          borderRight: "1px solid var(--color-border-input)",
        }}
      >
        <div className="flex flex-col h-full">

          {/* Header */}
          <div
            className="flex items-center justify-between shrink-0 px-6 py-4"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="font-bold text-base tracking-tight"
                style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}
              >
                Skills
              </span>
              <span className="text-2xs px-2 py-0.5 rounded font-medium"
                style={{ background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)" }}>
                {skills.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="h-7 px-3 text-xs cursor-pointer rounded-lg transition-all duration-150"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-input)",
                  color: "var(--color-text-muted)",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onClick={() => alert("Create New Skill (mock)")}
              >
                + New
              </button>
              <button
                className="h-7 w-7 flex items-center justify-center cursor-pointer rounded-lg transition-all duration-150"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-input)",
                  color: "var(--color-text-muted)",
                }}
                onClick={onClose}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Split */}
          <div className="flex flex-1 min-h-0">

            {/* LEFT — list */}
            <div
              className="w-[380px] shrink-0 flex flex-col"
              style={{ borderRight: "1px solid var(--color-border-default)" }}
            >
              {/* Search */}
              <div className="shrink-0 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <div className="relative">
                  <svg
                    width="13" height="13" viewBox="0 0 16 16" fill="none"
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--color-text-muted)", pointerEvents: "none" }}
                  >
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search skills..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-8 text-xs rounded-lg pl-8 pr-3 outline-none transition-all duration-150"
                    style={{
                      background: "var(--color-bg-card)",
                      border: "1px solid var(--color-border-input)",
                      color: "var(--color-text-body)",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-accent-blue)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--color-border-input)";
                    }}
                  />
                </div>
              </div>

              {/* Skills list */}
              <div className="flex-1 overflow-y-auto py-2">
                {skills.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6" style={{ color: "var(--color-text-muted)" }}>
                    <span className="text-sm">No skills found</span>
                    <span className="text-xs mt-1" style={{ color: "var(--color-border-default)" }}>
                      Add skill folders under skills/
                    </span>
                  </div>
                ) : (
                  filtered.map((skill) => {
                    const isActive = selected?.name === skill.name;
                    return (
                      <div
                        key={skill.name}
                        onClick={() => setSelected(skill)}
                        className="cursor-pointer mx-2 px-3 py-2.5 rounded-lg transition-all duration-150"
                        style={{
                          background: isActive ? "var(--color-accent-blue-bg)" : "transparent",
                          borderLeft: isActive ? "2px solid #E2A6A9" : "2px solid transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = "color-mix(in srgb, var(--color-accent-blue-bg) 50%, transparent)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = "transparent";
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold leading-snug" style={{ color: "var(--color-text-header)", fontFamily: "'DM Sans', sans-serif" }}>
                            {skill.name}
                          </span>
                          {skill.scripts.length > 0 && (
                            <span className="text-2xs ml-2 shrink-0 px-1.5 py-0.5 rounded"
                              style={{ background: "var(--color-border-default)", color: "var(--color-text-muted)" }}>
                              {skill.scripts.length}s
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--color-text-muted)" }}>
                          {skill.description}
                        </div>
                        {skill.regulationIds.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {skill.regulationIds.slice(0, 3).map((r) => (
                              <span key={r}
                                className="text-2xs px-1.5 py-0.5 rounded"
                                style={{ background: "var(--color-accent-blue-bg)", color: "var(--color-accent-blue)" }}>
                                {r}
                              </span>
                            ))}
                            {skill.regulationIds.length > 3 && (
                              <span className="text-2xs" style={{ color: "var(--color-text-muted)" }}>
                                +{skill.regulationIds.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {skills.length > 0 && filtered.length === 0 && (
                  <div className="text-center py-10 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    No skills match your search.
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — detail */}
            <div className="flex-1 flex flex-col min-w-0">
              {detail ? (
                <>
                  <div className="flex-1 overflow-y-auto px-8 py-8">

                    {/* Skill name + description */}
                    <div style={{ marginBottom: 28 }}>
                      <h2 className="text-2xl font-bold leading-tight" style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}>
                        {detail.name}
                      </h2>
                      <p className="text-sm mt-1.5" style={{ color: "var(--color-text-muted)" }}>
                        {detail.description}
                      </p>
                    </div>

                    {/* Standards */}
                    <div className="mb-8">
                      <div className="flex gap-2 flex-wrap">
                        {detail.regulationIds.map((s) => (
                          <span
                            key={s}
                            className="px-3 py-1 text-xs font-medium rounded-full"
                            style={{
                              background: "var(--color-accent-blue-bg)",
                              color: "var(--color-accent-blue)",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Report template */}
                    {detail.hasTemplate && (
                      <div className="mb-8">
                        <span className="text-2xs uppercase tracking-widest font-semibold mb-2 block" style={{ color: "var(--color-text-muted)" }}>
                          Report template
                        </span>
                        <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                          template.docx
                        </span>
                      </div>
                    )}

                    {/* Trigger keywords */}
                    {detail.triggers.length > 0 && (
                      <div className="mb-8">
                        <span className="text-2xs uppercase tracking-widest font-semibold mb-2 block" style={{ color: "var(--color-text-muted)" }}>
                          Triggers
                        </span>
                        <div className="flex gap-1.5 flex-wrap">
                          {detail.triggers.map((t) => (
                            <span
                              key={t}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                background: "var(--color-bg-card)",
                                color: "var(--color-text-muted)",
                                fontFamily: "'JetBrains Mono', monospace",
                                border: "1px solid var(--color-border-default)",
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Scripts */}
                    {detail.scripts.length > 0 && (
                      <div className="mb-8">
                        <span className="text-2xs uppercase tracking-widest font-semibold mb-2 block" style={{ color: "var(--color-text-muted)" }}>
                          Scripts
                        </span>
                        <div className="flex flex-col gap-1">
                          {detail.scripts.map((s) => (
                            <div
                              key={s.name}
                              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors duration-150"
                              style={{
                                background: "var(--color-bg-card)",
                                border: "1px solid var(--color-border-default)",
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                                <path d="M6 4l4 4-4 4" stroke="#E2A6A9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span style={{ fontWeight: 500, color: "var(--color-text-body)", flex: 1 }}>
                                {s.name}
                              </span>
                              <span style={{ color: "var(--color-text-muted)" }}>{s.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SKILL.md */}
                    <div className="mb-6">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xs uppercase tracking-widest font-semibold" style={{ color: "var(--color-text-muted)" }}>
                          Execution methodology
                        </span>
                        <div style={{ flex: 1, height: 1, background: "var(--color-border-default)" }} />
                      </div>
                      <div
                        className="rounded-lg text-xs leading-relaxed"
                        style={{
                          background: "var(--color-bg-card)",
                          color: "var(--color-text-body)",
                          fontFamily: "'DM Sans', sans-serif",
                          whiteSpace: "pre-wrap",
                          padding: "16px 18px",
                          border: "1px solid var(--color-border-default)",
                          lineHeight: 1.7,
                        }}
                      >
                        {detail.skillmd}
                      </div>
                    </div>

                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-3 px-8 py-4 shrink-0"
                    style={{ borderTop: "1px solid var(--color-border-default)" }}
                  >
                    <button
                      className="h-9 px-5 text-sm font-medium cursor-pointer rounded-lg transition-all duration-150"
                      style={{
                        background: "#2944AB",
                        border: "1px solid #2944AB",
                        color: "#fff",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#1e3580";
                        e.currentTarget.style.borderColor = "#1e3580";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#2944AB";
                        e.currentTarget.style.borderColor = "#2944AB";
                      }}
                      onClick={() => {
                        onSelectSkill?.(detail.name, detail.name);
                        onClose();
                      }}
                    >
                      Use Skill
                    </button>
                    <button
                      className="h-9 px-4 text-sm cursor-pointer rounded-lg transition-all duration-150"
                      style={{
                        background: "transparent",
                        border: "1px solid var(--color-border-input)",
                        color: "var(--color-text-body)",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--color-bg-card)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      onClick={onClose}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-10 gap-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: "var(--color-border-default)", marginBottom: 4 }}>
                    <path d="M4 4h16v16H4V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {skills.length === 0 ? "No skills found on disk" : "Select a skill to view its details"}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-border-default)" }}>
                    {skills.length === 0 ? "Add skill folders under skills/" : "Click a skill from the list"}
                  </span>
                </div>
              )}
            </div>

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
