## 1. Shared validation

- [x] 1.1 In `packages/shared/src/entries.ts`, add a `singleWordText(opts)` helper wrapping `plainText(opts)` with a `.refine()` rejecting any whitespace character (message: "Cannot contain spaces"), per design.md Decision 1-2. Use it for `createEntrySchema`'s `headword` field and for the inflection-array element schema in both `createEntrySchema` and `submitEntryEditProposalSchema`. Verify `pnpm --filter @planetos/shared exec tsc --noEmit` passes and `pnpm --filter @planetos/shared exec vitest run` passes.
- [x] 1.2 Add test cases to `packages/shared/src/__tests__/entries.test.ts`: a Headword containing a space is rejected by `createEntrySchema`; an Inflection containing a space is rejected by both `createEntrySchema` and `submitEntryEditProposalSchema`; a hyphenated or apostrophe-containing word (no whitespace) still passes. Update the existing `valid` fixture's `headword: "Aes Sedai"` to a single-word headword so the file's other passing-case assertions keep passing. Verify the updated and new tests pass.

## 2. Frontend: Add Entry screen

- [x] 2.1 In `apps/web/src/routes/entries/new.tsx`, confirm the Headword and Inflection fields surface the new schema's validation message (via the existing `zodResolver`/`FormMessage` wiring - no new UI logic should be needed if the schema change alone produces a clear message; add a more specific inline message only if the default zod message isn't clear to a user). Verify by typing a Headword or Inflection containing a space and confirming a clear "cannot contain spaces" style message appears without a page reload.

## 3. Frontend: Edit Entry screen

- [x] 3.1 In `apps/web/src/routes/entries/$id.tsx`'s edit mode, confirm adding an Inflection containing a space is rejected with a clear message, using the same schema-driven validation path as the Add Entry screen. Verify manually in the browser.

## 4. Existing test fixtures using a multi-word word as a valid API fixture

- [x] 4.1 Update `apps/api/tests/entries.test.ts`'s multi-word fixture (`headword: "Aes Sedai"`, inflection `"Aes Sedai's"`) to single-word equivalents that preserve the test's intent (the hyphenated `"Aes-Sedai"` inflection has no whitespace and needs no change). Verify the file's tests still pass. (Scope note: this file turned out to have ~30 multi-word headword fixtures using a "X Word" naming convention, not just the one design.md called out - all renamed to single-word/concatenated equivalents, e.g. "Admin Word" -> "AdminWord".)
- [x] 4.2 Update `apps/api/tests/entryDetail.test.ts`'s equivalent `"Aes Sedai"` / `"Aes Sedai's"` fixture the same way. Verify the file's tests still pass. (Correction to design.md: this file's `createTestEntry` helper writes directly via `prisma.entry.create()`, bypassing `createEntrySchema` entirely - it was never going through the real API path. Confirmed the file passes unchanged (6/6) as-is; left untouched, since it now doubles as a fine illustration of the "reading already-existing multi-word data still works" non-goal.)
- [x] 4.3 Update `apps/api/tests/search.test.ts`'s `headword: "Aes Sedai"` fixture (the "does not match when the term only appears in the definition" test) to a single-word headword, preserving that test's actual intent. Verify the file's tests still pass. (Same correction as 4.2: this file's `createTestEntry` also writes directly via `prisma.entry.create()`, bypassing schema validation. Confirmed the file passes unchanged (16/16) as-is; left untouched.)

## 5. Final verification

- [x] 5.1 `pnpm run typecheck` and `pnpm --filter @planetos/api test` both pass in full - no regressions to any existing suite, including `packages/kindle`'s golden/xhtml tests (deliberately untouched per design.md's Non-Goals). (394/394 API tests pass; two Mailpit-timing tests flaked once under full-suite load and passed cleanly in isolation - confirmed pre-existing/environmental, unrelated to this change. 38/38 kindle package tests pass unchanged.)
- [x] 5.2 `openspec validate disallow-spaces-in-words --type change --strict` passes.
- [x] 5.3 Read-through: confirm no other `plainText`-based field (Contact form, Series title/description, `reasonForJoining`, username) was inadvertently affected by the new helper's placement in `entries.ts`. (Confirmed: `validation.ts` has zero diff, and `singleWordText` is used only for `headword` and the two `inflections` array schemas in `entries.ts`.)
