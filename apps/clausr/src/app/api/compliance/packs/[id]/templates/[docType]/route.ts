import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { requireRole, AuthError } from "@clausr/platform-core";

const PACKS_DIR = process.env.PACKS_DIR ?? path.join(process.cwd(), "packs");

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docType: string }> },
) {
  const { id, docType } = await params;
  try {
    await requireRole("superadmin", "expert")(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const packDir = path.join(PACKS_DIR, id);
  if (!fs.existsSync(packDir)) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!file.name.endsWith(".docx")) {
    return NextResponse.json({ error: "Only .docx files are allowed" }, { status: 400 });
  }

  const assetsDir = path.join(packDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const fileName = `${docType}.docx`;
  const filePath = path.join(assetsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return NextResponse.json({
    path: `assets/${fileName}`,
  });
}
