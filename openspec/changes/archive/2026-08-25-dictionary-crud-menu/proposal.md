## Why

The current hamburger menu organizes actions by verb ("Create", "Update") with "Dictionary" as the item inside each. This structure will become unwieldy as more resource types are added and makes it hard for users to think about what they want to do to a dictionary. Restructuring the menu around the noun ("Dictionary") with the verbs as sub-actions is more intuitive and extensible. The Delete action is net-new functionality that has no backend endpoint or UI today.

Additionally, admin-gated pages currently render an inline 403 page when a non-admin navigates to them via a deep link. They should redirect non-admins to the home page instead, which is the standard behavior for authorization gates.

## What Changes

- Restructure the hamburger menu: "Dictionaries" becomes the top-level accordion, with "Create", "Update", and "Delete" as the items inside it. The "Settings" section is unchanged.
- Add `DELETE /api/series/:slug` endpoint (admin only, returns 204).
- Add a Delete Dictionary UI flow: a command-palette dialog for selecting which dictionary to delete, followed by a confirmation dialog ("Are you sure?").
- Change admin-gated route guards (`/admin`, `/series/new`, `/series/:slug/edit`) to redirect non-admins to `/` instead of rendering a 403 page.

## Capabilities

### New Capabilities

- `dictionary-management/delete-dictionary`: Delete a dictionary via the hamburger menu — selection dialog followed by confirmation.
- `navigation/route-guards`: Admin-gated routes redirect non-admins to the home page rather than rendering an error page.

### Modified Capabilities

- `navigation/app-menu`: Top-level menu sections change from "Create", "Update" to "Dictionary" (with Create/Update/Delete sub-actions) and "Settings". Shelf content requirements are updated accordingly.

## Impact

- `apps/api/src/routes/series.ts` — new DELETE handler
- `apps/api/tests/series.test.ts` — DELETE test suite
- `apps/web/src/lib/api.ts` — `apiDeleteSeries` function
- `apps/web/src/components/AppHeader.tsx` — menu restructure + delete dialogs
- `apps/web/src/routes/admin.tsx` — route guard redirect
- `apps/web/src/routes/series/new.tsx` — route guard redirect
- `apps/web/src/routes/series/$slug/edit.tsx` — route guard redirect
- No database schema changes; no new dependencies
