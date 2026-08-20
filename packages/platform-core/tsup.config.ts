import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/auth/index.ts", "src/rbac/index.ts", "src/usage/index.ts", "src/audit/index.ts", "src/session/index.ts", "src/settings/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  outDir: "dist",
  sourcemap: true,
});
