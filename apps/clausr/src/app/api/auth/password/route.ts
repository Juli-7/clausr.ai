import { NextResponse } from "next/server";
import { requireAuth, updatePassword, AuthError, handleAuthError } from "@clausr/platform-core";
import { logger } from "@/lib/logger";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

export async function PATCH(request: Request) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const rl = checkRateLimit(`password:${ip}`, 5);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const user = await requireAuth(request);
    const body = await request.json();
    const { currentPassword, newPassword } = body as { currentPassword?: string; newPassword?: string };

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }

    await updatePassword(user.id, currentPassword, newPassword);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.message === "Current password is incorrect") {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "User not found") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    logger.error("[api/auth/password]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
