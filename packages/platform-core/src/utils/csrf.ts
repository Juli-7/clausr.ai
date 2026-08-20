const ALLOWED_ORIGINS = [
  "https://app.raipple.com",
  process.env.NODE_ENV === "development" ? "http://localhost" : null,
].filter(Boolean) as string[];

function isLocalDev(check: string): boolean {
  try {
    const url = new URL(check);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function validateOrigin(request: Request): { valid: boolean; reason?: string } {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (!origin && !referer) {
    return { valid: false, reason: "Missing origin or referer header" };
  }

  const check = (origin ?? referer ?? "").replace(/\/$/, "");
  const matches =
    ALLOWED_ORIGINS.some((allowed) => check.startsWith(allowed)) ||
    (process.env.NODE_ENV === "development" && isLocalDev(check));

  if (!matches) {
    return { valid: false, reason: "Invalid origin" };
  }

  return { valid: true };
}
