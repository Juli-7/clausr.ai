#!/usr/bin/env bash
set -e

OUTDIR="/Users/7ian/raipple-saas/data/screenshots"
mkdir -p "$OUTDIR"

SCRIPT=$(cat << 'JSEOF'
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const outdir = process.env.OUTDIR;

  // 1. Login page — shows Terms/Disclosure/Contact footer links
  const login = await ctx.newPage();
  await login.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await login.screenshot({ path: `${outdir}/01-login.png`, fullPage: true });
  console.log("01-login.png");

  // 2. Register page
  const reg = await ctx.newPage();
  await reg.goto("http://localhost:3000/register", { waitUntil: "networkidle" });
  await reg.screenshot({ path: `${outdir}/02-register.png`, fullPage: true });
  console.log("02-register.png");

  // 3. Disclosure page — shows AI content labeling section
  const disc = await ctx.newPage();
  await disc.goto("http://localhost:3000/disclosure", { waitUntil: "networkidle" });
  await disc.screenshot({ path: `${outdir}/03-disclosure.png`, fullPage: true });
  console.log("03-disclosure.png");

  // 4. Terms of Service page
  const terms = await ctx.newPage();
  await terms.goto("http://localhost:3000/terms", { waitUntil: "networkidle" });
  await terms.screenshot({ path: `${outdir}/04-terms.png`, fullPage: true });
  console.log("04-terms.png");

  // 5. Contact / Complaint page
  const contact = await ctx.newPage();
  await contact.goto("http://localhost:3000/contact", { waitUntil: "networkidle" });
  await contact.screenshot({ path: `${outdir}/05-contact.png`, fullPage: true });
  console.log("05-contact.png");

  await browser.close();
})();
JSEOF
)

OUTDIR="$OUTDIR" node -e "$SCRIPT"
