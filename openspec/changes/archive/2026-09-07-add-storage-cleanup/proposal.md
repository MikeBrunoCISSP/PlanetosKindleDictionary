## Why

A build's object-storage uploads and its database bookkeeping are not transactional with each other: if a database failure happens after one or both objects are uploaded, the objects become unreachable (the `Build` row that would have recorded their keys never gets them). Deleting a series cascades away every `Build` row at the database level but never touches object storage at all, permanently orphaning every object that series ever produced. A finding from an external review (PROD-007) flags this and requires failed partial uploads and deleted series' objects to eventually be removed, with retries safe against either the database or the object store being temporarily unavailable.

## What Changes

- Add a durable `PendingStorageCleanup` record, written in the same transaction as whatever action makes a set of objects unreachable (a build failing after upload, or a series being deleted) — the objects' only remaining pointer, since the normal `Build`-row bookkeeping either never gets written or is cascaded away by that same action.
- A build that fails after uploading (either object) schedules cleanup for that attempt's own `builds/{seriesId}/{buildId}/` prefix, alongside marking the `Build` row `FAILED` — no change to the build job's retry/rethrow behavior.
- Deleting a series schedules cleanup for its entire `builds/{seriesId}/` prefix, in the same transaction as the delete itself — if scheduling the cleanup record fails, the series is not deleted, rather than silently losing the ability to ever reclaim its storage.
- A new hourly repeatable job processes every pending cleanup record: lists everything under its prefix, deletes it, and removes the record. This single periodic sweep is the entire mechanism — no synchronous best-effort enqueue is needed, since both acceptance guarantees are explicitly "eventual," not latency-sensitive.
- `storage.ts`'s `deleteObjects` is fixed to chunk into batches of at most 1000 keys (S3's `DeleteObjects` hard limit per request) so a whole-series prefix delete is correct regardless of how many objects have accumulated.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dictionary-management/delete-dictionary`: the "Delete Dictionary API" requirement gains the guarantee that deleting a series eventually removes its object-storage artifacts.
- `dictionary-management/build-automation`: the "A Failed Build Never Removes a Working Dictionary" requirement gains the guarantee that a failed build's own orphaned uploads are eventually removed.

## Impact

- `apps/api/prisma/schema.prisma` — new `PendingStorageCleanup` model + `StorageCleanupReason` enum; additive migration.
- `apps/api/src/lib/storageCleanup.ts` (new) — schedule/process/sweep functions.
- `apps/api/src/lib/storage.ts` — `deleteObjects` chunks at 1000 keys.
- `apps/api/src/jobs/build.ts` — schedule cleanup in the failure path.
- `apps/api/src/routes/series.ts` — schedule cleanup in the delete path.
- `apps/api/src/worker.ts` — register and dispatch the new hourly `cleanup-storage` job on the existing `maintenance` queue.
- `apps/api/tests/storageCleanup.test.ts` (new), `apps/api/tests/build.test.ts`, `apps/api/tests/series.test.ts`, `apps/api/tests/storage.test.ts` — new/updated coverage against real Postgres/MinIO.
