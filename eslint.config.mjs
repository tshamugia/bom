import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Toasts go through the app wrapper so errors and warnings stay until closed.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/toast.ts", "src/components/ui/sonner.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "sonner", message: "Import { toast } from \"@/lib/toast\" instead." }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
