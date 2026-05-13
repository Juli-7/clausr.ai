import { NextRequest, NextResponse } from "next/server";
import { loadSkill } from "@/lib/agent/skill/loader";
import { runScript } from "@/lib/agent/skill/script-runner";
import { ComplianceCheckSchema } from "@/lib/agent/schemas";

/**
 * POST /api/scripts/<name>
 * Executes a named script for a given skill.
 *
 * Body: { skillId: string, input: ComplianceCheckInput }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    const body = await request.json();
    const { skillId, input } = body as { skillId?: string; input?: unknown };

    if (!skillId) {
      return NextResponse.json({ error: "'skillId' is required" }, { status: 400 });
    }

    // Load the skill to validate the script exists
    const skill = loadSkill(skillId);
    const script = skill.scripts.find((s) => s.name === name);
    if (!script) {
      return NextResponse.json(
        { error: `Script "${name}" not found for skill "${skillId}"` },
        { status: 404 }
      );
    }

    // Validate the input against ComplianceCheckSchema
    const parsedInput = ComplianceCheckSchema.parse(input);

    const result = await runScript(script.path, parsedInput);

    return NextResponse.json(
      {
        script: name,
        skillId,
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/scripts/name]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
