type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLevel(): LogLevel {
  return (process.env.LOG_LEVEL as LogLevel) ?? "info";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getCurrentLevel()];
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const pid = process.pid;
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${pid}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: unknown) {
    if (!shouldLog("debug")) return;
    console.debug(formatMessage("debug", message, meta));
  },
  info(message: string, meta?: unknown) {
    if (!shouldLog("info")) return;
    console.log(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: unknown) {
    if (!shouldLog("warn")) return;
    console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, meta?: unknown) {
    if (!shouldLog("error")) return;
    console.error(formatMessage("error", message, meta));
  },
};
