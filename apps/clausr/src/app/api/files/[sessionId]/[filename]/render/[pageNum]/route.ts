import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "@/lib/logger";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const CACHE_DIR = path.join(os.tmpdir(), "raipple-page-cache");
const CACHE_MAX_AGE_MS = 86_400_000;
const RENDER_SCALE = 2;

async function cleanStaleCache(maxAgeMs = CACHE_MAX_AGE_MS) {
  try {
    const entries = await fs.promises.readdir(CACHE_DIR, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      const fullPath = path.join(CACHE_DIR, entry.name);
      const st = await fs.promises.stat(fullPath);
      if (now - st.mtimeMs > maxAgeMs) {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      }
    }
  } catch (err) {
    logger.warn("[render] stale cache cleanup failed", { error: (err as Error).message });
  }
}

// Run stale cleanup on first load (non-blocking)
cleanStaleCache();

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function safeJoin(base: string, ...parts: string[]): string {
  const resolved = path.join(base, ...parts);
  if (!resolved.startsWith(base + "/")) throw new Error("Invalid path");
  return resolved;
}

let canvasAvailable: boolean | null = null;

async function tryLoadCanvas(): Promise<boolean> {
  if (canvasAvailable !== null) return canvasAvailable;
  try {
    await import("@napi-rs/canvas");
    canvasAvailable = true;
  } catch (err) {
    logger.debug("[render] canvas not available, falling back to raw PDF", { error: (err as Error).message });
    canvasAvailable = false;
  }
  return canvasAvailable;
}

async function renderPage(srcPath: string, pageIndex: number): Promise<Buffer | null> {
  if (!(await tryLoadCanvas())) return null;

  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<typeof import("pdfjs-dist")>;
  }
  const pdfjsLib = await pdfjsPromise;
  const buf = new Uint8Array(await fs.promises.readFile(srcPath));
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  try {
    const page = await doc.getPage(pageIndex);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, viewport }).promise;
    return Buffer.from(await canvas.encode("png"));
  } finally {
    await doc.destroy();
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; filename: string; pageNum: string }> },
) {
  let sessionId = "", filename = "", fileBaseUrl = "";
  try {
    const p = await params;
    sessionId = p.sessionId;
    filename = p.filename;
    fileBaseUrl = `/api/files/${encodeURIComponent(sessionId)}/${encodeURIComponent(filename)}`;
    const pageNum = p.pageNum;
    const pageIndex = parseInt(pageNum, 10);
    if (isNaN(pageIndex) || pageIndex < 1) {
      return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
    }

    const srcPath = safeJoin(UPLOADS_DIR, sessionId, filename);
    if (!fs.existsSync(srcPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const cache = safeJoin(CACHE_DIR, sessionId, filename, `${pageNum}.png`);
    const srcMtime = (await fs.promises.stat(srcPath)).mtimeMs;

    if (fs.existsSync(cache)) {
      const cacheMtime = (await fs.promises.stat(cache)).mtimeMs;
      if (cacheMtime >= srcMtime) {
        const cached = await fs.promises.readFile(cache);
        return new NextResponse(new Uint8Array(cached), {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" },
        });
      }
    }

    await fs.promises.mkdir(path.dirname(cache), { recursive: true });
    const pngBuffer = await renderPage(srcPath, pageIndex);

    if (pngBuffer) {
      await fs.promises.writeFile(cache, pngBuffer);
      return new NextResponse(new Uint8Array(pngBuffer), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" },
      });
    }

    // Canvas unavailable — redirect to raw PDF using request origin to avoid mixed-content SSL errors
    const proto = _req.headers.get("x-forwarded-proto") ?? "https";
    const host = _req.headers.get("host") ?? "localhost";
    return NextResponse.redirect(new URL(fileBaseUrl, `${proto}://${host}`));
  } catch (err: any) {
    const proto2 = _req.headers.get("x-forwarded-proto") ?? "https";
    const host2 = _req.headers.get("host") ?? "localhost";
    return NextResponse.redirect(new URL(fileBaseUrl, `${proto2}://${host2}`));
  }
}
