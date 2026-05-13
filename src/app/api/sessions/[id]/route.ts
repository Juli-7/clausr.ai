import { NextRequest, NextResponse } from "next/server";
import {
  getConversationHistory,
  getResponsesForSession,
  deleteSession,
} from "@/lib/agent/memory/repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messages = getConversationHistory(id);
    const responses = getResponsesForSession(id);

    if (messages.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ sessionId: id, messages, responses }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/sessions/[id]]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    deleteSession(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/sessions/[id] DELETE]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
