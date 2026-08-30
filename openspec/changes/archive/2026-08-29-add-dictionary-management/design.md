## Context

The project is a pnpm monorepo with `apps/api` (Fastify + Prisma), `apps/web` (React + TanStack Router + TanStack Query), and `packages/shared` (Zod schemas + TS types). Auth is Redis-backed signed-cookie sessions. The existing `requireAdmin` preHandler (from the admin-dashboard change) enforces `role = ADMIN` on protected routes. The `Series` Prisma model already has `id`, `slug`, `title`, `description`, `inLanguage`, `outLanguage`, `createdAt`, and `updatedAt` — but no `createdById`.

The web app currently has no shared layout; each route renders a full-page component independently.

## Goals / Non-Goals

**Goals:**
- Add `createdById` to `Series` with a nullable FK to `User`, with a Prisma migration
- Expose `POST /api/series`, `GET /api/series`, and `PATCH /api/series/:slug` behind the existing `requireAdmin` preHandler (writes) or public (GET)
- Add shared Zod schemas for create/update/list/full Series DTOs
- Introduce a root layout in `__root.tsx` that renders a persistent header across all pages
- Build the header's navigation menu (hamburger / dropdown) with role-aware items
- Add `/series/new` and `/series/:slug/edit` routes with auth guards

**Non-Goals:**
- Changing `inLanguage` / `outLanguage` — defaults to `"en"` on create, not exposed in this form
- Adding books to a Series in this change (books sub-resource is future work)
- Rate limiting the new write endpoints (the existing global write-rate limit covers this)
- Generating the slug from the UI — always server-side

## Decisions

### 1. Root layout for the persistent header

**Decision:** Update `apps/web/src/routes/__root.tsx` to wrap `<Outlet />` in a layout that includes a `<Header />` component. This is the idiomatic TanStack Router pattern for shared chrome.

**Alternatives considered:**
- Duplicating the header in each route — rejected: brittle and inconsistent.
- A separate layout route (e.g. `_layout.tsx`) — unnecessary complexity given there is only one layout pattern in this app.

**Consequence:** All existing pages gain the header automatically. Login page is included; this is acceptable (it will show minimal/empty menu items for unauthenticated users).

### 2. Navigation menu implementation

**Decision:** Use shadcn/ui `DropdownMenu` for the hamburger menu and for the Create/Update submenus. The "Update → Dictionary" sub-item renders a `Command` (cmdk) popover with a search input and list, backed by the `["series", "list"]` TanStack Query key.

**Alternatives considered:**
- A custom popover with `<input>` + filtered list — rejected: `Command` from shadcn/ui already handles keyboard navigation and filtering, matching the spec's "filter by typing" requirement.
- A sidebar navigation — out of scope; a hamburger dropdown is simpler and fits the stated requirement.

### 3. Slug generation

**Decision:** Server-side only. The API slugifies the `title` (lowercase, replace non-alphanumeric runs with `-`, trim leading/trailing `-`) and appends `-N` (N starting at 2) if the generated slug is taken. The slug is never updated on PATCH — it is the stable URL identifier.

**Alternatives considered:**
- Client-side preview of the slug — nice UX but out of scope for this change.
- Using a UUID as the slug — rejected: the SPEC.md schema uses a human-readable slug (`"wheel-of-time"`) throughout, and existing API contracts reference `/api/series/:slug`.

### 4. `createdById` nullability

**Decision:** `createdById String?` (nullable) with `onDelete: SetNull`. Existing Series rows (seeded data) will have `null`; new rows created via the API will always have a value.

**Alternatives considered:**
- Making it non-null with a default pointing to the seeded admin — rejected: the seed admin's ID is not known at migration time and hardcoding it would break in fresh deployments.

### 5. Series list endpoint

**Decision:** `GET /api/series` is public (no auth required), ordered by `title` ascending, paginated with `?page` and `?limit`. The Update dropdown in the nav fetches this endpoint. This aligns with SPEC.md §6 which lists `GET /api/series` as a public read.

**Alternatives considered:**
- Admin-only endpoint for the dropdown — rejected: makes the dropdown needlessly complex (requires an auth check just to populate navigation) and contradicts SPEC.md's public-read model.

### 6. Shared DTO shape

New schemas in `packages/shared/src/series.ts` (new file to keep auth.ts clean):

```ts
// createSeriesSchema — used by POST /api/series body
{ title: z.string().min(1), description: z.string().min(1) }

// updateSeriesSchema — used by PATCH /api/series/:slug body
{ title: z.string().min(1).optional(), description: z.string().min(1).optional() }
  .refine(v => v.title !== undefined || v.description !== undefined, ...)

// seriesListItemSchema — used by GET /api/series response items
{ id, slug, title, description }

// seriesDtoSchema — used by POST/PATCH responses (full record)
{ id, slug, title, description, inLanguage, outLanguage, createdAt, createdById (nullable) }
```

## Risks / Trade-offs

- **No `__root.tsx` layout currently** — wrapping Outlet there will add the header to `/login` and `/admin` too. The header's menu will correctly show no admin items for MEMBER users and no items at all for unauthenticated users, so this is safe but visible. → Acceptable.
- **GET /api/series fetched on every nav open** — the Update dropdown fires a query when the user opens the menu (with 60s stale time). For very large numbers of series this could be slow. → TanStack Query caching mitigates re-fetches; pagination is available if needed later.
- **Slug collision on busy systems** — the numeric-suffix loop runs a `findUnique` per attempt and is not atomic. Concurrent creates with the same title could briefly both attempt the same slug. → A unique index on `Series.slug` is already present; the second insert will fail with a unique-constraint error, which the API can catch and retry. Low enough probability for v1.

## Migration Plan

1. Add migration: `pnpm --filter api prisma migrate dev --name add-series-created-by`
2. The migration adds `createdById String? @default(null)` — no data backfill required; existing rows tolerate null
3. Deploy API (new endpoints + `requireAdmin` on writes) before deploying the web app (the old web has no series management UI, so no regression)
4. Deploy web app last
5. Rollback: revert migration with `prisma migrate resolve --rolled-back`; no data loss since the column is nullable
