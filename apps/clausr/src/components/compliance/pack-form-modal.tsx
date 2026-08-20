"use client";

import { useState, useCallback } from "react";
import { t } from "@/lib/compliance/i18n";

interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  field: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "boolean" | "select";
  required: boolean;
  options?: FieldOption[];
  validation?: { min?: number; max?: number; maxLength?: number };
}

interface DocDef {
  type: string;
  title: string;
  template?: string;
  fields: string[];
}

interface CheckDef {
  id: string;
  field: string;
  type: "number" | "boolean" | "narrative" | "string" | "enum";
  description: string;
  clause?: string;
  constraint?: string;
  rounding?: number;
  depends_on?: string;
  sample?: string;
}

export interface PackFormData {
  title: string;
  description: string;
  industries: string;
  regulations: string;
  triggers: string;
  icon: string;
  fields: FieldDef[];
  documents: DocDef[];
  checks: CheckDef[];
  redlines: string;
  lessons: string;
  checkPreview: "compact" | "full";
  expertName: string;
  expertContact: string;
  expertIntro: string;
  version: string;
  bump: "patch" | "minor" | "major";
  status: "draft" | "published";
}

const emptyField = (): FieldDef => ({ field: "", label: "", type: "text" as const, required: true });
const emptyDoc = (): DocDef => ({ type: "", title: "", fields: [] });
const emptyCheck = (): CheckDef => ({ id: "", field: "", type: "narrative", description: "" });

interface PackFormModalProps {
  packId?: string;
  initialData?: Partial<PackFormData>;
  onClose: () => void;
  onSuccess: () => void;
  inline?: boolean;
}

const FIELD_TYPES = ["text", "textarea", "date", "number", "boolean", "select"] as const;
const CHECK_TYPES = ["number", "boolean", "narrative", "string", "enum"] as const;

export function PackFormModal({ packId, initialData, onClose, onSuccess, inline }: PackFormModalProps) {
  const [form, setForm] = useState<PackFormData>({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    industries: initialData?.industries ?? "",
    regulations: initialData?.regulations ?? "",
    triggers: initialData?.triggers ?? "",
    icon: initialData?.icon ?? "📋",
    fields: initialData?.fields ?? [],
    documents: initialData?.documents ?? [emptyDoc()],
    checks: (initialData as { checks?: CheckDef[] })?.checks ?? [],
    redlines: initialData?.redlines ?? "",
    lessons: initialData?.lessons ?? "",
    checkPreview: initialData?.checkPreview ?? "full",
    expertName: initialData?.expertName ?? "",
    expertContact: initialData?.expertContact ?? "",
    expertIntro: initialData?.expertIntro ?? "",
    version: initialData?.version ?? "1.0.0",
    bump: "patch",
    status: (initialData as { status?: "draft" | "published" })?.status ?? "published",
  });
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!packId;

  const updateMeta = useCallback((key: keyof PackFormData, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const addDoc = useCallback(() => {
    setForm((f) => ({ ...f, documents: [...f.documents, emptyDoc()] }));
  }, []);

  const removeDoc = useCallback((di: number) => {
    setForm((f) => ({
      ...f,
      documents: f.documents.length > 1 ? f.documents.filter((_, i) => i !== di) : f.documents,
    }));
  }, []);

  const updateDocMeta = useCallback((di: number, key: "type" | "title" | "template", value: string) => {
    setForm((f) => {
      const docs = f.documents.map((d, i) => (i === di ? { ...d, [key]: value } : d));
      return { ...f, documents: docs };
    });
  }, []);

  const addField = useCallback(() => {
    setForm((f) => ({ ...f, fields: [...f.fields, emptyField()] }));
  }, []);

  const removeField = useCallback((fi: number) => {
    setForm((f) => {
      const id = f.fields[fi]?.field;
      return {
        ...f,
        fields: f.fields.filter((_, i) => i !== fi),
        documents: id ? f.documents.map((d) => ({ ...d, fields: d.fields.filter((fid) => fid !== id) })) : f.documents,
      };
    });
  }, []);

  const updateField = useCallback((fi: number, key: keyof FieldDef, value: string | boolean) => {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((fd, i) => (i === fi ? { ...fd, [key]: value } : fd)),
    }));
  }, []);

  const setFieldValidation = useCallback((fi: number, key: "min" | "max" | "maxLength", value: string) => {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((fd, i) => {
        if (i !== fi) return fd;
        const v = { ...(fd.validation ?? {}), [key]: value ? Number(value) : undefined };
        return { ...fd, validation: v.min !== undefined || v.max !== undefined || v.maxLength !== undefined ? v : undefined };
      }),
    }));
  }, []);

  const addFieldOption = useCallback((fi: number) => {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((fd, i) => (i === fi ? { ...fd, options: [...(fd.options ?? []), { value: "", label: "" }] } : fd)),
    }));
  }, []);

  const removeFieldOption = useCallback((fi: number, oi: number) => {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((fd, i) => {
        if (i !== fi) return fd;
        const opts = (fd.options ?? []).filter((_, k) => k !== oi);
        return { ...fd, options: opts.length ? opts : undefined };
      }),
    }));
  }, []);

  const updateFieldOption = useCallback((fi: number, oi: number, key: "value" | "label", val: string) => {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((fd, i) => {
        if (i !== fi) return fd;
        const opts = (fd.options ?? []).map((o, k) => (k === oi ? { ...o, [key]: val } : o));
        return { ...fd, options: opts };
      }),
    }));
  }, []);

  const toggleDocField = useCallback((di: number, fieldId: string) => {
    setForm((f) => ({
      ...f,
      documents: f.documents.map((d, i) => {
        if (i !== di) return d;
        const has = d.fields.includes(fieldId);
        return { ...d, fields: has ? d.fields.filter((fid) => fid !== fieldId) : [...d.fields, fieldId] };
      }),
    }));
  }, []);

  const addCheck = useCallback(() => {
    setForm((f) => ({ ...f, checks: [...f.checks, emptyCheck()] }));
  }, []);

  const removeCheck = useCallback((ci: number) => {
    setForm((f) => ({
      ...f,
      checks: f.checks.filter((_, i) => i !== ci),
    }));
  }, []);

  const updateCheck = useCallback((ci: number, key: keyof CheckDef, value: string | number | undefined) => {
    setForm((f) => {
      const checks = f.checks.map((c, i) => (i === ci ? { ...c, [key]: value } : c));
      return { ...f, checks };
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const fields = form.fields
        .filter((f) => f.field.trim() && f.label.trim())
        .map((f) => {
          const out: Record<string, unknown> = {
            id: f.field.trim(),
            label: f.label.trim(),
            required: f.required,
          };
          if (f.type !== "text") out.type = f.type;
          if (f.type === "select" && f.options?.length) {
            out.options = f.options.filter((o) => o.value.trim());
          }
          if (f.validation) {
            const v: Record<string, number> = {};
            if (f.validation.min !== undefined) v.min = f.validation.min;
            if (f.validation.max !== undefined) v.max = f.validation.max;
            if (f.validation.maxLength !== undefined) v.maxLength = f.validation.maxLength;
            if (Object.keys(v).length) out.validation = v;
          }
          return out;
        });

      const bodyDocs = form.documents
        .filter((d) => d.type.trim() && d.title.trim())
        .map((d) => ({
          type: d.type.trim(),
          title: d.title.trim(),
          template: d.template?.trim() || undefined,
          fields: d.fields.filter((fid) => fields.some((f) => f.id === fid)),
        }));

      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        icon: form.icon || "📋",
        industries: form.industries.split(",").map((s) => s.trim()).filter(Boolean),
        regulation_ids: form.regulations.split(",").map((s) => s.trim()).filter(Boolean),
        triggers: form.triggers.split(",").map((s) => s.trim()).filter(Boolean),
        documents: bodyDocs,
        fields,
        checks: form.checks
          .filter((c) => c.field?.trim())
          .map((c) => ({
            id: c.id?.trim() || c.field.trim(),
            field: c.field.trim(),
            type: c.type,
            description: c.description.trim(),
            clause: c.clause?.trim() || undefined,
            constraint: c.constraint?.trim() || undefined,
            rounding: c.rounding,
            depends_on: c.depends_on?.split(",").map((s) => s.trim()).filter(Boolean) || undefined,
            sample: c.sample?.trim() || undefined,
          })),
        redlines: form.redlines.split("\n").map((s) => s.trim().replace(/^-❌\s*/, "")).filter(Boolean),
        lessons: form.lessons.split("\n").map((s) => s.trim().replace(/^-\s*/, "")).filter(Boolean),
        checkPreview: form.checkPreview,
      };

      if (form.expertName.trim()) {
        body.expert = {
          name: form.expertName.trim(),
          ...(form.expertContact.trim() ? { contact: form.expertContact.trim() } : {}),
          ...(form.expertIntro.trim() ? { intro: form.expertIntro.trim() } : {}),
        };
      }

      const url = isEdit ? `/api/compliance/packs/${packId}` : "/api/compliance/packs";
      const method = isEdit ? "PUT" : "POST";

      if (isEdit) {
        (body as Record<string, unknown>).bump = form.bump;
        (body as Record<string, unknown>).status = form.status;
      }

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save pack");
        return;
      }

      setShowSuccess(true);
      setTimeout(() => onSuccess(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pack");
    } finally {
      setSaving(false);
    }
  }, [form, packId, isEdit, onSuccess]);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 10px", fontSize: 12,
    border: "1px solid var(--color-border-input)", borderRadius: 6,
    background: "var(--color-bg-dark)", color: "var(--color-text-body)",
    outline: "none", fontFamily: "'DM Sans', sans-serif",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)",
    textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4,
  };

  return (
    <>
      {!inline && <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.3)" }} onClick={onClose} />}
      <div
        className="animate-fade-in"
        style={inline ? {
          height: "100%", display: "flex", flexDirection: "column",
          background: "var(--color-bg-card)", overflow: "hidden",
        } : {
          position: "fixed", top: 0, right: 0, bottom: 0, width: 520, zIndex: 100,
          background: "var(--color-bg-card)", borderLeft: "1px solid var(--color-border-default)",
          display: "flex", flexDirection: "column", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)",
        }}
      >
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border-default)" }}
        >
          <div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Compliance Pack</div>
            <div className="font-semibold" style={{ fontSize: 15, color: "var(--color-text-header)" }}>
              {isEdit ? "Edit Pack" : "New Pack"}
            </div>
          </div>
          {!isEdit && (
            <div
              style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                background: "linear-gradient(135deg, #CBA258, #E8D5A3)",
                color: "#1a1a2e", letterSpacing: "0.04em", textTransform: "uppercase",
              }}
            >
              🏆 Expert
            </div>
          )}
          <button
            className="flex items-center justify-center border-none rounded-md cursor-pointer"
            style={{ width: 28, height: 28, background: "var(--color-bg-dark)", color: "var(--color-text-muted)" }}
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {error && (
            <div style={{ padding: "8px 12px", background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)", borderRadius: 6, fontSize: 11, color: "var(--color-danger)", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {showSuccess ? (
            <div className="flex flex-col items-center justify-center" style={{ padding: "60px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
              <div className="font-semibold" style={{ fontSize: 16, color: "var(--color-text-header)", marginBottom: 6 }}>
                Pack Created
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                Your AI compliance twin is ready. It will appear in the marketplace and can be selected for any compliance session.
              </div>
            </div>
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* ── Pack Metadata ── */}
            <section style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 14 }}>
              <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-header)", marginBottom: 10 }}>Pack Metadata</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={labelStyle}>Title *</div>
                  <input style={inputStyle} value={form.title} onChange={(e) => updateMeta("title", e.target.value)} placeholder="e.g. EU Machinery Directive" />
                </div>
                <div>
                  <div style={labelStyle}>Description *</div>
                  <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={form.description} onChange={(e) => updateMeta("description", e.target.value)} placeholder="Description of what this pack covers" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={labelStyle}>Icon</div>
                    <input style={inputStyle} value={form.icon} onChange={(e) => updateMeta("icon", e.target.value)} placeholder="📋" />
                  </div>
                  <div>
                    <div style={labelStyle}>Industries (comma-sep)</div>
                    <input style={inputStyle} value={form.industries} onChange={(e) => updateMeta("industries", e.target.value)} placeholder="Medical Devices, Healthcare" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={labelStyle}>Regulations (comma-sep)</div>
                    <input style={inputStyle} value={form.regulations} onChange={(e) => updateMeta("regulations", e.target.value)} placeholder="MDR, MDR_Annex_II" />
                  </div>
                  <div>
                    <div style={labelStyle}>Triggers (comma-sep)</div>
                    <input style={inputStyle} value={form.triggers} onChange={(e) => updateMeta("triggers", e.target.value)} placeholder="MDR, Medical Device" />
                  </div>
                </div>
                {isEdit && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={labelStyle}>Current Version</div>
                      <input style={{ ...inputStyle, background: "var(--color-bg-card)" }} value={form.version} readOnly />
                    </div>
                    <div>
                      <div style={labelStyle}>Version Bump</div>
                      <select
                        style={inputStyle}
                        value={form.bump}
                        onChange={(e) => updateMeta("bump", e.target.value as "patch" | "minor" | "major")}
                      >
                        <option value="patch">Patch (+0.0.1)</option>
                        <option value="minor">Minor (+0.1.0)</option>
                        <option value="major">Major (+1.0.0)</option>
                      </select>
                    </div>
                  </div>
                )}
                {isEdit && (
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Status</div>
                    <select
                      style={inputStyle}
                      value={form.status}
                      onChange={(e) => updateMeta("status", e.target.value as "draft" | "published")}
                    >
                      <option value="draft">Draft — hidden from others, editable</option>
                      <option value="published">Published — visible to others</option>
                    </select>
                  </div>
                )}
              </div>
            </section>

            {/* ── Expert Contact ── */}
            <section style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 14 }}>
              <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-header)", marginBottom: 10 }}>👤 {t("expert")}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={labelStyle}>{t("name")}</div>
                  <input style={inputStyle} value={form.expertName} onChange={(e) => updateMeta("expertName", e.target.value)} placeholder="Zhang San" />
                </div>
                <div>
                  <div style={labelStyle}>{t("intro")}</div>
                  <textarea style={{ ...inputStyle, minHeight: 40, resize: "vertical" }} value={form.expertIntro} onChange={(e) => updateMeta("expertIntro", e.target.value)} placeholder="Automotive data compliance expert, 10+ years experience" />
                </div>
                <div>
                  <div style={labelStyle}>{t("contact")}</div>
                  <input style={inputStyle} value={form.expertContact} onChange={(e) => updateMeta("expertContact", e.target.value)} placeholder="Phone / WeChat / Email" />
                </div>
              </div>
            </section>

            {/* ── Fields ── */}
            <section style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-header)" }}>Fields *</h2>
                <button onClick={addField} style={{ fontSize: 9, padding: "3px 8px", background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)", border: "none", borderRadius: 4, cursor: "pointer" }}>
                  + Add Field
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {form.fields.length === 0 && (
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    No fields defined yet. Fields are the data points your pack collects (e.g. manufacturer name, mounting height).
                  </div>
                )}
                {form.fields.map((field, fi) => (
                  <div key={fi} style={{ border: "1px solid var(--color-border-input)", borderRadius: 6, padding: 8, background: "var(--color-bg-card)" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: field.type === "select" || field.type === "number" ? 4 : 0 }}>
                      <input style={{ ...inputStyle, width: 120 }} value={field.field} onChange={(e) => updateField(fi, "field", e.target.value)} placeholder="field_id" />
                      <input style={{ ...inputStyle, flex: 1 }} value={field.label} onChange={(e) => updateField(fi, "label", e.target.value)} placeholder="Field Label" />
                      <select style={{ ...inputStyle, width: 80 }} value={field.type} onChange={(e) => updateField(fi, "type", e.target.value)}>
                        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <label style={{ fontSize: 9, color: "var(--color-text-muted)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 2 }}>
                        <input type="checkbox" checked={field.required} onChange={(e) => updateField(fi, "required", e.target.checked)} />
                        req
                      </label>
                      {form.fields.length > 1 && (
                        <button onClick={() => removeField(fi)} style={{ fontSize: 9, padding: "2px 4px", background: "transparent", color: "var(--color-danger)", border: "1px solid var(--color-danger)", borderRadius: 4, cursor: "pointer" }}>
                          ×
                        </button>
                      )}
                    </div>
                    {field.type === "select" && (
                      <div style={{ marginTop: 4, paddingLeft: 4 }}>
                        {(field.options ?? []).map((opt, oi) => (
                          <div key={oi} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 2 }}>
                            <input style={{ ...inputStyle, width: 80 }} value={opt.value} onChange={(e) => updateFieldOption(fi, oi, "value", e.target.value)} placeholder="value" />
                            <input style={{ ...inputStyle, flex: 1 }} value={opt.label} onChange={(e) => updateFieldOption(fi, oi, "label", e.target.value)} placeholder="Label" />
                            <button onClick={() => removeFieldOption(fi, oi)} style={{ fontSize: 9, padding: "1px 4px", background: "transparent", color: "var(--color-danger)", border: "1px solid var(--color-danger)", borderRadius: 4, cursor: "pointer", lineHeight: 1 }}>
                              ×
                            </button>
                          </div>
                        ))}
                        <button onClick={() => addFieldOption(fi)} style={{ fontSize: 9, padding: "2px 6px", marginTop: 2, background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)", border: "none", borderRadius: 4, cursor: "pointer" }}>
                          + Option
                        </button>
                      </div>
                    )}
                    {field.type === "number" && (
                      <div style={{ display: "flex", gap: 4, marginTop: 4, paddingLeft: 4 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ ...labelStyle, marginBottom: 1, fontSize: 8 }}>Min</div>
                          <input style={{ ...inputStyle }} type="number" value={field.validation?.min ?? ""} onChange={(e) => setFieldValidation(fi, "min", e.target.value)} placeholder="-" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ ...labelStyle, marginBottom: 1, fontSize: 8 }}>Max</div>
                          <input style={{ ...inputStyle }} type="number" value={field.validation?.max ?? ""} onChange={(e) => setFieldValidation(fi, "max", e.target.value)} placeholder="-" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ── Documents ── */}
            <section style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-header)" }}>Documents *</h2>
                <button onClick={addDoc} style={{ fontSize: 9, padding: "3px 8px", background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)", border: "none", borderRadius: 4, cursor: "pointer" }}>
                  + Add Document
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {form.documents.map((doc, di) => (
                  <div key={di} style={{ border: "1px solid var(--color-border-input)", borderRadius: 6, padding: 10, background: "var(--color-bg-card)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-muted)" }}>Document {di + 1}</span>
                      <button onClick={() => removeDoc(di)} style={{ fontSize: 9, padding: "2px 6px", background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger)", borderRadius: 4, cursor: "pointer" }}>
                        Remove
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Type *</div>
                        <input style={inputStyle} value={doc.type} onChange={(e) => updateDocMeta(di, "type", e.target.value)} placeholder="declaration-of-conformity" />
                      </div>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Title *</div>
                        <input style={inputStyle} value={doc.title} onChange={(e) => updateDocMeta(di, "title", e.target.value)} placeholder="EU Declaration of Conformity" />
                      </div>
                    </div>
                    {/* Template upload row */}
                    <div style={{ marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Template path (optional)</div>
                        <input style={inputStyle} value={doc.template ?? ""} onChange={(e) => updateDocMeta(di, "template", e.target.value)} placeholder="templates/declaration.docx" />
                      </div>
                      <div style={{ alignSelf: "flex-end", marginBottom: 2 }}>
                        <label
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "6px 10px", fontSize: 10, border: "1px solid var(--color-border-input)", borderRadius: 6,
                            background: "var(--color-bg-card)", color: "var(--color-text-body)",
                            cursor: packId ? "pointer" : "not-allowed", opacity: packId ? 1 : 0.4,
                          }}
                          title={packId ? "Upload .docx template" : "Save the pack first to upload templates"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          {doc.template ? "Replace" : "Upload"}
                          <input
                            type="file" accept=".docx"
                            className="hidden"
                            disabled={!packId}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !packId) return;
                              // upload via API
                              const formData = new FormData();
                              formData.append("file", file);
                              try {
                                const res = await fetch(`/api/compliance/packs/${packId}/templates/${doc.type}`, {
                                  method: "POST",
                                  body: formData,
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  updateDocMeta(di, "template", data.path);
                                }
                              } catch {}
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    {/* Field ID selectors */}
                    <div>
                      <div style={{ ...labelStyle, marginBottom: 4 }}>Fields</div>
                      {form.fields.length === 0 ? (
                        <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                          Define fields above first, then assign them to this document.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {form.fields.map((f) => {
                            const selected = doc.fields.includes(f.field);
                            return (
                              <div
                                key={f.field}
                                onClick={() => toggleDocField(di, f.field)}
                                style={{
                                  padding: "3px 8px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                                  background: selected ? "var(--color-accent-blue)" : "var(--color-bg-dark)",
                                  color: selected ? "var(--color-primary-foreground)" : "var(--color-text-body)",
                                  border: `1px solid ${selected ? "var(--color-accent-blue)" : "var(--color-border-input)"}`,
                                  transition: "all .15s",
                                }}
                              >
                                {f.field}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Checks ── */}
            <section style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-header)" }}>Checks</h2>
                <button onClick={addCheck} style={{ fontSize: 9, padding: "3px 8px", background: "var(--color-accent-blue)", color: "var(--color-primary-foreground)", border: "none", borderRadius: 4, cursor: "pointer" }}>
                  + Add Check
                </button>
              </div>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 9, color: "var(--color-text-muted)" }}>Preview:</span>
                <div
                  onClick={() => setForm((f) => ({ ...f, checkPreview: f.checkPreview === "compact" ? "full" : "compact" }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                    padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 500,
                    background: form.checkPreview === "compact" ? "var(--color-accent-blue)" : "var(--color-bg-card)",
                    color: form.checkPreview === "compact" ? "var(--color-primary-foreground)" : "var(--color-text-body)",
                    border: "1px solid", borderColor: form.checkPreview === "compact" ? "var(--color-accent-blue)" : "var(--color-border-input)",
                    transition: "all .15s",
                  }}
                >
                  Compact
                </div>
                <div
                  onClick={() => setForm((f) => ({ ...f, checkPreview: f.checkPreview === "full" ? "compact" : "full" }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                    padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 500,
                    background: form.checkPreview === "full" ? "var(--color-accent-blue)" : "var(--color-bg-card)",
                    color: form.checkPreview === "full" ? "var(--color-primary-foreground)" : "var(--color-text-body)",
                    border: "1px solid", borderColor: form.checkPreview === "full" ? "var(--color-accent-blue)" : "var(--color-border-input)",
                    transition: "all .15s",
                  }}
                >
                  Full
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {form.checks.length === 0 && (
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    No checks defined yet. You can add them later via chat, or define them here.
                  </div>
                )}
                {form.checks.map((check, ci) => (
                  <div key={ci} style={{ border: "1px solid var(--color-border-input)", borderRadius: 6, padding: 10, background: "var(--color-bg-card)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-muted)" }}>Check {ci + 1}</span>
                      <button onClick={() => removeCheck(ci)} style={{ fontSize: 9, padding: "2px 6px", background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger)", borderRadius: 4, cursor: "pointer" }}>
                        Remove
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>ID *</div>
                        <input style={inputStyle} value={check.id} onChange={(e) => updateCheck(ci, "id", e.target.value)} placeholder="mounting_height_range" />
                      </div>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Field *</div>
                        <input style={inputStyle} value={check.field} onChange={(e) => updateCheck(ci, "field", e.target.value)} placeholder="mounting_height" />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Type</div>
                        <select style={inputStyle} value={check.type} onChange={(e) => updateCheck(ci, "type", e.target.value)}>
                          {CHECK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Rounding (optional)</div>
                        <input style={inputStyle} type="number" value={check.rounding ?? ""} onChange={(e) => updateCheck(ci, "rounding", e.target.value ? Number(e.target.value) : undefined)} placeholder="0" />
                      </div>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ ...labelStyle, marginBottom: 2 }}>Description *</div>
                      <textarea style={{ ...inputStyle, minHeight: 40, resize: "vertical" }} value={check.description} onChange={(e) => updateCheck(ci, "description", e.target.value)} placeholder="Describe what this check evaluates" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Clause (optional)</div>
                        <input style={inputStyle} value={check.clause ?? ""} onChange={(e) => updateCheck(ci, "clause", e.target.value)} placeholder="R48.6.2" />
                      </div>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Constraint (optional)</div>
                        <input style={inputStyle} value={check.constraint ?? ""} onChange={(e) => updateCheck(ci, "constraint", e.target.value)} placeholder="range(500-1200)" />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Depends on (comma-sep IDs, optional)</div>
                        <input style={inputStyle} value={check.depends_on ?? ""} onChange={(e) => updateCheck(ci, "depends_on", e.target.value)} placeholder="mounting_height_range" />
                      </div>
                    </div>
                    <div>
                      <div style={{ ...labelStyle, marginBottom: 2 }}>Sample (optional)</div>
                      <textarea style={{ ...inputStyle, minHeight: 36, resize: "vertical" }} value={check.sample ?? ""} onChange={(e) => updateCheck(ci, "sample", e.target.value)} placeholder="Example: The headlamp mounting height is 650 mm..." />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Red Lines & Lessons ── */}
            <section style={{ background: "var(--color-bg-dark)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 14 }}>
              <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-header)", marginBottom: 10 }}>Red Lines & Lessons</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={labelStyle}>Red Lines (one per line)</div>
                  <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.redlines} onChange={(e) => updateMeta("redlines", e.target.value)} placeholder="Do not accept self-declarations without SRN" />
                </div>
                <div>
                  <div style={labelStyle}>Lessons (one per line)</div>
                  <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.lessons} onChange={(e) => updateMeta("lessons", e.target.value)} placeholder="Always verify NB scope matches product class" />
                </div>
              </div>
            </section>
          </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0" style={{ padding: "12px 16px", borderTop: "1px solid var(--color-border-default)" }}>
          <button
            onClick={onClose}
            style={{ padding: "6px 14px", fontSize: 11, border: "1px solid var(--color-border-default)", borderRadius: 6, background: "transparent", cursor: "pointer", color: "var(--color-text-body)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim() || !form.description.trim()}
            style={{
              padding: "6px 14px", fontSize: 11, border: "none", borderRadius: 6,
              background: saving ? "var(--color-border-default)" : "var(--color-accent-blue)",
              color: saving ? "var(--color-text-muted)" : "var(--color-primary-foreground)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "🏆 Create Pack"}
          </button>
        </div>
      </div>
    </>
  );
}