import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { getDb } from "@/lib/agent/shared/memory/database";

const SKILLS_DIR = path.join(process.cwd(), "skills");

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
 * If confirmed, appends the lesson under SKILL.md §7 Experience Accumulation.
 * If dismissed, stores in memory only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    let written = false;
    if (parsed.confirmed) {
      const skillMdPath = path.join(SKILLS_DIR, parsed.skillId, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) {
        return NextResponse.json({ error: `SKILL.md not found for skill "${parsed.skillId}"` }, { status: 404 });
      }

      const content = fs.readFileSync(skillMdPath, "utf-8");
      if (!content.includes(`- ${parsed.lessonText}`)) {
        const sectionHeader = "## Lessons Learnt";
        if (content.includes(sectionHeader)) {
          const startIdx = content.indexOf(sectionHeader);
          const nextSection = content.indexOf("\n## ", startIdx + sectionHeader.length);
          const sectionEnd = nextSection !== -1 ? nextSection : content.length;
          const before = content.substring(0, sectionEnd);
          const after = nextSection !== -1 ? content.substring(sectionEnd) : "";
          const updated = before.trimEnd() + "\n- " + parsed.lessonText + "\n" + after;
          fs.writeFileSync(skillMdPath, updated, "utf-8");
        } else {
          const lessonBlock = `\n\n## Lessons Learnt\n\n(System-maintained area, initially empty.)\n\n- ${parsed.lessonText}\n`;
          fs.writeFileSync(skillMdPath, content.trimEnd() + lessonBlock, "utf-8");
        }
        written = true;
      }
    }

    const db = getDb();
    db.prepare(
      "INSERT OR IGNORE INTO sessions (id, skill_name, created_at) VALUES (?, ?, ?)"
    ).run(parsed.sessionId, parsed.skillId, Date.now());

    const summary = parsed.confirmed
      ? `[Evolution] Lesson saved: ${parsed.lessonText}`
      : `[Evolution] Lesson dismissed: ${parsed.lessonText}`;
    db.prepare(
      "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)"
    ).run(parsed.sessionId, summary, Date.now());

    return NextResponse.json({ success: true, written }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/agent/evolution-confirm]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
