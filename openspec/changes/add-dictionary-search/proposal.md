## Why

The homepage (`/`) currently force-redirects anonymous visitors to `/login` and shows only a "Signed in as X / Log out" card for logged-in users. There is no way to browse or search dictionary entries anywhere in the app, despite `SPEC.md` describing `/` as "Series index, search + cards" and stating that anonymous browsing is first-class. This change turns `/` into a Google-style search engine over every dictionary's entries, available to everyone with no login required.

## What Changes

- Homepage (`/`) becomes a centered search box (like google.com) when no query is present.
- Submitting a query navigates to the same route with `?q=&page=`, showing a results grid: dictionary name in the first column, the matched headword (bold when it matched) with a truncated definition and inflection list (matched inflections bolded) in the second.
- Matching is case-insensitive substring containment against the entry's headword or any of its inflections (not full definition text).
- Multi-word queries are split on whitespace; results matching any word are included, with results matching an earlier word in the query ranked above results matching only a later word.
- Results are capped at 50 per page, with Previous/Next pagination.
- Only `PUBLISHED` + `APPROVED` entries are ever returned.
- The search endpoint is public — no authentication required.
- The homepage's current "Signed in as X / Log out" content moves into the existing header dropdown menu, since `/` becomes pure search for every visitor, logged in or not.
- **BREAKING**: `/` no longer redirects unauthenticated visitors to `/login`. This supersedes the (unarchived, now-deleted) `redirect-unauthenticated-to-login` change, whose entire premise — "all useful content in the app requires authentication" — this change makes false.

## Capabilities

### New Capabilities

- `search/dictionary-search`: public, cross-dictionary search over entry headwords and inflections, with a results grid, pagination, and ranked multi-word matching.

### Modified Capabilities

_(none — no existing capability in `openspec/specs/` governs `/`'s own behavior or search; `navigation/route-guards`'s only requirement concerns admin routes redirecting non-admins *to* `/`, which is unaffected)_

## Impact

- **Database**: new `pg_trgm` GIN index on `SeriesWord.normalizedWord` (migration; no schema/column changes).
- **API** (`apps/api`): new public `GET /api/search` route (`apps/api/src/routes/search.ts`), a new rate-limit tier, registered in `apps/api/src/index.ts`.
- **Shared** (`packages/shared`): new `search.ts` DTOs/schemas; a new plain-text excerpt helper added to the existing server-only `sanitize.ts`.
- **Web** (`apps/web`): `index.tsx` loses its auth-redirect and gains the search UI; new `SearchResults` component and debounce hook; `AppHeader.tsx` gains an identity/log-out block in its dropdown; new `apiSearchEntries` client function.
- **Docs**: `SPEC.md` §6 (new endpoint) and §8 (update the `/` route description).
