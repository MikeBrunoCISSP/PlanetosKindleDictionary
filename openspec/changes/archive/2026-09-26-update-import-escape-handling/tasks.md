## 1. Implementation

- [x] 1.1 In `packages/shared/src/sanitize.ts`, update `plainTextToSafeHtml` per design.md Decisions 1-3: after the existing `&`/`<` escaping step, normalize `\r\n` to `\n\n` and any remaining lone `\r` to `\n`, then run the existing `\n`-to-`<br>` replacement, then replace `\t` with four `&nbsp;` entities. Update the function's doc comment to describe the new behavior. Verify `pnpm --filter @planetos/shared exec tsc --noEmit` passes.

## 2. Unit tests

- [x] 2.1 In `packages/shared/src/__tests__/sanitize.test.ts`, add test cases to the `plainTextToSafeHtml` describe block: a `\r\n` pair produces the same output as `\n\n` (two `<br>`); a lone `\r` (not followed by `\n`) produces one `<br>`; a `\t` produces four `&nbsp;` entities; a combined case (e.g. text containing `\r\n`, a lone `\r`, `\n`, and `\t` together) produces the expected combined output. Verify `pnpm --filter @planetos/shared exec vitest run` passes.

## 3. Integration tests

- [x] 3.1 In `apps/api/tests/entryImports.test.ts`, add test cases alongside the existing "converts newline characters" test: importing a definition containing `\r\n` between two lines of text results in the same stored `definitionHtml` as the existing `\n\n` test; importing a definition containing a tab character results in `definitionHtml` containing the expected `&nbsp;` spacing in place of the tab. Verify `pnpm --filter @planetos/api exec vitest run tests/entryImports.test.ts` passes.

## 4. Final verification

- [x] 4.1 `pnpm run typecheck` passes in full.
- [x] 4.2 `pnpm --filter @planetos/shared test` and `pnpm --filter @planetos/api test` both pass in full, with no regressions to any other existing suite.
- [x] 4.3 `openspec validate update-import-escape-handling --type change --strict` passes.
