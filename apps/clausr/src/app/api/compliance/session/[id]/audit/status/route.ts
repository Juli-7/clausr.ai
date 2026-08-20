import { NextRequest, NextResponse } from "next/server";
import { getComplianceSession } from "@clausr/engine";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireSessionAccess(req, id, "read");

    const cs = getComplianceSession(id);
    if (!cs) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      auditRunning: cs.auditRunning,
      auditDone: cs.auditDone,
      auditResults: cs.auditResults,
      agentResponses: cs.agentResponses,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/compliance/session/[id]/audit/status]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
