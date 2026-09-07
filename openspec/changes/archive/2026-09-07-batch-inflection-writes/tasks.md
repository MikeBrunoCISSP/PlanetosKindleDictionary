## 1. Batch entry creation's inflection writes

- [x] 1.1 In `apps/api/src/routes/entries.ts`'s `POST /api/series/:slug/entries` handler, replace the per-inflection `tx.inflection.create` + `tx.seriesWord.create` loop with `tx.inflection.createManyAndReturn` (skipped when there are zero inflections) followed by one `tx.seriesWord.createMany` covering the headword's row and every inflection's row, per design.md Decision 1. Correlate each `SeriesWord` row with its `Inflection` row by reading `{id, value}` off each row `createManyAndReturn` returns — never by indexing into `body.inflections`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)

## 2. Batch edit-proposal approval's inflection writes

- [x] 2.1 In `apps/api/src/routes/entryEditProposals.ts`'s `applyEditProposalToEntry`, replace the per-removed-inflection `tx.inflection.delete` loop with one `tx.inflection.deleteMany({ where: { id: { in: [...] } } })` (skipped when `toRemove` is empty), and replace the per-added-inflection `tx.inflection.create` + `tx.seriesWord.create` loop with the same `createManyAndReturn` + `createMany` pattern as task 1.1, per design.md Decision 2. Keep all three statements (`deleteMany`, `createManyAndReturn`, `createMany`) inside the existing local `try {}` block so a same-batch P2002 still maps to `Errors.DUPLICATE_WORD()`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean; confirmed all three statements remain inside the pre-existing local try block.)

## 3. Batch the proposal-submission handler's nested write

- [x] 3.1 In `apps/api/src/routes/entryEditProposals.ts`'s `POST /api/entries/:id/edit-proposals` handler, change the `tx.entryEditProposal.create(...)` call's `inflections: { create: [...] } }` to `inflections: { createMany: { data: [...] } } }`, per design.md Decision 3. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)

## 4. Test verification

- [x] 4.1 Run `apps/api/tests/entries.test.ts` against real Postgres and confirm the existing multi-inflection creation test(s), the duplicate-word-conflict tests, and the concurrent-duplicate-submission race test all still pass unchanged against the batched code path. Add a case (if none already covers it) creating an entry with several (e.g. 5+) inflections and asserting the correct `Inflection` and `SeriesWord` rows exist with correct `inflectionId`/`normalizedWord` pairing. (New test with 5 inflections, verifies exact row linkage. 45/45 pass, all existing tests unchanged.)
- [x] 4.2 Run `apps/api/tests/entryEditProposals.test.ts` against real Postgres and confirm the existing approve/reject tests, the stale-entry and word-conflict refusal tests, and the concurrent-approval race tests all still pass unchanged. Add a case (if none already covers it) approving a proposal that both adds and removes several inflections in one go, asserting the final `Inflection`/`SeriesWord` state is exactly the proposed set (no leftover removed rows, no missing added rows). (New test: 3 initial inflections, proposal keeps 1, removes 2, adds 4 - verifies exact final Inflection/SeriesWord state including that removed rows are gone. 38/38 pass, all existing tests unchanged.)
- [x] 4.3 `pnpm --filter @planetos/api test` passes in full against real Postgres/Redis — no regressions to any existing suite. (363/363 pass across 34 files. One flaky failure in `passwordReset.test.ts` on the first full-suite run - a Mailpit-delivery-timing issue unrelated to this change's files - confirmed non-reproducible by re-running that file in isolation (passed) and the full suite again (passed clean).)

## 5. Final verification

- [x] 5.1 `pnpm --filter @planetos/api exec tsc --noEmit` passes with all changes in place. (Clean.)
- [x] 5.2 `openspec validate batch-inflection-writes --type change --strict` passes (with `skip_specs: true`). (Passes.)
- [x] 5.3 Read-through: confirm no remaining `for (const ... of ...)` loop calls `tx.inflection.create`/`tx.seriesWord.create`/`tx.inflection.delete` at either call site in `entries.ts` or `entryEditProposals.ts`; confirm `applyEditProposalToEntry`'s local `try {}` wraps all three replacement statements, not just the additions; confirm the proposal-submission handler's nested write uses `createMany`, not `create`. (Grep-confirmed zero matches for the per-item calls in both files; confirmed `deleteMany`/`createManyAndReturn`/`createMany` all sit inside the local `try {}` (lines 79-114); confirmed the submission handler uses `inflections: { createMany: { data: [...] } } }`.)
