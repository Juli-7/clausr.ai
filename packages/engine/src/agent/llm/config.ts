const overrides = new Map<string, string>();

export function setConfig(key: string, value: string): void {
  overrides.set(key, value);
}

export function getConfig(key: string, fallback: string): string {
  return overrides.get(key) ?? process.env[`LLM_${key.toUpperCase()}`] ?? fallback;
}

export function clearConfig(): void {
  overrides.clear();
}

export function setLLMConfig(opts: { provider?: string; model?: string }): void {
  if (opts.provider) setConfig("provider", opts.provider);
  if (opts.model) setConfig("model", opts.model);
}

export function setRetentionConfig(opts: { retentionDays?: string; maxSessions?: string }): void {
  if (opts.retentionDays) setConfig("retention_days", opts.retentionDays);
  if (opts.maxSessions) setConfig("max_sessions", opts.maxSessions);
}
