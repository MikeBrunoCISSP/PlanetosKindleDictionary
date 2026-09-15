## Context

`GET /api/downloads` currently queries only series with at least one `SUCCESS` build, then filters out any whose latest build's `entryCount` is 0. `DownloadsPageContent.tsx` renders the result as a simple `<ul>` of title + download-link rows, with no count column. See [proposal.md](./proposal.md) for why this changes.

## Goals / Non-Goals

**Goals:**
- Every `Series` row appears on `/downloads` (and `/`, which renders the same content), whether or not it has ever built successfully.
- Each row communicates its term count and, for zero-term dictionaries, nudges the visitor toward signing in/registering instead of offering a dead-end download.

**Non-Goals:**
- No change to how a series' own detail page (`/series/:slug`) or the per-series build-history endpoint behaves — this change is scoped to the all-dictionaries listing endpoint/page only.
- No change to authentication/authorization: the CTA is a plain link to `/login`, not a gate that checks whether the visitor is already signed in.
- No pagination changes to the listing.

## Decisions

- **Drop both filters in the `/api/downloads` query, add `entryCount` to the DTO.** The existing `where: { builds: { some: { status: "SUCCESS" } } }` clause and the subsequent `entryCount > 0` array filter are both removed. Every `Series` row is now selected, left-joined to its latest `SUCCESS` build (`take: 1`, `orderBy: createdAt desc`) to compute `entryCount`, defaulting to `0` when there's no such build. This is a **BREAKING** shape change to `GET /api/downloads` (new `entryCount` field, more rows returned) — acceptable because the endpoint has exactly one consumer (`DownloadsPageContent.tsx`), updated in the same change.
- **Term count of `0` is derived, not stored.** No schema change: `0` naturally results whether a series has never built, or its latest build succeeded with zero entries. The spec treats both cases identically (dash + CTA), matching the proposal's intent — the visitor doesn't need to know *why* it's empty, just that it needs contributions.
- **Keep the existing list-based markup; add a count column via flex layout, not an HTML `<table>`.** The page already renders rows as `<li>` flex containers rather than a table. Introducing a real `<table>` would be a larger visual rework than this change calls for. Each row becomes a 3-part flex line: title, term count (or `—`), and either the download link or the CTA text — same DOM pattern, one more `<span>`.
- **CTA is unconditional on auth state.** Per the proposal, "Contribute Now!" always replaces the link when the count is zero, regardless of whether the visitor happens to already be logged in. Checking session state here would add a data dependency (current-user query) the page doesn't otherwise have, for a benefit (hiding the CTA from already-logged-in users) the request didn't ask for.
- **Last-modified time is the latest successful build's `createdAt`, not `finishedAt`.** `Build` has both fields, but the existing per-series download route already treats `createdAt` as the build's effective completion time (it's what `buildDictionaryFilename` uses for the download filename, and what `orderBy: { createdAt: "desc" }` uses to pick "the latest build" everywhere in this file). Using `finishedAt` instead would introduce a second, inconsistent notion of "when this build happened" alongside the one already baked into filenames and ordering. `entryCount === 0` (no build, or a zero-entry build) means the field is simply omitted from the DTO (`lastModifiedAt: null`) rather than sending a zero-entry build's real timestamp — the web layer dashes on `entryCount === 0` regardless.
- **Last-modified is formatted client-side, from raw `Date` getters, not `Intl`.** The spec's format (`Jan 06 2026 14:30`) is a fixed literal shape, not a locale-appropriate rendering — `Intl.DateTimeFormat` would vary its punctuation/ordering by locale even with matching options. Building it manually (`date.getMonth()`, `.getDate()`, `.getFullYear()`, `.getHours()`, `.getMinutes()`, all zero-padded, joined with a fixed literal template) both guarantees the exact format and automatically resolves to the browser's local timezone, since unqualified `Date` getters are always local-time — no explicit timezone handling needed.
- **Populated-first sort happens in application code, not in the Prisma query.** `entryCount` is derived from a `take: 1`-limited related `Build` row, not a plain column on `Series`, so there's no simple `orderBy` clause that groups by "does the latest build have entries" — expressing that at the query level would mean a raw/aggregate SQL query, which this project's ESLint rule (`no-restricted-syntax` banning `$queryRawUnsafe`/string-built SQL) and its `$queryRaw` parameterization requirement make more ceremony than it's worth for a small dataset. Instead, the handler builds the same per-series DTO array as before (one query, `take: 1` on `builds`), then sorts it in JS: `entryCount > 0` group first, `localeCompare` on title within each group. The series count this endpoint handles is small (see the existing `MAX_BUILD_HISTORY`-style scale comment in this file), so an in-memory sort is not a performance concern.

## Risks / Trade-offs

- [Listing now includes series that may be placeholders with no real content or metadata] → Acceptable per the proposal's explicit goal (surface not-yet-built dictionaries so visitors can help fill them in); title/author data still comes from `Series`, which is populated at series-creation time regardless of build status.
- [`apps/api/tests/downloads.test.ts` has existing assertions that empty/unbuilt series are excluded] → These are updated in this change (tracked in tasks.md) to assert inclusion with `entryCount: 0` instead.
- [Last-modified time formatting depends on the visitor's own device clock/timezone being correct] → Accepted: this is standard behavior for any client-rendered local timestamp (the same tradeoff every "time ago" or local-time UI makes), and the alternative (a fixed server timezone) is explicitly what the proposal asked to avoid.

## Migration Plan

Single coordinated deploy of API + web (already deployed together per [[deployment-topology]] memory — one Railway service serves both). No data migration needed; no rollback complexity beyond redeploying the prior revision, since no schema or stored data changes.
