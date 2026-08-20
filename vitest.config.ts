import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("./apps/clausr", import.meta.url));
process.env.PACKS_DIR = appDir + "/packs";

export default defineConfig({
  test: {
    projects: [
      "apps/clausr",
      "packages/platform-core",
      {
        test: {
          name: "engine",
          globals: true,
          environment: "node",
          testTimeout: 30000,
          hookTimeout: 30000,
          include: ["packages/engine/src/**/*.test.ts"],
        },
      },
    ],
  },
});