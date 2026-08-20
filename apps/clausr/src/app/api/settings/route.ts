import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@clausr/platform-core";
import { requireAuth, requireOrgAdmin } from "@clausr/platform-core";
import { logger } from "@/lib/logger";
import { csrfGuard } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

const VALID_PROVIDERS = ["deepseek", "openai", "anthropic"];

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const provider = getSetting("llm_provider") ?? "deepseek";
    const model = getSetting("llm_model") ?? "deepseek-v4-flash";
    const retentionDays = parseInt(getSetting("retention_days") ?? "90", 10);
    const retentionMaxSessions = parseInt(getSetting("retention_max_sessions") ?? "0", 10);
    return NextResponse.json({ provider, model, retentionDays, retentionMaxSessions }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/settings] GET failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrf = csrfGuard(request);
    if (csrf) return csrf;
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rl = checkRateLimit(`settings:${ip}`, 20);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    await requireOrgAdmin(request);
    const body = await request.json();
    const { provider, model, retentionDays, retentionMaxSessions } = body as {
      provider?: unknown;
      model?: unknown;
      retentionDays?: unknown;
      retentionMaxSessions?: unknown;
    };

    if (provider !== undefined) {
      if (typeof provider !== "string" || !VALID_PROVIDERS.includes(provider)) {
        return NextResponse.json(
          { error: `Provider must be one of: ${VALID_PROVIDERS.join(", ")}` },
          { status: 400 }
        );
      }
      setSetting("llm_provider", provider);
    }

    if (model !== undefined) {
      if (typeof model !== "string" || model.trim().length === 0) {
        return NextResponse.json(
          { error: "Model name must be a non-empty string" },
          { status: 400 }
        );
      }
      setSetting("llm_model", model.trim());
    }

    if (retentionDays !== undefined) {
      if (typeof retentionDays !== "number" || retentionDays < 0 || !Number.isInteger(retentionDays)) {
        return NextResponse.json(
          { error: "retentionDays must be a non-negative integer" },
          { status: 400 }
        );
      }
      setSetting("retention_days", String(retentionDays));
    }

    if (retentionMaxSessions !== undefined) {
      if (typeof retentionMaxSessions !== "number" || retentionMaxSessions < 0 || !Number.isInteger(retentionMaxSessions)) {
        return NextResponse.json(
          { error: "retentionMaxSessions must be a non-negative integer" },
          { status: 400 }
        );
      }
      setSetting("retention_max_sessions", String(retentionMaxSessions));
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/settings] POST failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
