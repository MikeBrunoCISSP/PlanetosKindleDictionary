## 1. Backend: new-entry admin auto-approval

- [x] 1.1 In `apps/api/src/routes/entries.ts`'s `POST /api/series/:slug/entries` handler, branch on `request.authUser!.role === "ADMIN"`: when true, create the entry with `approvalStatus: "APPROVED"`, `reviewedById: userId`, `reviewedAt: new Date()` (in addition to the existing `submittedById: userId`); when false, keep the existing `approvalStatus: "PENDING"` behavior unchanged. Verified via the automated test added in 5.1 (stronger than the manual check originally proposed) plus a full existing-suite regression run (178/178 passing) confirming non-admin behavior is unaffected.
- [x] 1.2 Confirm the `Revision` written in the same transaction records the correct `approvalStatus` in its snapshot for both cases (it already reads `created.approvalStatus`, so this should require no code change - verify by inspecting the persisted `Revision.snapshot`). Confirmed by code inspection - no change needed - and covered by the 5.1 test.

## 2. Backend: edit-proposal admin auto-approval

- [x] 2.1 In `apps/api/src/routes/entryEditProposals.ts`, factor the "apply a proposal's proposed Definition/Inflections to its entry, re-check word conflicts, update the entry, mark the proposal reviewed" block out of the `POST /api/admin/entry-edit-proposals/:id/approve` handler into a shared function taking `(tx, entry, proposal, reviewerId)` (or equivalent), used by both `/approve` and the new admin-submission branch. Verified: the existing `entryEditProposals.test.ts` suite (25 tests, including the manual approve path) passed unchanged after the refactor.
- [x] 2.2 In the `POST /api/entries/:id/edit-proposals` handler, after the existing `EDIT_ALREADY_PENDING` pre-check and duplicate-word pre-check, branch on `request.authUser!.role === "ADMIN"`: when true, within the same transaction, create the `EntryEditProposal` row as today and then immediately call the shared apply function from 2.1 to apply it and mark it `APPROVED` with `reviewedById`/`reviewedAt` set to the submitting admin; when false, keep the existing create-as-Pending behavior unchanged. Verified via the automated test added in 5.2.
- [x] 2.3 Confirm the existing P2002/P2034 catch block around the transaction still correctly maps a losing concurrent submission to `EDIT_ALREADY_PENDING` now that the admin branch does additional writes inside the same transaction. Verified with a new concurrency test: two administrators concurrently submit edits for the same entry with no existing Pending proposal - exactly one succeeds (201), the other gets 409, and exactly one `EntryEditProposal` row exists, `APPROVED`.
- [x] 2.4 Verify a `Revision` with action `UPDATE` is written for an admin's immediately-applied edit, with the correct snapshot (matches the same shape the manual approve path already produces). Verified in the 5.2 test - `authorId` is the admin, `snapshot.definitionHtml`/`snapshot.inflections` match the applied values.

## 3. Backend: guard against bypassing an existing Pending proposal

- [x] 3.1 Add/confirm a test: an entry already has a Pending edit proposal (submitted by anyone); an administrator attempts to submit a further edit for that same entry; the request is rejected with `EDIT_ALREADY_PENDING`, the existing Pending proposal is untouched, and no immediate change is applied to the entry. Added and passing.

## 4. Frontend: response-driven success copy

- [x] 4.1 In the Add Entry submission flow (`apps/web/src/routes/entries/new.tsx` or wherever the success toast is shown), branch the success toast text on the created entry's `approvalStatus` in the response: the existing "must be approved before..." copy when Pending, a distinct copy (e.g. "Your entry has been saved and is now live.") when Approved. Implemented; also invalidates the `["admin","review-queue"]` cache key alongside the pre-existing one. Manual verification done together with task 7.3's walkthrough.
- [x] 4.2 In the entry-edit submission flow (`apps/web/src/routes/entries/$id.tsx`), branch the success toast similarly based on whatever the edit-submission response indicates about immediate application (e.g. a `status` field on the response, or infer from a successful response shape distinguishing the two cases - confirm the exact response shape needed here and add it to the endpoint's response if it isn't already distinguishable). Implemented: the edit-proposal submission response now includes `status: "PENDING" | "APPROVED"` (both `apps/api/src/routes/entryEditProposals.ts` and `apps/web/src/lib/api.ts` updated); on success the entry's own `["entries", id]` query is invalidated so the page reflects new content without a manual refresh. Manual verification done together with task 7.3's walkthrough.

## 5. Tests

- [x] 5.1 `apps/api/tests/entries.test.ts`: add tests for `POST /api/series/:slug/entries` covering an admin submission (asserts `approvalStatus: "APPROVED"`, `reviewedById` equals the admin's id, `reviewedAt` is set) and confirm the existing non-admin Pending-path tests are unaffected. Added 2 tests; full suite passing (180/180 at the time).
- [x] 5.2 `apps/api/tests/entryEditProposals.test.ts`: add tests for `POST /api/entries/:id/edit-proposals` covering an admin submission (asserts the entry's Definition/Inflections reflect the new values immediately, the created proposal has `status: "APPROVED"` with `reviewedById`/`reviewedAt` set to the admin, and a `Revision` was written), the existing-Pending-proposal-blocks-admin-too case from task 3.1, and the concurrency case from task 2.3. Added 4 tests; full suite passing (184/184 at the time).
- [x] 5.3 Run `pnpm --filter api test` and confirm all new and existing tests pass. 184/184 passing.

## 6. Documentation

- [x] 6.1 Update `SPEC.md` §6 (the `POST /api/series/:slug/entries` and `POST /api/entries/:id/edit-proposals` entries) to note the admin auto-approval behavior.

## 7. End-to-end verification

- [x] 7.1 Run `pnpm --recursive typecheck`, `pnpm --filter api lint`, `pnpm --filter web lint`, and `pnpm --filter web build`; confirm all succeed. All four passed clean (pre-existing >500kB chunk-size build warning, unrelated to this change).
- [x] 7.2 Run `pnpm --filter api test` and `pnpm --filter shared test`; confirm all tests pass. 184/184 API tests passed, 51/51 shared tests passed.
- [x] 7.3 Manually run the full app (real Postgres, both dev servers, real browser): as an admin, submit a new entry and confirm it's immediately visible in search/detail with no Approval Queue entry ever appearing for it; as an admin, edit an already-approved entry and confirm the change is live immediately with no Approval Queue entry appearing; as a non-admin member, submit a new entry and an edit and confirm both still land in the Approval Queue as Pending exactly as before; with an existing Pending edit proposal on an entry (submitted by a member), have an admin attempt to submit a further edit to the same entry and confirm it's refused with the "already awaiting approval" message and the original Pending proposal is unaffected.

  Verified via Playwright against the real dev stack, using freshly-registered/approved test accounts and temporary entries, all cleaned up from the DB afterward:
  - Admin submitted a new entry via the Add Entry form: toast read "Your entry has been saved and is now live.", the entry was immediately searchable, and the Approval Queue stayed empty throughout.
  - Admin edited that same (already-approved) entry, adding an inflection: the change was reflected in the read-only view immediately after Submit with no manual refresh, and the Approval Queue stayed empty.
  - A freshly-registered, admin-approved member submitted a new entry: toast read the original "...must be approved before..." copy, and it appeared in the Approval Queue as "New Entry"/Pending.
  - The same member submitted an edit to the Lannister entry (adding an inflection): toast read "Your edit has been submitted for approval.", the live entry stayed unchanged ("No inflections."), and it appeared in the Approval Queue as "Edit"/Pending alongside the new entry.
  - With that edit still Pending, the admin opened the same Lannister entry, entered edit mode, and attempted to submit a different edit: refused inline with "An edit for this entry is already awaiting approval."; confirmed via direct DB read that the member's original proposal was untouched (still PENDING, original proposed text) and the live entry's inflections were still empty (no admin proposal was ever created).
