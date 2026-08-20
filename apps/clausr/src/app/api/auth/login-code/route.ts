import { NextRequest, NextResponse } from "next/server";
import { checkSmsVerifyCode, getUserByPhone, createSessionToken, getSessionCookieOptions } from "@clausr/platform-core";
import { logger } from "@/lib/logger";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`login-code:${ip}`, 10);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const { phone, code } = body as { phone?: string; code?: string };

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone number and verification code are required" }, { status: 400 });
    }

    const phoneStr = phone.replace(/\s+/g, "");
    const checkResult = await checkSmsVerifyCode(phoneStr, code, "登录验证码");
    if (!checkResult.success) {
      return NextResponse.json({ error: checkResult.error ?? "Invalid verification code" }, { status: 401 });
    }

    const user = getUserByPhone(phoneStr);
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Phone number not registered" }, { status: 404 });
    }

    const authenticatedUser = { ...user, memberships: [] };
    const token = await createSessionToken(authenticatedUser as any);
    const cookieOpts = getSessionCookieOptions();

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        memberships: [],
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
    logger.error("[api/auth/login-code]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
