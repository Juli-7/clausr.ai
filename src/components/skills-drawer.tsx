"use client";

import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface SkillData {
  name: string;
  description: string;
  triggers: string[];
  skillmd: string;
  references: { name: string; path: string; clauses: string }[];
  scripts: { name: string; path: string; desc: string; params: string }[];
  template: {
    name: string;
    sections: { id: string; title: string; type: string; fields?: { id: string; label: string; type: string }[]; columns?: string[] }[];
  } | null;
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
  const [templateUploading, setTemplateUploading] = useState(false);
  const [parsedTemplate, setParsedTemplate] = useState<SkillData["template"] | null>(null);
  const [pendingDocxDataUrl, setPendingDocxDataUrl] = useState<string | null>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

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

  function deriveStandards(skill: SkillData): string[] {
    return skill.references
      .map((r) => {
        const match = r.name.match(/un-r(\d+)\.md/i);
        return match ? `R${match[1]}` : null;
      })
      .filter((s): s is string => s !== null);
  }

  async function handleTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;

    setTemplateUploading(true);
    try {
      // Read file as data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Send to API for parsing
      const res = await fetch(`/api/skills/${selected.name}/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docxDataUrl: dataUrl }),
      });
      if (!res.ok) throw new Error("Failed to parse template");
      const data = await res.json();
      setParsedTemplate(data.parsedTemplate);
      setPendingDocxDataUrl(dataUrl); // Keep for later save
    } catch (err) {
      console.error("[template] Upload failed:", err);
      alert("Failed to parse template. Make sure the file is a valid .docx with {placeholder} markers.");
    } finally {
      setTemplateUploading(false);
      e.target.value = "";
    }
  }

  async function confirmTemplate() {
    if (!parsedTemplate || !selected) return;
    try {
      const res = await fetch(`/api/skills/${selected.name}/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: parsedTemplate,
          docxDataUrl: pendingDocxDataUrl, // Save original .docx too
        }),
      });
      if (!res.ok) throw new Error("Failed to save template");
      setParsedTemplate(null);
      setPendingDocxDataUrl(null);
      // Reload skill data to show updated template
      const skillsRes = await fetch("/api/skills");
      const data = await skillsRes.json();
      setSkills(data);
      setSelected(data.find((s: SkillData) => s.name === selected.name) ?? null);
    } catch (err) {
      console.error("[template] Save failed:", err);
      alert("Failed to save template.");
    }
  }

  function cancelTemplate() {
    setParsedTemplate(null);
  }

  return (
    <Sheet open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <SheetContent
        side="left"
        className="p-0"
        showCloseButton={false}
        style={{
          width: 880,
          maxWidth: 880,
          left: 56,
          background: "var(--color-bg-dark)",
          borderRight: "1px solid var(--color-border-input)",
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div
            className="flex items-center justify-between shrink-0 px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <span className="text-base font-bold" style={{ color: "var(--color-text-header)" }}>
              ⚡ Skills Database
            </span>
            <div className="flex items-center gap-2.5">
              <button
                className="px-3 py-1 text-xs cursor-pointer rounded-lg"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-input)",
                  color: "var(--color-text-muted)",
                }}
                onClick={() => alert("Create New Skill (mock)")}
              >
                + New
              </button>
              <span
                className="text-xl cursor-pointer"
                style={{ color: "var(--color-text-muted)" }}
                onClick={onClose}
              >
                ✕
              </span>
            </div>
          </div>

          {/* Split: table left, detail right */}
          <div className="flex flex-1 min-h-0">
            {/* LEFT: Table panel — 400px */}
            <div
              className="w-[400px] shrink-0 flex flex-col"
              style={{ borderRight: "1px solid var(--color-border-default)" }}
            >
              <div className="shrink-0 px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <input
                  type="text"
                  placeholder="Search by name or standard (e.g. R48)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 text-xs rounded-lg px-3 outline-none"
                  style={{
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border-input)",
                    color: "var(--color-text-body)",
                  }}
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {skills.length === 0 ? (
                  <div className="p-10 text-center" style={{ color: "var(--color-text-muted)" }}>
                    <p>No skills found.</p>
                    <p className="text-xs mt-1" style={{ color: "var(--color-border-default)" }}>
                      Add skill folders under skills/ in the project root.
                    </p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Description</th>
                        <th style={{ ...thStyle, width: 80, textAlign: "center" as const }}>Stds</th>
                        <th style={{ ...thStyle, width: 50, textAlign: "center" as const }}>Scripts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((skill) => (
                        <tr
                          key={skill.name}
                          onClick={() => setSelected(skill)}
                          className="cursor-pointer"
                          style={{
                            background:
                              selected?.name === skill.name ? "var(--color-accent-blue-bg)" : "transparent",
                          }}
                          onMouseEnter={(e) => {
                            if (selected?.name !== skill.name)
                              e.currentTarget.style.background = "#1f6feb0d";
                          }}
                          onMouseLeave={(e) => {
                            if (selected?.name !== skill.name)
                              e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <td style={tdStyle}>
                            <div className="font-semibold" style={{ color: "var(--color-text-header)" }}>{skill.name}</div>
                          </td>
                          <td style={{ ...tdStyle, color: "var(--color-text-muted)", fontSize: 12 }}>
                            {skill.description.slice(0, 60)}{skill.description.length > 60 ? "..." : ""}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" as const }}>
                            <span style={{ color: "var(--color-accent-blue)", fontSize: 12 }}>
                              {deriveStandards(skill).join(", ")}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" as const, color: "var(--color-text-muted)", fontSize: 12 }}>
                            {skill.scripts.length}
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ ...tdStyle, textAlign: "center" as const, padding: "40px 20px" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>No skills match your search.</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* RIGHT: Detail panel — 480px */}
            <div className="flex-1 overflow-y-auto flex flex-col">
              {detail ? (
                <div className="flex-1 flex flex-col">
                  <div className="flex-1 p-6">
                    {/* Header */}
                    <div style={{ marginBottom: 16 }}>
                      <div className="text-lg font-bold" style={{ color: "var(--color-text-header)" }}>
                        {detail.name}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                        {detail.description}
                      </div>
                    </div>

                    {/* Standards */}
                    <Section title="Standards Covered">
                      <div className="flex gap-2 flex-wrap">
                        {deriveStandards(detail).map((s) => (
                          <span
                            key={s}
                            className="px-2.5 py-1 rounded text-xs font-medium"
                            style={{
                              background: "var(--color-accent-blue-bg)",
                              color: "var(--color-accent-blue)",
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </Section>

                    {/* Triggers */}
                    <Section title="Triggers (auto-detection keywords)">
                      <div className="flex gap-1 flex-wrap">
                        {detail.triggers.map((t) => (
                          <span
                            key={t}
                            className="text-[11px] px-2 py-0.5 rounded"
                            style={{
                              background: "var(--color-border-default)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </Section>

                    {/* References */}
                    <Section title="Reference Documents (L3 — loaded on demand per §6)">
                      <div className="flex gap-1.5 flex-wrap">
                        {detail.references.map((r) => (
                          <div
                            key={r.name}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
                            style={{
                              background: "var(--color-bg-card)",
                              border: "1px solid var(--color-border-default)",
                              color: "var(--color-text-body)",
                            }}
                          >
                            <span style={{ fontSize: 14 }}>📄</span>
                            <span style={{ fontWeight: 500 }}>{r.name}</span>
                            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                              {r.clauses}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Section>

                    {/* Scripts */}
                    <Section title="Scripts (used via function calling)">
                      {detail.scripts.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {detail.scripts.map((s) => (
                            <div
                              key={s.name}
                              className="flex items-center gap-2 px-3 py-2 rounded text-xs"
                              style={{
                                background: "var(--color-bg-card)",
                                border: "1px solid var(--color-border-default)",
                              }}
                            >
                              <span style={{ fontSize: 14 }}>▶</span>
                              <span style={{ fontWeight: 500, color: "var(--color-text-body)", flex: 1 }}>
                                {s.name}
                              </span>
                              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{s.desc}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>No scripts</span>
                      )}
                    </Section>

                    {/* Template */}
                    <Section title="Report Template">
                      {/* Parsed template preview (before confirmation) */}
                      {parsedTemplate ? (
                        <div className="mb-2 p-2 rounded" style={{ background: "var(--color-amber-bg)", border: "1px solid var(--color-amber-border)" }}>
                          <div className="text-xs font-semibold mb-1" style={{ color: "var(--color-text-header)" }}>
                            Parsed Template Preview
                          </div>
                          <div className="flex gap-1.5 flex-wrap mb-2">
                            {parsedTemplate.sections?.map((s: { id: string; title: string; type: string; fields?: { id: string; label: string; type: string }[]; columns?: string[] }) => (
                              <div key={s.id} className="text-[11px] px-2 py-0.5 rounded"
                                style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", color: "var(--color-text-muted)" }}>
                                {s.title} <span style={{ color: "var(--color-accent-blue)", fontSize: 10 }}>({s.type})</span>
                                {s.type === "fields" && s.fields && s.fields.length > 0 && (
                                  <div className="mt-1 flex flex-col gap-0.5" style={{ borderTop: "1px dashed var(--color-border-default)", paddingTop: 4 }}>
                                    {s.fields.map((f) => (
                                      <span key={f.id} style={{ display: "block", fontSize: 10, color: "var(--color-text-body)", paddingLeft: 4 }}>
                                        <span style={{ color: "var(--color-amber)" }}>{"{"}</span>{f.id}<span style={{ color: "var(--color-amber)" }}>{"}"}</span>
                                        <span style={{ color: "var(--color-text-muted)", marginLeft: 4 }}>— {f.label}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={confirmTemplate}
                              className="text-[11px] px-2 py-1 rounded cursor-pointer bg-transparent border-none"
                              style={{ background: "var(--color-success-bg)", color: "#fff" }}>
                              Confirm & Save
                            </button>
                            <button onClick={cancelTemplate}
                              className="text-[11px] px-2 py-1 rounded cursor-pointer bg-transparent"
                              style={{ border: "1px solid var(--color-border-input)", color: "var(--color-text-body)" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {detail.template ? (
                        <div className="flex flex-col gap-1">
                          <div className="text-xs" style={{ color: "var(--color-text-body)", fontWeight: 500 }}>
                            {detail.template.name}
                          </div>
                          <div className="flex gap-1.5 flex-wrap mt-1">
                            {detail.template.sections.map((s) => (
                              <div
                                key={s.id}
                                className="text-[11px] px-2 py-0.5 rounded"
                                style={{
                                  background: "var(--color-bg-card)",
                                  border: "1px solid var(--color-border-default)",
                                  color: "var(--color-text-muted)",
                                }}
                              >
                                {s.title}
                                <span className="ml-1" style={{ color: "var(--color-accent-blue)", fontSize: 10 }}>
                                  ({s.type})
                                </span>
                                {s.type === "fields" && s.fields && s.fields.length > 0 && (
                                  <div className="mt-1 flex flex-col gap-0.5" style={{ borderTop: "1px dashed var(--color-border-default)", paddingTop: 4 }}>
                                    {s.fields.map((f) => (
                                      <span key={f.id} style={{ display: "block", fontSize: 10, color: "var(--color-text-body)", paddingLeft: 4 }}>
                                        <span style={{ color: "var(--color-amber)" }}>{"{"}</span>{f.id}<span style={{ color: "var(--color-amber)" }}>{"}"}</span>
                                        <span style={{ color: "var(--color-text-muted)", marginLeft: 4 }}>— {f.label}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => templateInputRef.current?.click()}
                            className="mt-2 text-[11px] px-2.5 py-1 rounded cursor-pointer inline-flex items-center gap-1 bg-transparent"
                            style={{ border: "1px dashed var(--color-border-input)", color: "var(--color-text-muted)", alignSelf: "flex-start" }}
                          >
                            Replace Template (.docx)
                          </button>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            No template configured — will use default markdown layout.
                          </span>
                          <button
                            onClick={() => templateInputRef.current?.click()}
                            disabled={templateUploading}
                            className="mt-2 text-[11px] px-2.5 py-1 rounded cursor-pointer inline-flex items-center gap-1 bg-transparent"
                            style={{ border: "1px dashed var(--color-border-input)", color: "var(--color-text-muted)", display: "block" }}
                          >
                            {templateUploading ? "⏳ Parsing..." : "Upload Template (.docx)"}
                          </button>
                        </div>
                      )}
                    </Section>

                    {/* SKILL.md */}
                    <Section title="SKILL.md (L2 — full execution methodology)">
                      <div
                        className="p-3 rounded-lg text-xs leading-relaxed font-mono overflow-y-auto"
                        style={{
                          background: "var(--color-bg-card)",
                          border: "1px solid var(--color-border-default)",
                          color: "var(--color-text-body)",
                          whiteSpace: "pre-wrap",
                          maxHeight: 200,
                        }}
                      >
                        {detail.skillmd}
                      </div>
                    </Section>
                  </div>

                  {/* Hidden file input for template upload */}
                  <input
                    ref={templateInputRef}
                    type="file"
                    accept=".docx"
                    onChange={handleTemplateUpload}
                    style={{ display: "none" }}
                  />

                  {/* Actions */}
                  <div
                    className="flex gap-2 px-6 py-4"
                    style={{ borderTop: "1px solid var(--color-border-default)" }}
                  >
                    <button
                      className="flex-1 h-8 px-4 text-xs font-medium cursor-pointer rounded-lg"
                      style={{
                        background: "var(--color-success-bg)",
                        border: "1px solid #2ea043",
                        color: "#fff",
                      }}
                      onClick={() => {
                        onSelectSkill?.(detail.name, detail.name);
                        onClose();
                      }}
                    >
                      Use Skill
                    </button>
                    <button
                      className="h-8 px-4 text-xs cursor-pointer rounded-lg"
                      style={{
                        background: "transparent",
                        border: "1px solid var(--color-border-input)",
                        color: "var(--color-text-body)",
                      }}
                      onClick={onClose}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center flex-1 text-center gap-2 leading-relaxed"
                  style={{ color: "var(--color-text-muted)", fontSize: 13 }}
                >
                  <span>
                    {skills.length === 0
                      ? "No skills found on disk.\nAdd skill folders under skills/."
                      : "Select a skill from the list to view its details"}
                  </span>
                  <span style={{ color: "var(--color-border-default)", fontSize: 12 }}>
                    Click the &ldquo;Use Skill&rdquo; button to activate it
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        className="text-[11px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 14px",
  background: "var(--color-bg-card)",
  color: "var(--color-text-muted)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  fontWeight: 600,
  borderBottom: "1px solid var(--color-border-default)",
  position: "sticky",
  top: 0,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--color-bg-card)",
  fontSize: 13,
};
