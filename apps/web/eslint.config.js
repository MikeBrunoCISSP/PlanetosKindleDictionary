import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";

// Deliberately minimal: this project has no prior lint baseline, so we
// enforce only the security rules this codebase actually needs rather
// than turning on a full recommended ruleset (which would surface an
// unbounded amount of unrelated pre-existing lint debt).
export default tseslint.config({
  ignores: ["src/routeTree.gen.ts"],
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
  plugins: { react },
  rules: {
    "react/no-danger": "error",
  },
});
