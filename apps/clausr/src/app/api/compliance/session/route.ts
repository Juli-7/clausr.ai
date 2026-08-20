import { NextRequest, NextResponse } from "next/server";
import { getOrCreateSession, ensureComplianceSession, deleteSession as deleteEngineSession } from "@clausr/engine";
import { requireAuth, AuthError, createSession, deleteSession, listSessions } from "@clausr/platform-core";
import { buildSession } from "@/lib/compliance/session-builder";
import { cleanupSessionFiles } from "@/lib/cleanup";

const MAX_SESSIONS_PER_USER = 50;

function genId(): string {
  return "cs-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const tenantId = user.memberships[0]?.organizationId ?? "";
    const id = genId();

    // Enforce session limit: keep most recent 49 so new one makes 50
    const userSessions = listSessions(tenantId, user.id, 100);
    if (userSessions.length >= MAX_SESSIONS_PER_USER) {
      const toDelete = userSessions.slice(MAX_SESSIONS_PER_USER - 1);
      for (const s of toDelete) {
        deleteSession(s.id);
        deleteEngineSession(s.id);
        cleanupSessionFiles(s.id);
      }
    }

    createSession(id, tenantId, user.id, user.email, undefined, "compliance-v2");
    try {
      getOrCreateSession(id, "compliance-v2");
      ensureComplianceSession(id);
    } catch (err) {
      deleteSession(id);
      throw err;
    }
    const session = buildSession(id)!;
    return NextResponse.json({ sessionId: session.id, step: session.step });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}