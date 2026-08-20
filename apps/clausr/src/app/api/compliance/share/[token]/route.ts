import { NextRequest, NextResponse } from "next/server";
import type { AgentResponse } from "@clausr/engine";
import { buildSession } from "@/lib/compliance/session-builder";
import { getPack } from "@/lib/compliance/seed";
import { resolveShareToken } from "@/app/api/compliance/session/[id]/share-link/route";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = resolveShareToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Share link not found or revoked" }, { status: 404 });
  }

  const session = buildSession(resolved.sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!session.auditDone) {
    return NextResponse.json({ error: "Audit not completed yet" }, { status: 409 });
  }

  const packs = session.selectedPackIds.map((packId) => {
    const pack = getPack(packId);
    const raw = session.agentResponses?.[packId];
    let ar: AgentResponse | null = null;
    if (raw) {
      try { ar = JSON.parse(raw); } catch { ar = null; }
    }
    return {
      packId,
      title: pack && typeof pack.title === "string" ? pack.title : (typeof pack?.title === "object" ? pack.title.en ?? packId : packId),
      verdict: ar?.verdict ?? "PENDING",
      checkResults: ar?.checkResults ?? [],
      sourceCitations: ar?.sourceCitations ?? [],
    };
  });

  const failed = packs.some((p) => p.verdict === "FAIL");
  const anyDone = packs.some((p) => p.verdict === "PASS" || p.verdict === "FAIL");

  return NextResponse.json({
    sessionId: resolved.sessionId,
    createdAt: resolved.createdAt,
    overall: failed ? "FAIL" : anyDone ? "PASS" : "PENDING",
    packs,
  });
}
