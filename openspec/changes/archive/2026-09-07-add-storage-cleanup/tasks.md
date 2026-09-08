## 1. Schema

- [x] 1.1 Add the `StorageCleanupReason` enum (`BUILD_FAILED`, `SERIES_DELETED`) and `PendingStorageCleanup` model (`id`, `prefix`, `reason`, `createdAt`, `attempts`, `error`, `@@index([createdAt])`) to `apps/api/prisma/schema.prisma` per design.md Decision 1. Generate and apply the migration (`prisma migrate dev`); verify it is purely additive (one table + one enum, no existing column/table changes) and `pnpm --filter @planetos/api exec tsc --noEmit` passes.

## 2. Storage client fix

- [x] 2.1 In `apps/api/src/lib/storage.ts`, change `deleteObjects` to chunk its input into batches of at most 1000 keys, issuing one `DeleteObjectsCommand` per batch, per design.md Decision 6. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes and the existing behavior for ≤1000 keys (including the empty-array no-op) is unchanged.
- [x] 2.2 Add a test to `apps/api/tests/storage.test.ts` proving `deleteObjects` handles more than 1000 keys without an S3 "too many keys" error — synthetic never-uploaded keys are sufficient (S3's `DeleteObjects` on a non-existent key is already a no-op success), no need for 1500 real uploads. Verify against real MinIO.

## 3. Storage cleanup library

- [x] 3.1 Create `apps/api/src/lib/storageCleanup.ts` exporting `scheduleStorageCleanup(tx, prefix, reason)`, `processStorageCleanup(prisma, storage, cleanupId)`, and `runStorageCleanupSweep(prisma, storage)` per design.md Decision 2, including the `P2025`-on-final-delete idempotency handling and the best-effort (never-masks-the-original-error) attempts/error bookkeeping on failure. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 3.2 Add tests in a new `apps/api/tests/storageCleanup.test.ts` against real Postgres + real MinIO: a normal cleanup uploads-then-removes every object under its prefix and removes the row; a cleanup for a prefix with nothing under it is a safe no-op that still removes the row; calling `processStorageCleanup` for a cleanup id that no longer exists (simulating a concurrent/prior completion) does not throw; `runStorageCleanupSweep` processes multiple pending rows and one row's induced failure (e.g. a storage stub that throws for one specific prefix) does not prevent the others from succeeding. Verify all pass.

## 4. Wire into the build failure path

- [x] 4.1 In `apps/api/src/jobs/build.ts`, wrap the failure-path `Build.update` in a transaction that also calls `scheduleStorageCleanup(tx, \`builds/${seriesId}/${build.id}/\`, "BUILD_FAILED")`, per design.md Decision 3. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes and `processDictionaryBuild`'s signature is unchanged (no existing call site needs updating).
- [x] 4.2 Add a test to `apps/api/tests/build.test.ts` proving a build that fails after a successful upload (e.g. by making the DB update step throw, or by having storage succeed then the transaction fail) creates a `PendingStorageCleanup` row with `prefix: "builds/{seriesId}/{buildId}/"` and `reason: "BUILD_FAILED"`. Verify against real Postgres, and confirm existing failure-path tests (Build marked FAILED, retry behavior) still pass unchanged.

## 5. Wire into series deletion

- [x] 5.1 In `apps/api/src/routes/series.ts`'s `DELETE /api/series/:slug` handler, wrap the delete in a transaction that also calls `scheduleStorageCleanup(tx, \`builds/${deleted.id}/\`, "SERIES_DELETED")` using `select: { id: true }` on the delete call, per design.md Decision 4. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes and the existing `P2025 → 404` mapping still fires correctly.
- [x] 5.2 Add a test to `apps/api/tests/series.test.ts` proving deleting a series creates a `PendingStorageCleanup` row with `prefix: "builds/{seriesId}/"` and `reason: "SERIES_DELETED"`. Add an end-to-end case: create a series with a build that has real objects uploaded to MinIO, delete the series via the API, run `runStorageCleanupSweep`, and assert those objects no longer exist in MinIO. Verify against real Postgres + MinIO, and confirm existing delete tests (204, 404, 403) still pass unchanged.

## 6. Wire the periodic sweep into the worker

- [x] 6.1 In `apps/api/src/worker.ts`, add a `job.name === "cleanup-storage"` branch to the `maintenance` queue's job processor calling `runStorageCleanupSweep(prisma, { listObjects, deleteObjects })`, and register the repeatable job via `maintenanceQueue.upsertJobScheduler("cleanup-storage", { pattern: "0 * * * *" }, { name: "cleanup-storage", data: {} })`, per design.md Decision 5. Import `listObjects` from `./lib/storage.js` alongside the existing `putObject`/`deleteObjects` import. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.

## 7. Final verification

- [x] 7.1 `pnpm --filter @planetos/api exec tsc --noEmit` passes with all changes in place.
- [x] 7.2 `pnpm --filter @planetos/api test` passes in full against real Postgres/Redis/MinIO — no regressions to any existing suite.
- [x] 7.3 `openspec validate add-storage-cleanup --type change --strict` passes.
- [x] 7.4 Read-through: confirm `processDictionaryBuild`'s signature and every existing call site (production and tests) are unchanged; confirm both `scheduleStorageCleanup` call sites sit inside the same transaction as the state change that loses the object keys; confirm `deleteObjects` behaves identically to before for its existing callers when given ≤1000 keys; confirm the migration is purely additive.
