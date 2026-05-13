import { NextRequest, NextResponse } from "next/server";
import { loadSkill } from "@/lib/agent/skill/loader";

/**
 * GET /api/scripts?skillId=<id>
 * Lists all available scripts for a given skill.
 */
export async function GET(request: NextRequest) {
  try {
    const skillId = request.nextUrl.searchParams.get("skillId");
    if (!skillId) {
      return NextResponse.json({ error: "Query parameter 'skillId' is required" }, { status: 400 });
    }

    const skill = loadSkill(skillId);
    const scripts = skill.scripts.map((s) => ({
      name: s.name,
      description: s.desc,
      path: s.path,
    }));

    return NextResponse.json({ skillId, scripts }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/scripts]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
