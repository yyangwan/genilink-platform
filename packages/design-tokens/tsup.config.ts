import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "tailwind-preset": "src/tailwind-preset.ts",
    "generate-css": "src/generate-css.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  onSuccess: "node dist/generate-css.js > dist/tokens.css",
});
