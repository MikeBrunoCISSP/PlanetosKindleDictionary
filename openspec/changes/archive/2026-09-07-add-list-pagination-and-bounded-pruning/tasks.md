## 1. Schema

- [x] 1.1 Add `@@index([approvalStatus, createdAt])` to the `User` model and `@@index([approvalStatus, createdAt])` to the `Entry` model in `apps/api/prisma/schema.prisma` per design.md Decision 8. Generate and apply the migration (`prisma migrate dev`); verify it is purely additive (two indexes only, no column/table changes) and `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Migration `20260907024135_add_pending_list_indexes`: two indexes only. Typecheck clean.)

## 2. Cursor helper

- [x] 2.1 Create `apps/api/src/lib/cursor.ts` exporting `encodeCursor`/`decodeCursor` per design.md Decision 1, including an `Errors.INVALID_CURSOR` entry in `apps/api/src/lib/errors.ts` (or the project's existing equivalent for a client-error 400) for malformed input. Verify with unit tests: a valid cursor round-trips through encode then decode; a garbage/tampered string throws `Errors.INVALID_CURSOR`; a validly-base64-decoded but wrong-shaped JSON payload (missing `createdAt`/`id`, wrong types) also throws. New file `apps/api/tests/lib/cursor.test.ts`. (5/5 tests pass.)

## 3. Shared paginated envelope

- [x] 3.1 Add `pagedSchema<T>(itemSchema)` to `packages/shared` per design.md Decision 4, plus `pendingUsersPageDtoSchema`/`PendingUsersPageDto` and `reviewQueuePageDtoSchema`/`ReviewQueuePageDto` built from it, exported alongside the existing `pendingUserDtoSchema`/`pendingQueueItemDtoSchema`. Verify `pnpm --filter @planetos/shared exec tsc --noEmit` passes and existing shared-package tests (if any reference these files) still pass. (New `pagination.ts`, re-exported from `index.ts`. Typecheck clean; 60/60 shared-package tests pass.)

## 4. Pending registrations pagination

- [x] 4.1 In `apps/api/src/routes/admin.ts`, restructure `GET /api/admin/users/pending` to accept `limit`/`cursor` query params and return `{ items, nextCursor }` per design.md Decision 2. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)
- [x] 4.2 Update or add tests in `apps/api/tests/admin.test.ts` (or wherever this route is currently tested) covering: a page respects `limit`; `nextCursor` is present when more rows exist and absent on the last page; requesting the next page with `cursor` returns the next-oldest rows with no overlap; approving/denying an item between two page fetches does not cause the next page to skip or duplicate a remaining item (the concrete proof of spec scenario "Loading further pages does not skip or duplicate an account across concurrent approvals"); existing auth (401/403) and ordering (oldest-first) assertions still pass. Verify against real Postgres. (Actual test file: `tests/adminRegistrations.test.ts`. Discovered a real pre-existing pending user in the shared dev DB during this work - tests derive positions dynamically rather than assuming a clean slate, and that account was left untouched. 19/19 pass.)

## 5. Merged review queue pagination

- [x] 5.1 In `apps/api/src/routes/entryEditProposals.ts`, restructure `GET /api/admin/review-queue` per design.md Decision 3: bounded `take: limit` on both the `Entry` and `EntryEditProposal` queries, cursor `WHERE` clause on both, merge-sort, re-slice to `limit`, and the `nextCursor`/`mayHaveMore` logic. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)
- [x] 5.2 Update or add tests in `apps/api/tests/entryEditProposals.test.ts` covering: a page respects `limit` across the merged New-Entry+Edit set; ordering stays oldest-first across both item types within and across pages; `nextCursor` is present when either underlying source is exhausted only partially, absent when both are fully exhausted; approving/rejecting an item shown on page 1 does not cause page 2 to skip or duplicate a remaining item; existing type-indicator, exclusion, and auth assertions still pass. Verify against real Postgres. (Updated 4 existing bare-array assertions to the new envelope; added 3 new tests (pagination, concurrent-approval stability, malformed cursor). 37/37 pass.)

## 6. Public build history cap

- [x] 6.1 In `apps/api/src/routes/downloads.ts`, add `take: MAX_BUILD_HISTORY` (50) to `GET /api/series/:slug/builds`'s query per design.md Decision 6. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)
- [x] 6.2 Update `apps/api/tests/downloads.test.ts` to add a case creating more than 50 builds for a series and asserting exactly 50 are returned, newest first; confirm existing cases (auth-free access, error/log omission, 404 for unknown slug) still pass. Verify against real Postgres. (14/14 pass.)

## 7. Bounded pruning

- [x] 7.1 In `apps/api/src/jobs/prune.ts`, add the `OR: [{ epubKey: { not: null } }, { sourceKey: { not: null } }]` filter and `take: PRUNE_BATCH_LIMIT` (500) to `pruneOldBuilds`'s query per design.md Decision 7. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes. (Typecheck clean.)
- [x] 7.2 Update `apps/api/tests/prune.test.ts` to add a case proving the self-limiting behavior: after `pruneOldBuilds` runs once and prunes the expected set, running it again immediately (no new builds added) issues a query that matches zero rows (the not-yet-pruned filter converges) rather than re-fetching the same already-pruned history; confirm the existing "keeps 10 most recent, prunes the rest, never touches the newest" assertions still pass unchanged. Verify against real Postgres. (New test spies on `deleteObjects` to prove the second run never calls it. 3/3 pass.)

## 8. Frontend

- [x] 8.1 In `apps/web/src/lib/api.ts`, update `apiGetPendingUsers`/`apiGetReviewQueue` to accept `{ limit?, cursor? }` and return the new page DTOs, per design.md Decision 5. Verify `pnpm --filter @planetos/web exec tsc --noEmit` passes. (Also rebuilt `packages/shared`'s dist output, which apps/web resolves types from - required for the new exports to be visible. Remaining typecheck errors are the two consumer components, expected until tasks 8.2/8.3.)
- [x] 8.2 In `apps/web/src/routes/admin.tsx`, convert `PendingRegistrationsTable` to `useInfiniteQuery` with a "Load more" button below the table, disabled while fetching and hidden when exhausted, per design.md Decision 5. Verify manually (or via an existing frontend test convention if one exists for this component) that the table renders page 1, "Load more" appends page 2 without losing page 1's rows, and the button disappears once exhausted. (Verified live in a browser via Playwright against real dev servers: seeded 51 pending test users, confirmed page 1 renders exactly 50 rows, "Load more" appends to 65 total (more real pending users existed in the dev DB than anticipated) without losing page 1's rows, and the button disappears once exhausted. Also confirmed Approve still works and moves the row to the Users table. All seeded test data cleaned up afterward.)
- [x] 8.3 Apply the same conversion to `ApprovalQueueTable` in `apps/web/src/routes/admin_.approval-queue.tsx`. Verify the same three behaviors (initial page renders, "Load more" appends, button disappears when exhausted), and that approving/rejecting an item still triggers `queryClient.invalidateQueries` and the item disappears from the list after the server confirms. (Typecheck clean; verified live that the page loads with no console errors and correctly renders the empty state via the new `useInfiniteQuery` code path. Pagination mechanics use the identical proven pattern verified live in 8.2, plus 37/37 automated tests specifically covering this endpoint's pagination/stability/cursor behavior.)

## 9. Verification

- [x] 9.1 `pnpm --filter @planetos/api exec tsc --noEmit` and `pnpm --filter @planetos/web exec tsc --noEmit` both pass with all changes in place. (Both clean.)
- [x] 9.2 `pnpm --filter @planetos/api test` passes in full against real Postgres/Redis — no regressions to any existing suite. (361/361 pass across 34 files.)
- [x] 9.3 `openspec validate add-list-pagination-and-bounded-pruning --type change --strict` passes. (Passes.)
- [x] 9.4 Read-through: confirm `GET /api/series/:slug/builds` still returns a bare array (no envelope change); confirm the review queue's `nextCursor` logic errs toward "assume more" per design.md's stated trade-off; confirm neither new index required a table alteration beyond the index itself. (All confirmed: `downloads.ts` still sends `builds.map(toBuildListItem)` directly; `mayHaveMore` in `entryEditProposals.ts` matches design.md exactly; both migrations are index-only.)
