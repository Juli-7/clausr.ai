import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "data", "pipeline-debug.log");

function ensureLogFile(): void {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  } catch {
    /* ignore */
  }
}

export function logPipeline(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(line);
  ensureLogFile();
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore */
  }
}

/**
 * Truncate a string for log display — shows first N chars.
 */
export function truncate(text: string, max = 300): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `… (${text.length - max} more chars)`;
}

// ── Shared logging (non-pipeline code) ──

const LOG_PREFIX = "[clausr]";

export function logInfo(msg: string): void {
  process.stderr.write(`${LOG_PREFIX} ${msg}\n`);
}

export function logError(tag: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? "unknown");
  process.stderr.write(`${LOG_PREFIX} ${tag}: ${detail}\n`);
}
