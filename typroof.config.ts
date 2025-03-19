import { defineConfig } from "typroof/config";

export default defineConfig({
  testFiles: "**/*.proof.ts",
  tsConfigFilePath: "tsconfig.test.json",
});
