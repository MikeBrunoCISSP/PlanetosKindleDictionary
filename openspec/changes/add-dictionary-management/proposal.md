## Why

Administrators need a way to create and update dictionary (Series) records from the web app, and the app currently has no shared navigation chrome — every page is isolated with no way to reach other areas without typing a URL. This change introduces a global navigation menu and the first admin-specific management flows for Series creation and editing.

## What Changes

- Add a persistent global header with a hamburger/navigation menu in the upper-right corner, visible on all pages
- The menu exposes role-aware items: **Create → Dictionary** (admin only) and **Update → Dictionary** (admin only, with a searchable dropdown of existing dictionaries)
- New route `/series/new`: admin-only form that creates a Series (dictionary), requiring a title (displayed as "Name") and description
- New route `/series/:slug/edit`: admin-only form that updates an existing Series's title and description, pre-populated from the current record
- `POST /api/series` API endpoint: creates a new Series, auto-generates a slug from the title, records `createdById` and `createdAt`
- `PATCH /api/series/:slug` API endpoint: updates title and/or description of an existing Series; admin-only in this change
- Add `GET /api/series` API endpoint: returns a paginated list of all Series records (for the Update submenu's searchable dropdown)
- Add `createdById` (nullable FK → User) to the `Series` data model; persist creator identity alongside the existing `createdAt` timestamp

## Capabilities

### New Capabilities

- `navigation/global-nav`: Persistent header component with a hamburger/dropdown menu in the upper-right corner; menu items vary by authentication state and role; always visible across all pages
- `series/management`: Admin-only Series (dictionary) create and update flows — API endpoints, shared DTOs, and frontend routes; tracks creator identity and creation timestamp

### Modified Capabilities

<!-- none — no existing requirement changes -->

## Impact

- **Database**: `Series` gains a nullable `createdById` column; requires a new Prisma migration
- **API** (`apps/api`): new `POST /api/series`, `PATCH /api/series/:slug`, and `GET /api/series` route handlers; new `requireAdmin` preHandler applied to write routes
- **Shared** (`packages/shared`): new `createSeriesSchema`, `updateSeriesSchema`, `seriesListItemSchema`, `seriesDtoSchema` types and their inferred TS types
- **Web** (`apps/web`): new header/nav component wired into the root layout; new `/series/new` and `/series/:slug/edit` routes; `GET /api/series` fetch helper for the dropdown
- **Assumption**: slug is auto-generated from the title (kebab-case, deduplication via a numeric suffix if taken); the create form does not expose a slug field directly
- **Assumption**: `inLanguage` and `outLanguage` default to `"en"` on create; these can be edited later in a future settings change
- **Assumption**: the PATCH endpoint in this change is admin-only even though SPEC.md permits authenticated members to create series — the UI is the restricted surface here; the permission model can be relaxed in a follow-on change
