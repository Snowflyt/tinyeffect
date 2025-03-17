import { defineConfig } from "typroof/config";

export default defineConfig({
  testFiles: "src/**/*.proof.ts",
  tsConfigFilePath: "tsconfig.test.json",
});
