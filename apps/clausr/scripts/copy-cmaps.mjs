import { cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(dir, "..");

async function findPdfjsDir(base) {
  try {
    const entries = await readdir(base, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith("pdfjs-dist@")) {
        return path.join(base, e.name, "node_modules/pdfjs-dist");
      }
    }
  } catch {}
  return null;
}

const srcPdfjs = await findPdfjsDir(path.join(appRoot, "../../node_modules/.pnpm"));
const dstPdfjs = await findPdfjsDir(path.join(appRoot, ".next/standalone/node_modules/.pnpm"));

if (srcPdfjs && dstPdfjs) {
  const srcCmaps = path.join(srcPdfjs, "cmaps");
  const dstCmaps = path.join(dstPdfjs, "cmaps");
  if (!existsSync(dstCmaps)) {
    await cp(srcCmaps, dstCmaps, { recursive: true });
    console.log("cmaps copied to standalone");
  } else {
    console.log("cmaps already exists in standalone");
  }
} else {
  console.log("cmaps copy skipped (pdfjs-dist not found)", { srcPdfjs: !!srcPdfjs, dstPdfjs: !!dstPdfjs });
}
