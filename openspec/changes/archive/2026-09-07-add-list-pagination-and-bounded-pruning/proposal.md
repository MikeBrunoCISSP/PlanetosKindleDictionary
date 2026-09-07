## Why

Four production data-access paths grow unboundedly with usage: the pending-registrations list, the merged moderation queue, the public build-history endpoint, and per-series build pruning all load a full, unbounded collection into memory before slicing, merging, or sorting it in application code. A finding from an external review (PERF-002) flags this and requires every externally returned collection to have a server-enforced maximum page size, stable moderation ordering across pages, and bounded pruning memory use regardless of build history size.

## What Changes

- Add cursor-based pagination (a reusable `(createdAt, id)` cursor helper — the first cursor pagination in the codebase, matching SPEC.md's documented but previously unimplemented pagination convention) to the pending-registrations list and the merged review queue, both admin-only endpoints that are actively depleted (approved/rejected) while an admin pages through them. Cursor pagination is used specifically because it doesn't have offset pagination's "skip or duplicate a row when the underlying set shrinks mid-page" problem, which the existing `page`/`limit` convention used elsewhere in the codebase would have here.
- The review queue's two underlying queries (pending entries, pending edit proposals) are each queried in a bounded form (`take: limit`) and merge-sorted, instead of two unbounded `findMany` calls merged and sorted entirely in Node.
- Both admin UI tables (pending registrations, approval queue) get a "Load more" control backed by the new pagination, so admins can still reach every pending item — capping the API without wiring the UI would otherwise hide items beyond the first page.
- The public per-series build-history endpoint gets a fixed hard cap (most recent 50 builds) — no pagination API is added since nothing consumes this endpoint today and admins/visitors don't page through it interactively.
- Per-series build pruning's query is changed to only consider builds beyond the retention count that still have a storage key to prune (already-pruned rows never match again), plus a hard batch cap, so its memory use no longer grows with a series' total historical build count.
- Add two missing composite indexes (`User.approvalStatus, createdAt` and `Entry.approvalStatus, createdAt`) backing the new/existing pending-list queries.
- No change to what data is included/excluded, what counts as "pending," or the actual retention count (10 most recent builds) — only how those collections are queried and paged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `admin/registration-approval`: the "Pending Registrations Listing" requirement is modified to describe bounded, cursor-paginated loading and the "administrators can load further pages until every currently Pending account has been shown" guarantee.
- `entries/approval`: the "Pending Entries Listing" requirement is modified with the same bounded, cursor-paginated treatment for the merged queue.
- `dictionary-management/downloads`: the "Public Build History" requirement is modified to state the fixed cap on returned build history explicitly.

## Impact

- `apps/api/prisma/schema.prisma` — two new composite indexes; additive migration.
- `apps/api/src/lib/cursor.ts` (new) — shared cursor encode/decode helper.
- `apps/api/src/routes/admin.ts` — `GET /api/admin/users/pending` becomes cursor-paginated.
- `apps/api/src/routes/entryEditProposals.ts` — `GET /api/admin/review-queue` becomes bounded, cursor-paginated over its merged sources.
- `apps/api/src/routes/downloads.ts` — `GET /api/series/:slug/builds` gets a fixed cap.
- `apps/api/src/jobs/prune.ts` — bounded, self-limiting pruning query.
- `packages/shared/src/*` — a small reusable paginated-envelope schema, and updated DTO exports for the two paginated endpoints.
- `apps/web/src/routes/admin.tsx`, `apps/web/src/routes/admin_.approval-queue.tsx`, `apps/web/src/lib/api.ts` — the two admin tables move to `useInfiniteQuery` with a "Load more" control.
