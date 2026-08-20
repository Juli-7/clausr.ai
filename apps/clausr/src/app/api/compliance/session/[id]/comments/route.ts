import { NextRequest, NextResponse } from "next/server";
import { getComplianceSession, setComplianceComments } from "@clausr/engine";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireSessionAccess(req, id, "write");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const session = getComplianceSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.comments)) {
    return NextResponse.json({ error: "comments array required" }, { status: 400 });
  }

  setComplianceComments(id, JSON.stringify(body.comments));
  return NextResponse.json({ success: true });
}
