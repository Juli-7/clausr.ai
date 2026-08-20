import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, verifyCredentialsByUsername, createSessionToken, getSessionCookieOptions, seedSuperadmin } from "@clausr/platform-core";
import { logger } from "@/lib/logger";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

let seedingDone = false;
async function ensureSeeded() {
  if (seedingDone) return;
  try {
    await seedSuperadmin();
    seedingDone = true;
  } catch (err) {
    logger.warn("[auth] seedSuperadmin failed (may already exist):", err);
    seedingDone = true;
  }
}

export async function POST(request: NextRequest) {
  await ensureSeeded();
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`login:${ip}`, 10);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    let user = await verifyCredentialsByUsername(username, password);
    if (!user) {
      user = await verifyCredentials(username, password);
    }
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = await createSessionToken(user);
    const cookieOpts = getSessionCookieOptions();

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        platformRole: user.platformRole,
        memberships: user.memberships,
      },
    });

    response.cookies.set(cookieOpts.name, token, {
      httpOnly: cookieOpts.httpOnly,
      secure: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
      path: cookieOpts.path,
      maxAge: cookieOpts.maxAge,
    });

    return response;
  } catch (err) {
    logger.error("[api/auth/login]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
