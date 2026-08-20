import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@clausr/platform-core";
import { requireSessionAccess } from "@/lib/session-auth";
import { buildSession } from "@/lib/compliance/session-builder";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSessionAccess(req, id, "read");
    const session = buildSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    // Flatten DocFieldValue wrappers to plain strings for the UI
    const docData: Record<string, string> = {};
    for (const [field, val] of Object.entries(session.docData)) {
      docData[field] = typeof val === "object" && val !== null ? String((val as { value?: string }).value ?? "") : String(val);
    }
    // Strip dataUrl from uploaded files — file content is served on-demand via /api/files/...
    // This reduces poll response from ~685KB to ~150KB per session with large uploaded files
    const uploadedFiles = (session.uploadedFiles ?? []).map((f) => ({
      name: f.name,
      size: f.size,
      time: f.time,
      downloadUrl: `/api/files/${id}/${encodeURIComponent(f.name)}`,
    }));
    return NextResponse.json({ ...session, docData, uploadedFiles });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}