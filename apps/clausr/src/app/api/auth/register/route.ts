import { NextRequest, NextResponse } from "next/server";
import {
  createUserByPhone,
  getUserByPhone,
  checkSmsVerifyCode,
  createSessionToken,
  getSessionCookieOptions,
  createOrganization,
  addMemberToOrganization,
} from "@clausr/platform-core";
import { logger } from "@/lib/logger";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSmsConfigured } from "@clausr/platform-core";

export async function POST(request: NextRequest) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

    if (process.env.NODE_ENV === "production" && !isSmsConfigured()) {
      return NextResponse.json({ error: "SMS service not configured. Registration unavailable." }, { status: 503 });
    }

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`register:${ip}`, 5);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const { phone, code, name } = body as { phone?: string; code?: string; name?: string };

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone and verification code are required" }, { status: 400 });
    }

    const phoneStr = phone.replace(/\s+/g, "");
    if (!/^1\d{10}$/.test(phoneStr) && !/^\+86\d{11}$/.test(phoneStr)) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const existing = getUserByPhone(phoneStr);
    if (existing) {
      return NextResponse.json({ error: "Phone number already registered" }, { status: 409 });
    }

    const checkResult = await checkSmsVerifyCode(phoneStr, code);
    if (!checkResult.success) {
      return NextResponse.json({ error: checkResult.error ?? "Invalid verification code" }, { status: 401 });
    }

    const userName = name?.trim() || phoneStr;
    const user = await createUserByPhone(phoneStr, userName);

    // Create unique Trial org for this phone user
    const trialOrgSlug = `trial-${phoneStr.replace(/\D/g, "")}`;
    const created = await createOrganization(`Trial ${phoneStr}`, trialOrgSlug);
    // Assign user as tester in their trial org
    addMemberToOrganization(user.id, created.id, "tester");

    // Get memberships for session
    const { getUserById } = await import("@clausr/platform-core");
    const authenticatedUser = getUserById(user.id);

    const token = await createSessionToken(authenticatedUser as any);
    const cookieOpts = getSessionCookieOptions();

    const response = NextResponse.json({
      message: "Registration successful",
      user: { id: user.id, name: user.name, platformRole: user.platformRole, memberships: authenticatedUser?.memberships ?? [] },
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
    logger.error("[api/auth/register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
