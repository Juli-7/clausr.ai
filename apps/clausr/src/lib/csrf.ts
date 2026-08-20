import { NextResponse } from "next/server";
import { validateOrigin } from "@clausr/platform-core";

export function csrfGuard(request: Request): NextResponse | null {
  if (request.method === "GET" || request.method === "HEAD") return null;

  const result = validateOrigin(request);
  if (!result.valid) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  return null;
}
