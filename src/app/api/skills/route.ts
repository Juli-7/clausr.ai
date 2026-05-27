import { NextResponse } from "next/server";
import { listSkills, loadSkill } from "@/lib/agent/loading/skill/loader";

export async function GET() {
  try {
    const ids = listSkills();
    const skills = ids.map((id) => loadSkill(id));
    return NextResponse.json(skills, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/skills]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
