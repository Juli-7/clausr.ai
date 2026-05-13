import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/agent/memory/database";

const VALID_PROVIDERS = ["deepseek", "openai", "anthropic"];

/**
 * GET /api/settings
 * Returns current LLM provider and model name from the DB.
 */
export async function GET() {
  try {
    const provider = getSetting("llm_provider") ?? "deepseek";
    const model = getSetting("llm_model") ?? "deepseek-v4-flash";
    const retentionDays = parseInt(getSetting("retention_days") ?? "90", 10);
    const retentionMaxSessions = parseInt(getSetting("retention_max_sessions") ?? "0", 10);
    return NextResponse.json({ provider, model, retentionDays, retentionMaxSessions }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/settings] GET failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/settings
 * Persist LLM provider and/or model name.
 */
export async function POST(request: NextRequest) {
  try {
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
    console.error("[api/settings] POST failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
