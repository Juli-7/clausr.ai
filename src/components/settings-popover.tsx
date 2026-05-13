"use client";

import { useEffect, useState, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PROVIDERS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
] as const;

export function SettingsPopover({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current settings on mount
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.provider) setProvider(data.provider);
        if (data.model) setModel(data.model);
        setDirty(false);
        setSaved(false);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model }),
      });
      if (res.ok) {
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [provider, model]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        title="Settings"
        className="flex items-center justify-center text-lg transition-colors cursor-pointer w-10 h-10 rounded-lg border-none"
        style={{
          color: open ? "var(--color-accent-blue)" : "var(--color-text-muted)",
          background: open ? "var(--color-accent-blue-bg)" : "transparent",
        }}
      >
        ⚙️
      </PopoverTrigger>
      <PopoverContent
        side="right"
        className="w-72"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-input)",
          color: "var(--color-text-body)",
        }}
      >
        <div className="text-sm">
          <p className="font-semibold mb-3" style={{ color: "var(--color-text-header)" }}>
            LLM Settings
          </p>

          {loading ? (
            <p style={{ color: "var(--color-text-muted)" }}>Loading...</p>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Provider */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
                  className="w-full rounded px-2.5 py-1.5 text-xs"
                  style={{
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-input)",
                    color: "var(--color-text-body)",
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setDirty(true);
                    setSaved(false);
                  }}
                  placeholder="deepseek-v4-flash"
                  className="w-full rounded px-2.5 py-1.5 text-xs"
                  style={{
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-input)",
                    color: "var(--color-text-body)",
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                  {error}
                </p>
              )}

              {/* Save */}
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="w-full rounded px-3 py-1.5 text-xs font-medium cursor-pointer border-none transition-opacity"
                style={{
                  background: dirty
                    ? "var(--color-accent-blue-bg)"
                    : "var(--color-border-default)",
                  color: dirty
                    ? "var(--color-accent-blue)"
                    : "var(--color-text-muted)",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
