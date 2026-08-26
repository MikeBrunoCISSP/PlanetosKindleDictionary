# Tasks: dictionary-crud-menu

- [x] **Add `DELETE /api/series/:slug` endpoint**
  - In `apps/api/src/routes/series.ts`, add a `fastify.delete` handler after the PATCH handler.
  - Use `requireAdmin` preHandler.
  - Call `prisma.series.delete({ where: { slug } })` and return 204.
  - Catch P2025 Prisma error and throw `Errors.NOT_FOUND()`.

- [x] **Add DELETE test suite**
  - In `apps/api/tests/series.test.ts`, add a `describe("DELETE /api/series/:slug")` block.
  - Include 4 tests: 204 (admin, existing slug), 404 (admin, unknown slug), 401 (unauthenticated), 403 (member).

- [x] **Add `apiDeleteSeries` to web client**
  - In `apps/web/src/lib/api.ts`, add `apiDeleteSeries(slug: string): Promise<void>` that sends `DELETE /api/series/:slug`.

- [x] **Fix route guards — redirect non-admins**
  - In `apps/web/src/routes/admin.tsx`, `apps/web/src/routes/series/new.tsx`, and `apps/web/src/routes/series/$slug/edit.tsx`:
    - Replace `return { forbidden: true as const }` / `return { forbidden: false as const }` with `throw redirect({ to: "/" })` for authenticated non-admins.
    - Remove `forbidden` from the route context type.
    - Remove the `useRouteContext()` call and the conditional 403 render branch from each component body.

- [x] **Restructure AppHeader menu to Dictionary top-level**
  - In `apps/web/src/components/AppHeader.tsx`:
    - Change `openSection` type from `"create" | "update" | "settings"` to `"dictionary" | "settings"`.
    - Add `deleteCommandOpen: boolean` and `deleteTarget: SeriesListItemDto | null` state.
    - Update the series list query `enabled` condition to `commandOpen || deleteCommandOpen`.
    - Replace the two separate accordion sections ("Create", "Update") with a single "Dictionaries" accordion.
    - Inside the Dictionaries shelf, render three admin-only items: "Create" (navigate to `/series/new`), "Update" (sets `commandOpen = true`), "Delete" (sets `deleteCommandOpen = true`).
    - Keep the "Settings" accordion as-is.

- [x] **Add Delete CommandDialog and confirmation Dialog**
  - In `AppHeader.tsx`, add:
    - A `CommandDialog` (title: "Delete Dictionary") controlled by `deleteCommandOpen`. On item select, set `deleteCommandOpen = false` and `deleteTarget = selectedSeries`.
    - A shadcn `Dialog` controlled by `deleteTarget !== null`. Body names the dictionary: "Are you sure you want to delete **[title]**? This action cannot be undone." Footer has Cancel (sets `deleteTarget = null`) and a destructive Delete button (calls `apiDeleteSeries`, invalidates `["series", "list"]` query, sets `deleteTarget = null`).

- [x] **Smoke test**
  - Verify: Admin → Dictionaries → Create → navigates to `/series/new`.
  - Verify: Admin → Dictionaries → Update → selection dialog opens, selecting a dictionary navigates to its edit page.
  - Verify: Admin → Dictionaries → Delete → selection dialog opens, selecting a dictionary opens confirmation, confirming deletes it, cancelling leaves it intact.
  - Verify: Member → Dictionaries → shelf is empty.
  - Verify: Non-admin direct navigation to `/admin`, `/series/new`, `/series/:slug/edit` redirects to `/`.
