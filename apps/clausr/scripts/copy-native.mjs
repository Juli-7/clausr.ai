import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(dir, "..");
const standalone = path.join(appRoot, ".next/standalone/apps/clausr");
const standaloneNodeModules = path.join(standalone, "node_modules");
const standalonePnpmStore = path.join(appRoot, ".next/standalone/node_modules/.pnpm");
const pnpmStore = path.join(appRoot, "../../node_modules/.pnpm");

async function copyFromStore(pkgName, destDir) {
  try {
    const entries = await readdir(pnpmStore, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!e.name.startsWith(pkgName.replace("/", "+").replace("@", "") + "@")) continue;
      const src = path.join(pnpmStore, e.name, "node_modules", pkgName);
      const dst = path.join(destDir, pkgName);
      if (!existsSync(dst)) {
        execSync(`cp -rL "${src}" "${dst}"`, { stdio: "ignore" });
        console.log(`copied ${pkgName}`);
      }
      return e.name;
    }
  } catch (err) {
    console.log(`skipped ${pkgName}: ${err.message}`);
  }
}

function patchPnpmStoreEntry(pkgName, storeEntryName) {
  if (!storeEntryName) return;
  try {
    const dstPkgDir = path.join(standalonePnpmStore, storeEntryName, "node_modules", pkgName);
    if (existsSync(dstPkgDir)) {
      const src = path.join(pnpmStore, storeEntryName, "node_modules", pkgName);
      execSync(`cp -rL "${src}" "${dstPkgDir}"`, { stdio: "ignore" });
      console.log(`patched ${pkgName} in pnpm store`);
    }
  } catch (err) {
    console.log(`skipped patching ${pkgName}: ${err.message}`);
  }
}

const nativePackages = [
  "better-sqlite3",
  "@napi-rs/canvas",
  "@napi-rs/canvas-linux-x64-gnu",
  "canvas",
  "pdf-parse",
  "pdfjs-dist",
  "sharp",
  "tesseract.js",
  "mammoth",
  "docx",
  "jszip",
  "gray-matter",
];

const results = await Promise.all(nativePackages.map(pkg => copyFromStore(pkg, standaloneNodeModules)));

if (existsSync(standalonePnpmStore)) {
  const patchResults = nativePackages.map((pkg, i) => patchPnpmStoreEntry(pkg, results[i]));
  await Promise.all(patchResults);
}

console.log("native modules copy complete");
