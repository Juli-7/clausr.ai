import { NextRequest, NextResponse } from "next/server";
import { toggleStar } from "@/lib/agent/memory/repository";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const starred = body.starred === true;

    toggleStar(id, starred);

    return NextResponse.json({ success: true, starred }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/sessions/[id]/star]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
