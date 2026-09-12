## Context

Confirmed by reading the actual code:

- **Search page** (`apps/web/src/routes/index.tsx`, full file): `homeSearchSchema = z.object({ q, page })` drives `validateSearch` — `q`/`page` live entirely in the URL via `Route.useSearch()`. Two render states: a minimal landing view with no query yet, and a results view (search box + `<SearchResults query={q} page={page} />`) once there is one. The filter belongs in the results view only. Both the submit handler and `SearchResults`'s pagination handler navigate via `search: (prev) => ({ ...prev, ... })`, spreading `prev` — any new search param survives both text-search submission and page navigation automatically once it's part of the URL state.
- **Search API** (`apps/api/src/routes/search.ts`, full file): `searchQuerySchema = z.object({ q, page })` is local to this file. The core query is `prisma.$queryRaw` (lines 59-76): a CTE over `SeriesWord` (ILIKE match on `normalizedWord`, backed by a GIN `gin_trgm_ops` index) joined to `Entry`/`Series`, filtered to `PUBLISHED`+`APPROVED`, ordered by rank then `sortKey`, paginated with `LIMIT/OFFSET`. No series filter exists anywhere in the `WHERE` clause today. The existing safe pattern for injecting a dynamic-length array into this raw SQL (already used for the search words) is directly reusable: `Prisma.join(items.map((w) => Prisma.sql\`${w}\`), ", ")` used inside `ARRAY[...]::text[]`. `Prisma.sql` template interpolation never splices values into SQL text — each `${...}` becomes its own bound parameter; `Prisma.join` only inserts a literal separator between placeholders. A `seriesIds` filter using the same shape is exactly as injection-safe as the existing word-array usage.
- **Shared-schema gap**: `packages/shared/src/search.ts` exports only response DTOs today. The web and API routes each define their own separate local request schema, and stay separate — they run on genuinely different runtime contracts (the router's own JSON-based search-param parsing vs. Fastify's raw HTTP query parsing). Only the one genuinely new, risky parsing rule (`seriesIds`) is shared, not the whole schemas.
- **Critical, verified backend gotcha**: Fastify's default query-string parser (no custom `querystringParser` configured in `apps/api/src/index.ts`) is Node's core `querystring` module. Verified directly: `querystring.parse('a=1&a=2')` → `{ a: ['1','2'] }`, but `querystring.parse('a=1')` → `{ a: '1' }` — a bare string, not a one-element array, when a key appears exactly once. Selecting a single dictionary is the single most common case, so a naive `z.array(z.string())` on `seriesIds` would reject exactly that request. No existing precedent in this codebase handles this (every existing `z.array(...)` is for JSON request bodies, not query strings).
- **Reusable UI primitive, previously unused this way**: `apps/web/src/components/ui/command.tsx`'s `CommandItem` (lines 152-170) already renders a `CheckIcon` whose visibility is driven by `group-data-[checked=true]/command-item:opacity-100` — it already supports a checked/selected visual state via a `data-checked` attribute; the existing single-select dictionary picker in `entries/new.tsx` just never uses it that way (it closes the dialog immediately on select instead). No multi-select or checkbox-list component exists anywhere else in this codebase (confirmed by a full grep of `apps/web/src/components/ui/` and a repo-wide grep for "multi"/"Multiple"). `entries/new.tsx` lines 219-234 also has a "selected items as removable `Badge` chips" pattern (used for inflections), directly reusable.
- **`apiGetSeriesList`**: hits a server-paginated endpoint (`apps/api/src/routes/series.ts`, `limit` default 50, max 200). The web client today never passes `limit`, so the existing single-select picker already silently truncates past 50 dictionaries — a pre-existing issue, out of scope here and not to be made worse.

## Goals / Non-Goals

**Goals:**
- Let a visitor narrow search results to one or more selected dictionaries, via a multi-select control.
- No selection behaves identically to today's unfiltered search — never accidentally "matches nothing."
- Selection persists across pagination via the same URL-state mechanism `q`/`page` already use.
- Reuse existing UI primitives and safe SQL-parameterization patterns rather than introducing new ones.

**Non-Goals:**
- Fixing the pre-existing `apiGetSeriesList`/`entries/new.tsx` >50-dictionary truncation (a separate, already-existing issue).
- Any automated component-test harness for `apps/web` (none exists today; not introduced here — see Verification).
- Any change to ranking/matching logic itself, or to the response shape of a search result item.

## Decisions

1. **Shared schema** — add to `packages/shared/src/search.ts`:
   ```ts
   // Fastify's default query-string parser (Node's `querystring` module)
   // collapses a query param that appears exactly once into a bare string
   // rather than a one-element array: `?seriesIds=x` -> { seriesIds: "x" },
   // but `?seriesIds=x&seriesIds=y` -> { seriesIds: ["x","y"] }. Selecting
   // a single dictionary is the common case, so without this preprocess
   // Zod would reject exactly that request. On the web side (TanStack
   // Router's own JSON-based search-param serialization) the value is
   // already a real array, so this is a no-op there - safe to share.
   export const seriesIdsFilterSchema = z
     .preprocess(
       (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
       z.array(z.string().min(1)).min(1)
     )
     .optional();
   ```
   Both `apps/api/src/routes/search.ts`'s `searchQuerySchema` and `apps/web/src/routes/index.tsx`'s `homeSearchSchema` splice in this one fragment (`seriesIds: seriesIdsFilterSchema`) rather than becoming one shared object.

2. **Backend filter** (`apps/api/src/routes/search.ts`) — a conditional SQL fragment spliced into the existing `WHERE` clause, right after the existing status/approval predicate, with no change to the ranking/matching CTE:
   ```ts
   const seriesFilterSql =
     query.seriesIds && query.seriesIds.length > 0
       ? Prisma.sql`AND s.id = ANY(ARRAY[${Prisma.join(
           query.seriesIds.map((id) => Prisma.sql`${id}`), ", "
         )}]::text[])`
       : Prisma.empty;
   ```
   ```sql
   WHERE e."status" = 'PUBLISHED' AND e."approvalStatus" = 'APPROVED'
   ${seriesFilterSql}
   ```
   No filter selected → `Prisma.empty` → byte-for-byte the same query as today. A `seriesIds` value that doesn't match any real series contributes zero rows, not an error.

3. **`apps/web/src/lib/api.ts`** — widen both existing functions rather than adding new ones:
   ```ts
   export async function apiGetSeriesList(page = 1, limit?: number): Promise<SeriesListItemDto[]> {
     const params = new URLSearchParams({ page: String(page) });
     if (limit) params.set("limit", String(limit));
     const res = await fetch(`/api/series?${params.toString()}`, { credentials: "include" });
     return handleResponse<SeriesListItemDto[]>(res);
   }

   export async function apiSearchEntries(q: string, page = 1, seriesIds: string[] = []): Promise<SearchResultsDto> {
     const params = new URLSearchParams({ q, page: String(page) });
     for (const id of seriesIds) params.append("seriesIds", id); // repeated key, not comma-joined
     const res = await fetch(`/api/search?${params.toString()}`, { credentials: "include" });
     return handleResponse<SearchResultsDto>(res);
   }
   ```
   `entries/new.tsx`'s existing `apiGetSeriesList()` call is untouched in behavior (no `limit` passed → server still defaults to 50). The new filter component calls `apiGetSeriesList(1, 200)` (200 = the server's own hard max in `apps/api/src/routes/series.ts`'s `listQuerySchema`).

4. **New component** `apps/web/src/components/DictionaryMultiSelect.tsx` — fully controlled:
   ```ts
   interface DictionaryMultiSelectProps {
     selectedIds: string[];
     onChange: (ids: string[]) => void;
   }
   ```
   matching the "URL is the only source of truth" pattern already used for `q`/`page` — no internal selection state that could drift from the URL. Owns its own dictionary-list fetch (`useQuery(["seriesList", "all"], () => apiGetSeriesList(1, 200))`, a distinct query key from any other series-list query) and its own dialog-open boolean. Reuses `CommandDialog`/`CommandInput`/`CommandList`/`CommandGroup`/`CommandItem` with three deltas from the single-select picker: `onSelect` toggles membership in `selectedIds` instead of setting-and-closing; each `CommandItem` gets `data-checked={selectedIds.includes(series.id) ? "true" : undefined}` so the primitive's built-in checkmark reflects selection; the dialog stays open across multiple picks (no `onOpenChange(false)` inside `onSelect`). Selected dictionaries render as removable `Badge` chips below the trigger, copying the exact shape of `entries/new.tsx`'s inflection chips (lines 219-234) — each chip's remove button calls `onChange(selectedIds.filter((id) => id !== removedId))`, satisfying the "individually removable without opening the picker" requirement directly.

5. **Page wiring**:
   - `apps/web/src/routes/index.tsx`: add `seriesIds: seriesIdsFilterSchema` (imported from `@planetos/shared`) to `homeSearchSchema`; destructure `seriesIds` from `Route.useSearch()`; render `<DictionaryMultiSelect>` only in the results branch (`hasQuery` true), not the landing view; new handler mirrors the existing submit handler's `page: 1` reset:
     ```ts
     function handleSeriesIdsChange(ids: string[]) {
       void navigate({ to: "/", search: (prev) => ({ ...prev, seriesIds: ids.length > 0 ? ids : undefined, page: 1 }) });
     }
     ```
     Mapping an empty selection back to `undefined` (never persisting `[]`) is required — the shared schema's `.min(1)` on the array would reject a bare `[]` as a defense-in-depth backstop if it ever reached the URL.
   - `apps/web/src/components/SearchResults.tsx`: add a `seriesIds: string[]` prop; include it in `queryKey` (`["search", query, page, seriesIds]`); pass it to `apiSearchEntries`. `goToPage` needs no change — `...prev` already carries `seriesIds` forward once it's part of the URL, which is exactly what makes filter selection survive plain page navigation (confirmed via direct read of the existing pagination handler).
   - Confirmed via direct read of `apps/web/src/router.tsx` (no custom `stringifySearch`/`parseSearch` configured on `createRouter`) that TanStack Router's default JSON-based search-param serialization applies — `seriesIds: z.array(z.string())` round-trips through the URL with zero custom serializer needed; this is a separate concern from the manually-built `URLSearchParams` request `apiSearchEntries` sends to `/api/search`.

## Risks / Trade-offs

- **[Risk]** The Fastify string-vs-array query-param gotcha is easy to overlook and would silently break the single-dictionary-selected case (the most common one) if "simplified" away. → **Mitigation**: explicit code comment on `seriesIdsFilterSchema` itself (Decision 1) plus a dedicated regression test for exactly the single-selection case (see Verification).
- **[Risk]** `DictionaryMultiSelect` fetching up to 200 dictionaries in one call doesn't scale indefinitely. → **Mitigation**: 200 matches the server's own hard cap (`listQuerySchema`'s `max(200)`) — consistent with, not exceeding, an existing limit; a `// TODO` notes the ceiling for whenever the pre-existing >50 truncation issue elsewhere is eventually addressed.
- **[Risk]** Adding a filter param without threading it through `SearchResults`'s `queryKey` would serve stale/wrong cached results when the filter changes. → **Mitigation**: `seriesIds` is included in the `queryKey` (Decision 5), so TanStack Query treats a filter change as a distinct query, matching how `query`/`page` are already handled.

## Migration Plan

Purely additive: no schema migration (no new Prisma model or column — filters on existing `Series.id`), no changes to any existing route's behavior when `seriesIds` is omitted, no changes to response shape. Rollback is a plain revert; nothing depends on the new code existing.
