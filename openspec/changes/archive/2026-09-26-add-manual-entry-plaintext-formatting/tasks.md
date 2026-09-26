## 1. Implementation

- [x] 1.1 In `apps/api/src/routes/entries.ts`, add `plainTextToSafeHtml` to the existing `@planetos/shared/sanitize` import and change `sanitizeDefinitionHtml(body.definitionHtml)` to `sanitizeDefinitionHtml(plainTextToSafeHtml(body.definitionHtml))` per design.md Decision 1. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 1.2 In `apps/api/src/routes/entryEditProposals.ts`, make the identical change at its `sanitizeDefinitionHtml(body.definitionHtml)` call site per design.md Decision 3 (both the non-admin pending-revision path and the admin immediate-apply path use this same call, so one change covers both). Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.

## 2. Update existing tests

- [x] 2.1 In `apps/api/tests/entries.test.ts`, rewrite the "sanitizes disallowed markup out of the definition instead of rejecting it" test (~line 313) to reflect the new behavior: a submitted `<script>`/`<img>` payload is neutralized by escaping (no real tag ever reaches the sanitizer), so assert the stored `definitionHtml` contains no real `<script>`/`<img>` tag and that the literal text content is preserved as visible text. Run `pnpm --filter @planetos/api exec vitest run tests/entries.test.ts` and fix any other now-failing assertion that compares a stored `definitionHtml` to a literal `<p>...</p>`-style string following an API submission (not a directly-seeded fixture) until the suite passes.
- [x] 2.2 In `apps/api/tests/entryEditProposals.test.ts`, update every `expect(entry.definitionHtml).toBe("<p>...</p>")` / `expect(...proposedDefinitionHtml).toBe("<p>...</p>")` assertion that follows an actual API submission (not a value seeded directly via Prisma in test setup, which bypasses the route and is unaffected) to the new escaped expected value. Run `pnpm --filter @planetos/api exec vitest run tests/entryEditProposals.test.ts` and fix each failure until the suite passes.

## 3. New tests for plain-text formatting

- [x] 3.1 In `apps/api/tests/entries.test.ts`, add test cases mirroring `entryImports.test.ts`'s newline-handling tests: a Definition with a blank-line paragraph break (`\n\n`) is stored/rendered with two line breaks; a `\r\n` behaves the same; a lone `\r` produces one line break; a tab renders as visible spacing; a literal `<`/`&` in ordinary prose is preserved as visible text, not interpreted as markup. Verify `pnpm --filter @planetos/api exec vitest run tests/entries.test.ts` passes.
- [x] 3.2 In `apps/api/tests/entryEditProposals.test.ts`, add the same set of cases for edit submission, covering both the non-admin pending-revision path (assert on the proposal's `proposedDefinitionHtml`) and the admin immediate-apply path (assert on the entry's resulting `definitionHtml`). Verify `pnpm --filter @planetos/api exec vitest run tests/entryEditProposals.test.ts` passes.

## 4. Fix Edit form round-trip (found during browser verification)

- [x] 4.1 Create `apps/web/src/lib/definitionPlainText.ts` exporting `definitionHtmlToPlainText`, per design.md Decision 4: replace `<br>`/`<br/>`/`<br />` with `\n`, assign to a detached DOM node's `innerHTML`, read `.textContent`, then collapse a run of four non-breaking-space characters back to a tab. Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes.
- [x] 4.2 In `apps/web/src/routes/entries/$id.tsx`, compute the reversed plain text once via `useMemo` and use it in place of raw `entry.definitionHtml` for both `useForm`'s `defaultValues.definitionHtml` and `baselineRef.current.definition`. Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes.

## 5. Final verification

- [x] 5.1 `pnpm run typecheck` passes in full.
- [x] 5.2 `pnpm --filter @planetos/api test` passes in full, with no regressions to any other existing suite.
- [x] 5.3 `openspec validate add-manual-entry-plaintext-formatting --type change --strict` passes.
- [x] 5.4 Browser-verify: as an admin, submit the user's exact Atreides example text (with blank-line paragraph breaks) through the Add Entry form and confirm the paragraphs render with visible spacing on the entry-detail page; then open Edit on that entry and confirm the textarea shows plain text (no literal `<br>`/non-breaking-space markup visible); make an unrelated small edit and submit, then confirm the previously-formatted paragraphs still render correctly (no escaped markup leaked into the text).
