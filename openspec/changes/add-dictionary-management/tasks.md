## 1. Database Schema

- [x] 1.1 Add `createdById String?` and `createdBy User? @relation(fields: [createdById], references: [id], onDelete: SetNull)` to the `Series` model in `apps/api/prisma/schema.prisma`; add the inverse `createdSeries Series[]` relation to `User`; verify `pnpm --filter api prisma validate` passes with no errors
- [x] 1.2 Run `pnpm --filter api prisma migrate dev --name add-series-created-by` and verify the migration file is created and the `Series` table gains a nullable `createdById` column pointing to `User`

## 2. Shared DTOs

- [x] 2.1 Create `packages/shared/src/series.ts` exporting `createSeriesSchema` (`title: z.string().min(1)`, `description: z.string().min(1)`), `updateSeriesSchema` (both fields optional, at-least-one refinement), `seriesListItemSchema` (`id`, `slug`, `title`, `description`), and `seriesDtoSchema` (`id`, `slug`, `title`, `description`, `inLanguage`, `outLanguage`, `createdAt`, `createdById`); export inferred TS types for each; re-export from `packages/shared/src/index.ts`; verify `pnpm --filter @planetos/shared build` succeeds

## 3. API — Series Routes

- [x] 3.1 Create `apps/api/src/routes/series.ts` with a `toSeriesDto` mapper and `toSeriesListItem` mapper; implement `GET /api/series` (public, no auth, ordered by `title` ascending, paginated via `?page` and `?limit`, default limit 50, max 200) returning an array of `seriesListItemSchema` objects; verify `pnpm --filter api typecheck` passes
- [x] 3.2 Implement `POST /api/series` in the same file behind `requireAdmin`; validate body with `createSeriesSchema`; auto-generate slug from `title` (lowercase, non-alphanumeric runs → `-`, trim edges), loop appending `-N` (N ≥ 2) on `P2002` unique-constraint violation until slug is accepted; set `createdById` from `request.session.userId`; return `201` with `seriesDtoSchema`; verify `pnpm --filter api typecheck` passes
- [x] 3.3 Implement `PATCH /api/series/:slug` in the same file behind `requireAdmin`; validate body with `updateSeriesSchema`; return `404` if slug not found; apply only defined fields (`exactOptionalPropertyTypes` safe — build explicit `data` object); return `200` with `seriesDtoSchema`; verify `pnpm --filter api typecheck` passes
- [x] 3.4 Register the series route plugin in `apps/api/src/index.ts`; verify the server starts and `GET /api/series` returns `200` with an array

## 4. API — Integration Tests

- [x] 4.1 Add `apps/api/tests/series.test.ts` with a `buildApp` helper wiring `sessionPlugin`, `errorHandlerPlugin`, `authRoutes`, `adminRoutes`, and `seriesRoutes`; add `cleanSeries` helper that deletes by slug prefix; write tests covering: `GET /api/series` returns `200` with empty array when none exist; `POST /api/series` with admin returns `201` with correct shape; `POST /api/series` without auth returns `401`; `POST /api/series` with member returns `403`; duplicate title auto-generates slug with suffix; empty title returns `400`; empty description returns `400`; `PATCH /api/series/:slug` with admin returns `200` updated; `PATCH` unknown slug returns `404`; `PATCH` non-admin returns `403`; verify `pnpm --filter api test` passes all tests

## 5. Web — API Fetch Helpers

- [x] 5.1 Add `apiGetSeriesList(page?: number): Promise<SeriesListItemDto[]>` and `apiCreateSeries(data: CreateSeriesDto): Promise<SeriesDto>` and `apiUpdateSeries(slug: string, patch: UpdateSeriesDto): Promise<SeriesDto>` to `apps/web/src/lib/api.ts` using the existing `handleResponse` pattern; verify `pnpm --filter web typecheck` passes

## 6. Web — Global Header

- [x] 6.1 Install shadcn/ui `DropdownMenu` and `Command` components via `pnpm dlx shadcn@latest add dropdown-menu command` in `apps/web`; verify both component files appear in `src/components/ui/`
- [x] 6.2 Create `apps/web/src/components/AppHeader.tsx` implementing the persistent header with a hamburger `DropdownMenu` in the upper-right; the menu conditionally renders **Create → Dictionary** and **Update → Dictionary** items only when the current user has `role = "ADMIN"` (use `useMe` hook); the **Create → Dictionary** item links to `/series/new`; verify the component renders without TypeScript errors
- [x] 6.3 Wire the Update → Dictionary sub-item: use a `Command` popover that fetches series via `useQuery({ queryKey: ["series", "list"], queryFn: apiGetSeriesList, staleTime: 60_000 })`; typing filters titles case-insensitively; selecting a series navigates to `/series/${slug}/edit` using TanStack Router `useNavigate`; verify the component compiles
- [x] 6.4 Update `apps/web/src/routes/__root.tsx` to wrap `<Outlet />` in a layout `<div>` that renders `<AppHeader />` above the page content; verify `pnpm --filter web typecheck` passes and the header appears on `/` in the browser

## 7. Web — Create Dictionary Route

- [x] 7.1 Create `apps/web/src/routes/series/new.tsx` as a TanStack Router file-based route for `/series/new`; add a `beforeLoad` guard that checks the session (redirect to `/login` if unauthenticated, render a `403 Forbidden` message if `role !== "ADMIN"`); verify route tree is regenerated (`pnpm dlx @tanstack/router-cli generate` in `apps/web`) and `pnpm --filter web typecheck` passes
- [x] 7.2 Build the create form using `react-hook-form` + zod resolver bound to `createSeriesSchema` (from `@planetos/shared`); form fields: **Name** (maps to `title`) and **Description`; on submit call `apiCreateSeries` via `useMutation`, invalidate `["series", "list"]` on success, and navigate to `/` (series index); display API error `title` inline on failure; display inline validation errors for empty fields before submission; verify in the browser that validation and submission work

## 8. Web — Edit Dictionary Route

- [x] 8.1 Create `apps/web/src/routes/series/$slug/edit.tsx` as a TanStack Router file-based route for `/series/:slug/edit`; add a `beforeLoad` guard (same admin-only pattern as 7.1); fetch the series data via TanStack Query (`queryKey: ["series", slug]`, queryFn calls `GET /api/series/:slug` — add `apiGetSeries(slug): Promise<SeriesDto>` helper to `api.ts`); if the series is not found render a not-found message; regenerate route tree and verify `pnpm --filter web typecheck` passes
- [x] 8.2 Build the edit form using `react-hook-form` + zod resolver bound to `updateSeriesSchema`; pre-populate `defaultValues` from the fetched series; on submit call `apiUpdateSeries` via `useMutation`, invalidate `["series", "list"]` and `["series", slug]` on success; display API error `title` inline on failure; verify in the browser that pre-population, validation, and submission work

## 9. Integration Verification

- [x] 9.1 Run `pnpm typecheck` across all workspaces and fix any type errors; verify the command exits `0`
- [x] 9.2 Run `pnpm --filter api test` and verify all tests pass including the new series tests from task 4.1
- [x] 9.3 End-to-end smoke test: (a) log in as admin, open the hamburger menu and verify Create → Dictionary and Update → Dictionary are visible; (b) click Create → Dictionary, fill in Name and Description, submit, and verify the new series appears in the database; (c) open the menu again, click Update → Dictionary, type part of the name in the search box, select the new series, verify the edit page pre-populates correctly; (d) change the description and save; (e) log in as a member and verify neither Create nor Update items appear in the menu; (f) navigate to `/series/new` directly as a member and confirm the `403 Forbidden` message
