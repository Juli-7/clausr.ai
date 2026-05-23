import { NextRequest, NextResponse } from "next/server";
import { SetupRequestSchema } from "@/lib/agent/shared/schemas";
import { setupSession } from "@/lib/agent/loading/loading-orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Request body is required" }, { status: 400 });
    }

    const parsed = SetupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { skillName, sessionId, files, message } = parsed.data;

    const { correlationId } = await setupSession({
      skillName,
      sessionId,
      files,
      message,
    });

    return NextResponse.json({ success: true, sessionId, correlationId }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/setup]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
