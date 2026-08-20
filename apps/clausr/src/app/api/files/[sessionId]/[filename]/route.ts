import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { logger } from "@/lib/logger";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

function safeJoin(base: string, ...parts: string[]): string {
  const resolved = path.join(base, ...parts);
  if (!resolved.startsWith(base + "/")) {
    throw new Error("Invalid path");
  }
  return resolved;
}

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; filename: string }> },
) {
  const { sessionId, filename } = await params;
  const filePath = safeJoin(UPLOADS_DIR, sessionId, filename);

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (err) {
    logger.warn("[files] file not found or inaccessible", { sessionId, filename, error: (err as Error).message });
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buf = await fs.promises.readFile(filePath);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";
  const encodedFilename = encodeURIComponent(filename);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodedFilename}`,
    },
  });
}
