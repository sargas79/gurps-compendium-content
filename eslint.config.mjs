import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** What a runtime import of the GWorld system's source is told. */
const SYSTEM_SOURCE = {
  group: ["**/system/src/**", "**/system/tools/**"],
  message: "Reach the GWorld system through game.gworld.api and its hooks, not its source. Tests may import system/src/rules.",
};

export default tseslint.config(
  {
    ignores: [
      "dist/**", "build/**", "node_modules/**", "system/**", "types/**", "extracted/**",
      // The pack and journal pipeline predates the script build and is checked by its own tools.
      "tools/**", "books/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      // Foundry documents ship no types; `any` is the honest annotation at that boundary.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // The module's own code reaches the system through the API alone.
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [SYSTEM_SOURCE] }],
    },
  },
  {
    // Tests may use the system's pure rules, and nothing else of its source.
    files: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ ...SYSTEM_SOURCE, group: ["**/system/src/system/**", "**/system/src/gworld*", "**/system/tools/**"] }],
      }],
    },
  },
  {
    files: ["vite.config.ts"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
);
