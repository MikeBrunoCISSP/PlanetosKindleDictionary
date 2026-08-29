## Context

Two pieces already exist and are reused as-is, per `add-kindle-dictionary-automation`:
- `GET /api/series/:slug/download` — public, 302-redirects to a presigned S3/MinIO URL for the latest `SUCCESS` build's EPUB.
- `apps/api/src/lib/storage.ts`'s `getPresignedDownloadUrl(key, expiresInSeconds)` — signs a `GetObjectCommand`, no control over the filename the browser sees (it inherits the S3 object key's basename, currently `dictionary.epub`).
- `apps/web/src/components/AppHeader.tsx`'s `AppMenu` — currently only mounted when `me` is truthy (`{me && <AppMenu me={me} />}`), and internally assumes an authenticated `me: UserDto` throughout (username/email header row, section list keyed to role).

See proposal.md for why this change exists (discoverability, not new backend capability).

## Goals / Non-Goals

**Goals:**
- One page listing every downloadable dictionary, reachable from two places (homepage link, menu item), no login required.
- A consistent, human-readable filename on every EPUB download, everywhere.
- Minimal rework of `AppMenu` to support an anonymous rendering path without duplicating its accordion/dropdown machinery.

**Non-Goals:**
- No change to `sources.zip` downloads or their filenames — the user's requested pattern is EPUB-only.
- No pagination, search, or filtering on the new download-listing page — the existing dictionary count is small (per `apiGetSeriesList`'s own unpaginated-in-practice usage in the menu's selection dialogs).
- No change to which builds are considered "latest" — reuses the exact same `status: SUCCESS, orderBy: createdAt desc, take: 1` query the per-series route already uses.

## Decisions

### 1. Filename via S3 `ResponseContentDisposition`, not app-server streaming

`getPresignedDownloadUrl` gains an optional third parameter, `downloadFilename?: string`, which sets `ResponseContentDisposition: 'attachment; filename="<name>"'` on the signed `GetObjectCommand`. S3/MinIO honors this at serve time — the browser sees the requested filename without the app server having to proxy the file's bytes. This keeps the existing "redirect to a presigned URL, bandwidth leaves the app server" design (SPEC.md §6 Conventions) intact; only the signing call changes.

Alternative considered: rename the object key itself to include the filename. Rejected — the key is also used internally (retention pruning, `epubKey` column) and mixing a human-facing name into it complicates both without benefit, since `ResponseContentDisposition` solves this directly.

### 2. Filename sanitization: a small dedicated helper, not the existing `slug`

The approved answer was "keep case but remove/replace characters that aren't URL-safe" — deliberately different from the series' existing `slug` field (which is lowercased). New helper `apps/api/src/lib/filename.ts`:

```ts
export function sanitizeForFilename(input: string): string {
  return input
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildDictionaryFilename(title: string, buildDate: Date): string {
  const day = String(buildDate.getDate()).padStart(2, "0");
  const month = MONTH_ABBR[buildDate.getMonth()]; // "Jan".."Dec"
  const year = buildDate.getFullYear();
  const hour = String(buildDate.getHours()).padStart(2, "0");
  const minute = String(buildDate.getMinutes()).padStart(2, "0");
  return `${sanitizeForFilename(title)}_${day}${month}${year}${hour}${minute}.epub`;
}
```

Runs of non-alphanumeric characters collapse to a single `-` (so `"A Song of Ice & Fire"` → `"A-Song-of-Ice-Fire"`), distinct from the `_` that separates the title from the timestamp, so the two are never visually ambiguous. Uses the build's local server time (matches how `Build.createdAt` is already displayed elsewhere — no timezone conversion introduced, consistent with the rest of the app which doesn't do timezone-aware formatting).

Alternative considered: use `series.slug` directly. Rejected per the explicit answer — the user wants case preserved, which `slug` does not.

### 3. New public endpoint for the listing page, not extending `GET /api/series`

`GET /api/downloads` (new, in `downloads.ts`) returns `{ slug: string; title: string }[]` for series with at least one `SUCCESS` build, ordered by title:

```ts
prisma.series.findMany({
  where: { builds: { some: { status: "SUCCESS" } } },
  select: { slug: true, title: true },
  orderBy: { title: "asc" },
});
```

A dedicated endpoint avoids overloading `GET /api/series` (used by `apiGetSeriesList` for the menu's admin-only Update/Delete pickers, which lists every series regardless of build state) with a second, differently-filtered meaning. The frontend needs only `slug`+`title` — no build metadata, since the actual filename is decided server-side at download time (Decision 1), not computed or displayed by the client.

### 4. `AppMenu` rendering split by a boolean, not a second component

`AppHeader` always renders `<AppMenu me={me} />`, where `AppMenu`'s `me` prop becomes `UserDto | null`. Internally, `isAdmin` becomes `me?.role === "ADMIN"`, the header row (username/email) and the "Entries"/"Administration" sections render only `if (me)`, and the "Dictionaries" section (now always rendered) shows "Download" unconditionally and "Create"/"Update"/"Delete" only `if (isAdmin)`. This reuses the exact same accordion/dropdown state and markup rather than forking into a separate anonymous-only component, which would duplicate the section-expansion logic for no benefit — the anonymous case is a strict subset of the authenticated one.

The `{me ? <AccountMenu .../> : <Link to="/login">Log In</Link>}` block in `AppHeader` is unchanged; only the `{me && <AppMenu .../>}` guard is removed.

### 5. Homepage link: landing state only

"Underneath the search bar" is implemented in `index.tsx`'s `!hasQuery` (landing) branch only, not the with-results branch — matching the literal placement described ("on the homepage, underneath the search bar") rather than inventing a second placement not asked for.

## Risks / Trade-offs

- **[Risk]** `ResponseContentDisposition` filenames containing characters S3/MinIO's presigner mishandles (e.g. very long titles) → **Mitigation**: `sanitizeForFilename` only ever produces `[A-Za-z0-9-]`, and title length is already capped at 200 chars by `createSeriesSchema`/`updateSeriesSchema` in `packages/shared`, well under any practical `Content-Disposition` header limit.
- **[Risk]** Reworking `AppMenu` to accept `me: UserDto | null` touches a component with real existing behavior (admin dialogs, delete confirmation) → **Mitigation**: every branch that requires a real user (`Update`/`Delete` dialogs, `Create`) stays gated on `isAdmin`, which is `false` when `me` is `null`; no new code path can reach them without a real admin `me`. Existing authenticated-user behavior is preserved verbatim, only the top-level render guard changes.
- **[Trade-off]** The new `/api/downloads` endpoint duplicates the "series with a SUCCESS build" shape of logic already implicit in the per-series download route, rather than sharing a helper. Accepted as reasonable given the query is a single `findMany` line; not worth an abstraction for one caller each.
