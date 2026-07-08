// @ts-check
const tseslint = require("typescript-eslint");

/** Shared base ESLint flat config. Per-app configs extend this array. */
module.exports = tseslint.config(
  {
    ignores: ["dist/**", ".next/**", "build/**", "node_modules/**", "coverage/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Config files are inherently CommonJS (loaded before any ESM/bundler setup exists).
    files: ["**/*.config.js", "**/*.config.cjs", "**/*.config.mjs", "eslint.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
