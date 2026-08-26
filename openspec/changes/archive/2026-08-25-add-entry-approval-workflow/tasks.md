## 1. Data model

- [x] 1.1 Add `enum EntryApprovalStatus { PENDING APPROVED REJECTED }` to `apps/api/prisma/schema.prisma` and add `approvalStatus EntryApprovalStatus @default(PENDING)`, `submittedById String?` + relation (`@relation("EntrySubmittedBy", ...)`, `onDelete: SetNull`), `reviewedById String?` + relation (`@relation("EntryReviewedBy", ...)`, `onDelete: SetNull`), `reviewedAt DateTime?`, `rejectionNote String?` to `Entry`.
- [x] 1.2 Add the `SeriesWord` model to `schema.prisma`: `id`, `seriesId` (+relation, `onDelete: Cascade`), `normalizedWord String`, `entryId String` (+relation, `onDelete: Cascade`), `inflectionId String?` `@unique` (+relation, `onDelete: Cascade`), `@@unique([seriesId, normalizedWord])`.
- [x] 1.3 Run `pnpm --filter api prisma migrate dev --name add_entry_approval_workflow` and verify the generated SQL includes the new enum, the new `Entry` columns/FKs, and the new `SeriesWord` table/unique index, following the naming/shape conventions in the existing migrations.
- [x] 1.4 Verify `pnpm --filter api typecheck` passes with the regenerated Prisma client.

## 2. Shared package

- [x] 2.1 Add `packages/shared/src/sanitize.ts` implementing the `definitionHtml` allowlist sanitizer from `SPEC.md` §5.4 (`p,b,i,em,strong,sup,sub,br,ul,ol,li,span`, plus `a` restricted to an internal `href="#eNNNN"` cross-reference; strip everything else). Add unit tests covering: allowed tags pass through, `script`/`img`/`style`/`div`/external links are stripped, inline `style` attributes are stripped.
- [x] 2.2 Add `packages/shared/src/entries.ts`: `createEntrySchema` (dictionary/series id, `headword` via the existing `plainText()` helper, `definitionHtml` with a length bound, `inflections: string[]`), `entryDtoSchema`, `entrySummaryDtoSchema` (lean, for the queue list), `rejectEntrySchema` (`note` optional). Follow `series.ts`'s schema-file shape exactly (`.js` import extensions, inferred `export type ...Dto`).
- [x] 2.3 Export the new modules from `packages/shared/src/index.ts` and verify `pnpm --filter shared build && pnpm --filter shared test` passes.

## 3. API: auth plugin and errors

- [x] 3.1 Add `apps/api/src/plugins/requireAuth.ts` (`makeRequireAuth(prisma)`), mirroring `requireAdmin.ts` minus the role check (401 if no session/user, 403 if `!isActive`). Sets `request.authUser` (module-augmented) so handlers can read the current user without a second query.
- [x] 3.2 Add `DUPLICATE_WORD` (409) and `ALREADY_REVIEWED` (409) to the `Errors` registry in `apps/api/src/lib/errors.ts`.

## 4. API: entry submission endpoint

- [x] 4.1 Add `apps/api/src/routes/entries.ts` with `POST /api/series/:slug/entries` (`preHandler: requireAuth`): resolve the series by slug (404 if missing), run the creation transaction from design.md (`isolationLevel: "Serializable"`) — create `Entry` (`approvalStatus: PENDING`, `submittedById`), create `SeriesWord` rows for the headword and each inflection (normalized: lowercased + trimmed), create `Inflection` rows, create a `Revision` (`action: CREATE`). Catch `P2002` on the `SeriesWord` unique constraint and throw `Errors.DUPLICATE_WORD()`.
- [x] 4.2 Run `definitionHtml` through `sanitize()` from `packages/shared/src/sanitize.ts` before persisting.
- [x] 4.3 Register `entriesRoutes` in `apps/api/src/index.ts` and in `apps/api/tests/helpers.ts`'s `buildApp()`.
- [x] 4.4 Add `apps/api/tests/entries.test.ts` covering: 201 happy path (verify `approvalStatus === "PENDING"`, `submittedById` set, a `Revision` with `action: CREATE` exists); 401 unauthenticated; 400 missing headword/definition; 400 markup in headword (via `plainText`); 409 headword duplicating an existing headword; 409 headword duplicating another entry's inflection; 409 inflection duplicating an existing headword/inflection; 409 inflection identical to the headword; same word accepted in a different series. Run `pnpm --filter api test` and verify all pass.
- [x] 4.5 Add a concurrency test: fire two concurrent `POST` requests for the same normalized headword in the same series (e.g. via `Promise.all`) and verify exactly one returns 201 and the other returns 409 with no duplicate `SeriesWord`/`Entry` left in the database. Verify it passes.

## 5. API: approval queue endpoints

- [x] 5.1 Add to `entries.ts` (or a new `apps/api/src/routes/entryApprovals.ts` registered alongside it) admin-gated (`preHandler: requireAdmin`) routes: `GET /api/admin/entries/pending` (lean list: `id`, `headword`, `createdAt`, ordered `createdAt asc`), `GET /api/admin/entries/:id` (full detail: headword, definitionHtml, inflections), `POST /api/admin/entries/:id/approve`, `POST /api/admin/entries/:id/reject` (body `{ note?: string }`).
- [x] 5.2 Approve/reject handlers: 404 if the entry doesn't exist, `Errors.ALREADY_REVIEWED()` (409) if `approvalStatus !== "PENDING"`; each runs its own transaction updating `Entry` (`approvalStatus`, `reviewedById`, `reviewedAt`, and `rejectionNote` for reject) plus a `Revision` (`action: UPDATE`).
- [x] 5.3 Register the new routes in `apps/api/src/index.ts` and `apps/api/tests/helpers.ts` if added as a separate module.
- [x] 5.4 Extend `apps/api/tests/entries.test.ts` (or a new `apps/api/tests/entryApprovals.test.ts`) covering: pending list ordering and shape; 401/403 on all four admin endpoints for unauthenticated/non-admin; details fetch returns inflections (and an empty array when there are none); approve transitions status and is idempotent-safe (second approve attempt returns 409 `ALREADY_REVIEWED`); reject with and without a note persists correctly; approved/rejected entries no longer appear in the pending list. Run `pnpm --filter api test` and verify all pass.

## 6. Web: toast library

- [x] 6.1 Add `sonner` to `apps/web/package.json` and mount `<Toaster />` in `apps/web/src/main.tsx` alongside the existing providers.

## 7. Web: API client and nav menu

- [x] 7.1 Add API functions to `apps/web/src/lib/api.ts`: `apiCreateEntry`, `apiGetPendingEntries`, `apiGetEntry`, `apiApproveEntry`, `apiRejectEntry`, following the existing `fetch` + `credentials: "include"` + `handleResponse<T>` shape.
- [x] 7.2 Update `apps/web/src/components/AppHeader.tsx`: add the "Entries" section (header visible to all authenticated users; "Add" item visible to all, navigates to `/entries/new`; "Delete" item visible only when `isAdmin`) and the "Administration" section (entire block rendered only when `isAdmin`; "Approval Queue" item navigates to `/admin/approval-queue`), matching the accordion state/toggle pattern already used for Dictionaries/Settings.

## 8. Web: Add Entry screen

- [x] 8.1 Add `apps/web/src/routes/entries/new.tsx` with a `beforeLoad` guard requiring authentication only (redirect to `/login` if no user; no admin check), following the existing route-guard shape from `admin.tsx`/`series/new.tsx` minus the role check.
- [x] 8.2 Build the form (react-hook-form + `zodResolver(createEntrySchema)`): a dictionary picker reusing the `CommandDialog`/`CommandInput`/`CommandList`/`CommandItem` pattern from `AppHeader.tsx` (searchable list over `apiGetSeriesList()`), a Headword `Input`, a Definition `Textarea`, and an Inflections chip-list editor (text input + add button; `Badge`-based removable chips list; click-to-remove).
- [x] 8.3 Client-side duplicate checks: on headword blur/submit and on each inflection add, check against the selected dictionary's existing headwords/inflections (fetch on dictionary selection) plus the inflections already added to the current unsaved entry; render the Headword field in its error state with "The word already exists in the dictionary." beneath it on duplicate; show a toast with the same message when a duplicate Inflection add is rejected.
- [x] 8.4 Wire submission to `apiCreateEntry` via `useMutation`; disable the submit control while `isSubmitting || mutation.isPending` to prevent duplicate submissions; on success show a toast worded like "Your entry has been saved. It must be approved before it can be included in the generated Kindle dictionary." and navigate away; on a 409 from the server, surface the same duplicate-word message on the Headword field even if client-side validation missed it.

## 9. Web: Approval Queue

- [x] 9.1 Add `apps/web/src/routes/admin/approval-queue.tsx` with an admin-only `beforeLoad` guard (redirect non-admins to `/`, unauthenticated to `/login`), matching `admin.tsx`'s exact pattern.
- [x] 9.2 Render the pending-entries table with `ui/table.tsx`: Headword (as a link/button opening the details modal) and Approve/Reject columns, fetched via `useQuery` against `apiGetPendingEntries` ordered oldest-first (server-ordered; no client re-sort needed).
- [x] 9.3 Add the entry-details modal (`ui/dialog.tsx`): fetches full detail via `apiGetEntry` on open, shows Headword/Definition/Inflections read-only, and explicitly states when there are no Inflections.
- [x] 9.4 Wire Approve to a `useMutation` (keyed by entry id, matching `admin.tsx`'s per-row `mutation.isPending`/`mutation.variables?.id` busy-state pattern): on success, invalidate the pending-entries query and show a success toast; on failure, leave the row in place and show an inline/toast error — no optimistic removal.
- [x] 9.5 Add the Reject dialog (`ui/dialog.tsx`): a `Textarea` for the optional note, Confirm and Cancel actions. Confirm calls `apiRejectEntry` via `useMutation` with the same success/failure handling as Approve (remove from queue only after success).

## 10. Web: Entries ▸ Delete placeholder

- [x] 10.1 Add a minimal placeholder route (e.g. `apps/web/src/routes/entries/delete.tsx`) with an admin-only `beforeLoad` guard (same shape as the Approval Queue's), rendering a simple "Coming soon" placeholder page — no delete functionality, matching the source spec's explicit instruction not to design that workflow now.

## 11. SPEC.md

- [x] 11.1 Update `SPEC.md`: §1 access table (entry creation is no longer an unconditional "Yes" — clarify Pending vs. generation-eligible), §4 schema excerpt (new enum, `Entry` fields, `SeriesWord` model), §6 endpoint list (new routes), and a short note on the approval workflow, consistent with SPEC.md's own stated policy of staying authoritative.

## 12. End-to-end verification

- [x] 12.1 Run `pnpm --recursive typecheck` and `pnpm --filter web build` and confirm both succeed.
- [x] 12.2 Ran the full app locally (real Postgres/Redis) via Playwright against a real browser. Found and fixed a real routing bug in the process: `apps/web/src/routes/admin/approval-queue.tsx` was silently rendering `admin.tsx`'s Admin Dashboard instead, because TanStack Router treats a same-named file (`admin.tsx`) + directory (`admin/`) pair as a parent/child layout relationship requiring an `<Outlet/>` that was never added. Fixed by renaming to the file-based "non-nested route" convention `admin_.approval-queue.tsx` (confirmed via the regenerated route tree: `AdminApprovalQueueRoute` is now a top-level route, no longer a child of `AdminRoute`). Also discovered and fixed a dependency leak: barrel-exporting `sanitize.ts` from `packages/shared/src/index.ts` pulled `sanitize-html` (Node-oriented, fs/path/url) into the web app's *dev* bundle via Vite's dependency pre-bundler (the production build already tree-shook it out correctly) - fixed by giving `sanitize.ts` its own package subpath export (`@planetos/shared/sanitize`) instead of barrel-exporting it, so only server code touches it; verified the dev console is clean after the fix. Full walkthrough after both fixes: registered a member, confirmed the Entries section shows only "Add" (no "Delete") and no "Administration" section at all; submitted an entry with an inflection, triggered and confirmed the exact duplicate-word toast for a repeated inflection; submitted successfully and confirmed via the API it was `PENDING`; on a second attempt confirmed the case-insensitive duplicate-headword check shows the red-outlined (`aria-invalid`) field with the exact required message; confirmed a member is redirected to `/` from both `/admin/approval-queue` and `/entries/delete`. Logged in as admin: confirmed the Approval Queue lists entries oldest-first with Headword/Approve-Reject columns; opened the details modal (headword, sanitized definition, inflections); rejected one entry with a note (verified persisted via the API) and approved another (verified `APPROVED`/`reviewedById`/`reviewedAt` via the API); both left the queue only after the server confirmed, leaving "No pending entries." Confirmed the Administration section and its Approval Queue item render for admin. Cleaned up all test entries/users afterward.
