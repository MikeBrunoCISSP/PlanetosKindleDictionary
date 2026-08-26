import tseslint from "typescript-eslint";

// Deliberately minimal: this project has no prior lint baseline, so we
// enforce only the security rule this codebase actually needs rather
// than turning on a full recommended ruleset (which would surface an
// unbounded amount of unrelated pre-existing lint debt).
export default tseslint.config({
  files: ["src/**/*.ts", "tests/**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
  },
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "MemberExpression[property.name='$queryRawUnsafe']",
        message:
          "Do not use $queryRawUnsafe - use parameterized $queryRaw tagged templates or the Prisma query builder instead.",
      },
      {
        selector: "MemberExpression[property.name='$executeRawUnsafe']",
        message:
          "Do not use $executeRawUnsafe - use parameterized $executeRaw tagged templates or the Prisma query builder instead.",
      },
    ],
  },
});
