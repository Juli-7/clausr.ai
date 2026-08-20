import { NextRequest, NextResponse } from "next/server";
import { toggleStar, AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    requireSessionAccess(req, id, "write");
    const body = await req.json().catch(() => ({}));
    const starred = body.starred === true;

    toggleStar(id, starred);

    return NextResponse.json({ success: true, starred }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/sessions/[id]/star]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
