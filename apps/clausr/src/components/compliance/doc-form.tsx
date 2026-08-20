"use client";

import type { PackField } from "@clausr/engine";

interface DocFormProps {
  fields: PackField[];
  data: Record<string, string> | undefined;
  onFieldChange: (field: string, value: string) => void;
}

export function DocForm({ fields, data, onFieldChange }: DocFormProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fields.map((field) => {
        const val = data?.[field.id] || "";
        const label = typeof field.label === "string" ? field.label : (field.label.en ?? field.id);

        return (
          <div key={field.id}>
            <label
              style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-header)", display: "block", marginBottom: 3 }}
            >
              {label}
              {field.required && <span style={{ color: "var(--color-danger)", marginLeft: 2 }}>*</span>}
            </label>
            {renderField(field, val, (v) => onFieldChange(field.id, v))}
          </div>
        );
      })}
    </div>
  );
}

function renderField(field: PackField, value: string, onChange: (v: string) => void) {
  const baseInput: React.CSSProperties = {
    width: "100%", padding: "7px 9px", fontSize: 11,
    border: "1px solid var(--color-border-input)",
    borderRadius: 6, background: value ? "var(--color-bg-card)" : "var(--color-bg-dark)",
    color: "var(--color-text-body)", outline: "none",
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: "border-box" as const,
  };
  const label = typeof field.label === "string" ? field.label : (field.label.en ?? field.id);

  if (field.type === "textarea") {
    return (
      <textarea
        style={{ ...baseInput, resize: "vertical", minHeight: 56, lineHeight: 1.5 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}...`}
      />
    );
  }

  if (field.type === "select" && field.options?.length) {
    return (
      <select
        style={baseInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select {label.toLowerCase()}...</option>
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {typeof opt.label === "string" ? opt.label : opt.label.en ?? opt.value}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: "var(--color-text-body)" }}>
        <input
          type="checkbox"
          checked={value === "true" || value === "yes"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          style={{ accentColor: "var(--color-accent-blue)" }}
        />
        {value === "true" || value === "yes" ? "Yes" : "No"}
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        style={baseInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}...`}
      />
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        style={baseInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Default: text
  return (
    <input
      type="text"
      style={baseInput}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${label.toLowerCase()}...`}
    />
  );
}
