export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (typeof forwarded === "string") {
    const parts = forwarded.split(",");
    return (parts[0] ?? "").trim() || "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
