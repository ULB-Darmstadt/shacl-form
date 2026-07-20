import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

const [, tsEslintRecommended, tsRecommended] = tsPlugin.configs["flat/recommended"];

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsEslintRecommended.rules,
      ...tsRecommended.rules,
      indent: ["error", 4, { SwitchCase: 1 }],
      quotes: ["error", "single", { avoidEscape: true }],
      semi: ["error", "never"],
      "comma-dangle": ["error", "never"],
      "comma-spacing": ["error", { before: false, after: true }],
      curly: ["error", "all"],
      "brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "key-spacing": ["error", { beforeColon: false, afterColon: true }],
      "keyword-spacing": ["error", { before: true, after: true }],
      "space-before-blocks": "error",
      "space-infix-ops": "error",
      "object-curly-spacing": ["error", "always"],
      "array-bracket-spacing": ["error", "never"],
      "eol-last": ["error", "always"],
      "no-multi-spaces": "error",
      "no-trailing-spaces": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];
