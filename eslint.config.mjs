import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores(["packages/**"]),
]);

export default eslintConfig;
