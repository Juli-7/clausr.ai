import { NextResponse } from "next/server";
import { getAllSessions } from "@/lib/agent/memory/repository";

export async function GET() {
  try {
    const sessions = getAllSessions();
    return NextResponse.json(sessions, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/sessions]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
