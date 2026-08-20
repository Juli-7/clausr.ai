import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

function safeJoin(base: string, ...parts: string[]): string {
  const resolved = path.join(base, ...parts);
  if (!resolved.startsWith(base + "/")) {
    throw new Error("Invalid path");
  }
  return resolved;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; filename: string }> },
) {
  const { sessionId, filename } = await params;
  const filePath = safeJoin(UPLOADS_DIR, sessionId, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const buffer = await fs.promises.readFile(filePath);
    const result = await mammoth.convertToHtml({ buffer });
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        body { font-family: system-ui, sans-serif; line-height: 1.6; padding: 24px; color: #333; max-width: 800px; margin: 0 auto; }
        p { margin: 0 0 0.75em 0; }
        h1, h2, h3, h4 { margin: 1.5em 0 0.5em; color: #111; }
        table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        td, th { border: 1px solid #ddd; padding: 8px; }
        th { background: #f5f5f5; }
        ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
      </style></head><body>${result.value}</body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `DOCX conversion failed: ${message}` }, { status: 500 });
  }
}
