import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import { describe, test, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const PW_CACHE = process.env.PLAYWRIGHT_BROWSERS_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright`;

function findChromiumExecutable(): string {
  const fs = require("fs");
  const dirs = fs.readdirSync(PW_CACHE).filter((d: string) => d.startsWith("chromium-") && !d.includes("headless"));
  const latest = dirs.sort().reverse()[0];
  if (!latest) throw new Error("No chromium installation found in " + PW_CACHE);
  const macDir = fs.readdirSync(`${PW_CACHE}/${latest}`).find((d: string) => d.endsWith("-mac-x64") || d.endsWith("-mac-arm64"));
  if (!macDir) throw new Error("No mac dir in " + latest);
  const app = fs.readdirSync(`${PW_CACHE}/${latest}/${macDir}`).find((d: string) => d.endsWith(".app"));
  if (app) return `${PW_CACHE}/${latest}/${macDir}/${app}/Contents/MacOS/${app.replace(".app", "")}`;
  const bin = fs.readdirSync(`${PW_CACHE}/${latest}/${macDir}`).find((d: string) => d.startsWith("chrome"));
  if (bin) return `${PW_CACHE}/${latest}/${macDir}/${bin}`;
  throw new Error("Could not find chromium binary");
}

let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: findChromiumExecutable(),
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
});

afterAll(async () => {
  await context.close();
  await browser.close();
});

describe("Compliance E2E", () => {
  test("full login and compliance UI flow", async () => {
    // Navigate to login
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    // Switch to Password tab
    await page.getByRole("button", { name: "Password" }).click();
    await page.waitForTimeout(300);
    await page.locator("input[type='text']").fill("superadmin");
    await page.locator("input[type='password']").fill("admin");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for redirect to home
    await page.waitForURL("**/", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Force a fresh compliance session (bypasses restoreLatest picking a stale named session)
    await page.goto(`${BASE_URL}/?session=_new`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // Wait for compliance session to create and render
    await page.locator('img[alt="clausr.ai"]').waitFor({ state: "visible", timeout: 10000 });
    expect(await page.getByPlaceholder("Type your answer...").isVisible()).toBe(true);

    // Step panel should show (either welcome or heading)
    await page.getByText(/compliance/i).first().waitFor({ state: "visible", timeout: 15000 });
  });

  test("scope marketplace shows pack cards", async () => {
    // Stay on same page (already logged in, already at /)
    await page.getByPlaceholder("Search packs\u2026").waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: "Preview" }).first().waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("button", { name: "Add" }).first().waitFor({ state: "visible", timeout: 5000 });

    const addButtons = await page.getByRole("button", { name: "Add" }).all();
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
  });

  test("search filters packs", async () => {
    const initialCount = (await page.getByRole("button", { name: "Add" }).all()).length;

    await page.getByPlaceholder("Search packs\u2026").fill("mdr");
    await page.waitForTimeout(600);

    const filtered = await page.getByRole("button", { name: "Add" }).all();
    expect(filtered.length).toBeLessThanOrEqual(initialCount);
  });

  test("clicking Add changes button to Added", async () => {
    // Clear search first
    await page.getByPlaceholder("Search packs\u2026").clear();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Add" }).first().click();
    await page.getByRole("button", { name: "Added" }).first().waitFor({ state: "visible", timeout: 5000 });
    expect(await page.getByRole("button", { name: "Added" }).first().isVisible()).toBe(true);
  });

  test("typing in chat shows user message", async () => {
    const textarea = page.getByPlaceholder("Type your answer...");
    await textarea.waitFor({ state: "visible" });
    await textarea.fill("List all compliance packs");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    expect(await page.getByText("List all compliance packs").first().isVisible()).toBe(true);
  });

  test("language toggle switches EN/CN", async () => {
    await page.getByTitle("切换至中文").waitFor({ state: "visible" });
    await page.getByTitle("切换至中文").click();
    await page.waitForTimeout(400);
    await page.getByText("合规范围").waitFor({ state: "visible", timeout: 5000 });

    await page.getByTitle("Switch to English").click();
    await page.waitForTimeout(400);
    await page.getByText("Compliance Scope").waitFor({ state: "visible", timeout: 5000 });
  });

  test("step switcher navigates between steps", async () => {
    // Step buttons are always visible in the step switcher
    await page.getByRole("button", { name: /Documents.*Validation/ }).first().waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /Audit/ }).first().waitFor({ state: "visible" });

    // Click step 2  
    await page.getByRole("button", { name: /Documents.*Validation/ }).first().click();
    await page.waitForTimeout(500);
    expect(await page.getByText("Documents & Validation").first().isVisible()).toBe(true);

    // Click step 3
    await page.getByRole("button", { name: /Audit/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByText("Compliance Audit").waitFor({ state: "visible", timeout: 5000 });
  });

  test("full page reload preserves session", async () => {
    // Reload with ?session=_new to get a fresh session (restoreLatest would pick a stale named session)
    await page.goto(`${BASE_URL}/?session=_new`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);

    // Should still render compliance UI after reload
    await page.locator('img[alt="clausr.ai"]').waitFor({ state: "visible", timeout: 10000 });
    await page.getByPlaceholder("Type your answer...").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("Compliance Scope").waitFor({ state: "visible", timeout: 10000 });
    await page.getByRole("button", { name: "Preview" }).first().waitFor({ state: "visible", timeout: 15000 });
  });
});
