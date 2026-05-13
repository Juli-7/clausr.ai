import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseDocxTemplate } from "@/lib/parse-docx-template";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params;

    // Validate skill exists
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) {
      return NextResponse.json({ error: `Skill "${name}" not found` }, { status: 404 });
    }

    const body = await req.json();

    // ── Case 1: Save a pre-built template JSON to disk (and optionally the .docx) ──
    // NOTE: this must come BEFORE the docxDataUrl-only parse path, because
    // confirmTemplate() sends both `template` and `docxDataUrl` in the same request.
    const templateData = body.template;
    if (templateData && templateData.name && Array.isArray(templateData.sections)) {
      const assetsDir = path.join(skillDir, "assets");
      fs.mkdirSync(assetsDir, { recursive: true });

      const templatePath = path.join(assetsDir, "template.json");
      fs.writeFileSync(templatePath, JSON.stringify(templateData, null, 2), "utf-8");

      // If the original .docx data URL was also sent, save it for later placeholders fill-in
      if (body.docxDataUrl) {
        const base64 = body.docxDataUrl.split(",")[1] ?? body.docxDataUrl;
        const docxBuffer = Buffer.from(base64, "base64");
        const docxPath = path.join(assetsDir, "template.docx");
        fs.writeFileSync(docxPath, docxBuffer);
      }

      return NextResponse.json({ success: true, path: templatePath }, { status: 200 });
    }

    // ── Case 2: Parse a .docx data URL and return the parsed template for preview ──
    if (body.docxDataUrl) {
      const parsed = await parseDocxTemplate(body.docxDataUrl);
      return NextResponse.json({ parsedTemplate: parsed, preview: true }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid request — provide either `template` (to save) or `docxDataUrl` (to parse)" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[api/skills/template]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
