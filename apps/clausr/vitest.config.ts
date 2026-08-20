import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";

const appDir = new URL(".", import.meta.url).pathname;

const envPath = appDir + ".env.test";
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && value) process.env[key] = value;
  }
} catch { /* .env.test is optional */ }

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 15000,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
    },
  },
  resolve: {
    alias: {
      "@": appDir + "src",
    },
  },
});
