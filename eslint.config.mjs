import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // Test doubles (stateful prisma fakes, adapter stubs) legitimately accept
    // loosely-typed prisma args — scoped to tests only, source stays strict
    // (remediation §4.11: no blanket rule disables).
    files: ["src/__tests__/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "packages/design-tokens/dist/**",
    "next-env.d.ts",
    // Disposable build output from start-all.sh (remediation §4.11: excluded
    // from lint rather than silencing rules).
    ".next-runtime/**",
    // Agent workspaces / caches and prototypes are not product source.
    ".claude/**",
    ".agents/**",
    "prototypes/**",
  ]),
]);

export default eslintConfig;
