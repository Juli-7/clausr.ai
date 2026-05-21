import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

/**
 * POST: upload a .docx template for a skill.
 * Saves the file to skills/{name}/assets/template.docx.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params;
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) {
      return NextResponse.json({ error: `Skill "${name}" not found` }, { status: 404 });
    }

    const body = await req.json();

    if (!body.docxDataUrl) {
      return NextResponse.json({ error: "Provide `docxDataUrl` (base64-encoded .docx)" }, { status: 400 });
    }

    const base64 = body.docxDataUrl.split(",")[1] ?? body.docxDataUrl;
    const docxBuffer = Buffer.from(base64, "base64");

    const assetsDir = path.join(skillDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    const docxPath = path.join(assetsDir, "template.docx");
    fs.writeFileSync(docxPath, docxBuffer);

    return NextResponse.json({ success: true, path: docxPath }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/skills/template]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET: return the saved template .docx for a skill, if any.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params;
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) {
      return NextResponse.json({ error: `Skill "${name}" not found` }, { status: 404 });
    }

    const docxPath = path.join(skillDir, "assets", "template.docx");
    if (!fs.existsSync(docxPath)) {
      return NextResponse.json({ error: "No template .docx found for this skill" }, { status: 404 });
    }

    const buffer = fs.readFileSync(docxPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/skills/template GET]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
