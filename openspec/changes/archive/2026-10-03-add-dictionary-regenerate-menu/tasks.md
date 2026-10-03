## 1. API client

- [x] 1.1 Add `apiRebuildSeries(slug: string): Promise<{ jobId: string }>` to `apps/web/src/lib/api.ts`, sending `POST /api/series/:slug/rebuild` with `credentials: "include"` through the existing `handleResponse`, following the `apiDeleteSeries` pattern; verify with `pnpm --filter @planetos/web typecheck`

## 2. Regenerate menu action

- [x] 2.1 In `apps/web/src/components/AppHeader.tsx` (`AppMenu`), add `regenerateCommandOpen` state and include it in the series-list query's `enabled` condition (`commandOpen || deleteCommandOpen || regenerateCommandOpen`); verify the series list is only fetched while a dialog is open (Network tab)
- [x] 2.2 Add a "Regenerate" `DropdownMenuItem` (`pl-6`) after "Delete" inside the existing admin-only block of the Dictionaries shelf, opening the dialog; verify it shows for an admin and not for a member or anonymous visitor
- [x] 2.3 Add a "Regenerate dictionary" `CommandDialog` with a first group containing an "All dictionaries" item and a second group listing each dictionary (same structure as the Update/Delete dialogs); verify the dialog lists "All dictionaries" first and that search filters the list
- [x] 2.4 Add a single-dictionary mutation: close the dialog, call `apiRebuildSeries`, toast `Regenerating {title}. The new file will be ready in a few minutes.` on success, and toast the `ApiError` message on failure; verify a new job appears in Bull Board and a new SUCCESS build in `GET /api/series/:slug/builds`
- [x] 2.5 Add an all-dictionaries mutation: close the dialog, call `apiRebuildSeries` for every dictionary via `Promise.allSettled`, toast `Regenerating {n} dictionaries.` when all succeed, or a warning `{ok} queued, {failed} failed.` when any reject; verify one job per dictionary appears in Bull Board

## 3. Verification

- [x] 3.1 Run `pnpm --filter @planetos/web typecheck` and `pnpm --filter @planetos/web lint` and confirm both pass
- [x] 3.2 Run `pnpm --filter @planetos/api test downloads` and confirm the rebuild endpoint tests still pass
- [x] 3.3 Manual end-to-end check against the local stack (`pnpm dev:up`): as admin, regenerate one dictionary and confirm the Downloads page "Updated" time changes once the build finishes; run "All dictionaries" and check the summary toast; confirm Regenerate is hidden for a member and when logged out
- [x] 3.4 Run `openspec validate add-dictionary-regenerate-menu` and confirm it passes
