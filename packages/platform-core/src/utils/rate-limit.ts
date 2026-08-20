interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();
const FIVE_MIN = 5 * 60 * 1000;
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

const cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL);
cleanupTimer.unref();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = FIVE_MIN,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return { allowed: true, remaining: maxRequests - existing.count, resetAt: existing.resetAt };
}
