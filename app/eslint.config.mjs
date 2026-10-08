import globals from "globals";

// Deliberately small: catches typos, dead code and undefined names.
// JSX identifiers are not counted as "used" by core ESLint, so under app/app/
// capitalised names (components) are exempt from no-unused-vars.
const common = {
  "no-undef": "error",
  "no-unreachable": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-const-assign": "error",
  "no-import-assign": "error",
  "no-unsafe-finally": "error",
  "no-self-assign": "error",
};

export default [
  { ignores: ["node_modules/**", ".next/**", "out/**", "lib/agents/**"] },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...common,
      "no-unused-vars": ["error", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["app/**/*.{js,jsx}"],
    rules: {
      "no-unused-vars": ["error", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^[A-Z_]" }],
    },
  },
];
