import { NextResponse } from "next/server";
import { getAllSkills } from "@/lib/agent/skill/registry";
import { loadSkill } from "@/lib/agent/skill/loader";

export async function GET() {
  try {
    const ids = getAllSkills();
    const skills = ids.map((id) => loadSkill(id));
    return NextResponse.json(skills, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/skills]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
