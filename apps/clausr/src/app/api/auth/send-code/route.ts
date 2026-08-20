import { NextRequest, NextResponse } from "next/server";
import { sendSmsVerifyCode, getUserByPhone } from "@clausr/platform-core";
import { logger } from "@/lib/logger";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;

    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`send-code:${ip}`, 5);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const { phone, scene } = body as { phone?: string; scene?: string };

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const phoneStr = phone.replace(/\s+/g, "");
    if (!/^1\d{10}$/.test(phoneStr) && !/^\+86\d{11}$/.test(phoneStr) && !/^\d{5,15}$/.test(phoneStr)) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    if (scene === "登录验证码") {
      const existing = getUserByPhone(phoneStr);
      if (!existing) {
        return NextResponse.json({ error: "Phone number not registered. Please sign up first.", code: "not_registered" }, { status: 404 });
      }
    }

    const result = await sendSmsVerifyCode(phoneStr, scene);
    if (!result.success) {
      logger.error("[api/auth/send-code] SMS send failed:", result.error);
      return NextResponse.json({ error: result.error ?? "Failed to send verification code" }, { status: 500 });
    }

    return NextResponse.json({ message: "Verification code sent" });
  } catch (err) {
    logger.error("[api/auth/send-code]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
