import globals from "globals";

export default [
  {
    files: [
      "api/**/*.js",
      "src/15-quartine.js",
      "src/24-fasce-indennita.js",
      "src/25-calcoli-rotazione.js",
      "src/26-ordine-modelli.js",
      "tests/**/*.test.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-constant-condition": "error",
      "no-undef": "error",
      "no-unreachable": "error",
    },
  },
];
