import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const MAX_RENDER_WIDTH = 1200;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string; filename: string; pageNumber: string }> }
) {
  let parser: PDFParse | null = null;

  try {
    const { sessionId, filename, pageNumber } = await context.params;
    const page = Number.parseInt(pageNumber, 10);
    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
    }

    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(UPLOADS_DIR, safeSessionId, safeFilename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (path.extname(safeFilename).toLowerCase() !== ".pdf") {
      return NextResponse.json({ error: "Page rendering is only supported for PDFs" }, { status: 415 });
    }

    const desiredWidthParam = Number.parseInt(req.nextUrl.searchParams.get("width") ?? "", 10);
    const desiredWidth = Number.isInteger(desiredWidthParam)
      ? Math.min(Math.max(desiredWidthParam, 120), MAX_RENDER_WIDTH)
      : 900;

    const data = new Uint8Array(fs.readFileSync(filePath));
    parser = new PDFParse({ data });
    const screenshots = await parser.getScreenshot({
      partial: [page],
      desiredWidth,
      imageDataUrl: false,
      imageBuffer: true,
    });

    const screenshot = screenshots.pages.find((p) => p.pageNumber === page) ?? screenshots.pages[0];
    if (!screenshot?.data) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return new NextResponse(Buffer.from(screenshot.data), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        "X-Page-Width": String(screenshot.width),
        "X-Page-Height": String(screenshot.height),
        "X-Page-Scale": String(screenshot.scale),
      },
    });
  } catch (err) {
    console.error("[api/files/page]", err);
    return NextResponse.json({ error: "Failed to render PDF page" }, { status: 500 });
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}
