import { NextRequest, NextResponse } from "next/server";
import { requireAuth, listSessions, pruneUnnamedSessions } from "@clausr/platform-core";
import { deleteSession as deleteEngineSession } from "@clausr/engine";
import { logger } from "@/lib/logger";
import { cleanupSessionFiles } from "@/lib/cleanup";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const tenantId = user.memberships[0]?.organizationId;
    const deleted = pruneUnnamedSessions();
    if (deleted.length > 0) {
      logger.info("[api/sessions] pruned unnamed sessions", { count: deleted.length });
      for (const id of deleted) {
        try { deleteEngineSession(id); } catch { /* engine session may not exist */ }
        cleanupSessionFiles(id);
      }
    }
    const sessions = listSessions(tenantId, user.id)
      .filter((s) => s.name)
      .map((s) => ({
        ...s,
        userEmail: s.userEmail || user.email,
      }));
    return NextResponse.json(sessions, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("[api/sessions]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
