import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { integrateLesson } from "@/lib/agent/evolution/integrator";
import { getDb } from "@/lib/agent/memory/database";

const RequestSchema = z.object({
  sessionId: z.string().min(1),
  skillId: z.string().min(1),
  lessonText: z.string().min(1),
  confirmed: z.boolean(),
});

/**
 * POST /api/agent/evolution-confirm
 *
 * Confirms or dismisses a proposed lesson from a compliance session.
 * If confirmed, writes the lesson to SKILL.md §7 and stores in memory.
 * If dismissed, stores in memory only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    const result = integrateLesson(parsed.skillId, parsed.lessonText, parsed.confirmed);

    // Store in memory via SQLite (as a special session message)
    const db = getDb();
    // Ensure session exists
    db.prepare(
      "INSERT OR IGNORE INTO sessions (id, skill_name, created_at) VALUES (?, ?, ?)"
    ).run(parsed.sessionId, parsed.skillId, Date.now());

    // Insert an assistant message recording the evolution
    const summary = parsed.confirmed
      ? `[Evolution] Lesson saved: ${parsed.lessonText}`
      : `[Evolution] Lesson dismissed: ${parsed.lessonText}`;
    db.prepare(
      "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)"
    ).run(parsed.sessionId, summary, Date.now());

    return NextResponse.json(
      { success: true, written: result.written },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/agent/evolution-confirm]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
