## Context

See proposal.md - Why. Confirmed by reading the current code:

- `apps/api/src/jobs/build.ts`'s `processDictionaryBuild` uploads the EPUB and sources archive via two separate `storage.putObject` calls, then commits a transaction setting `Build.epubKey`/`sourceKey` and `status: "SUCCESS"`. Its `catch` block only marks the `Build` row `FAILED` with error detail — nothing deletes whatever was already uploaded, and the `Build` row never gets `epubKey`/`sourceKey` set on the failure path, so there's no database record of what to delete even if someone wanted to.
- `apps/api/src/routes/series.ts`'s `DELETE /api/series/:slug` is `prisma.series.delete({ where: { slug } })` — cascades away every `Build` row at the database level, no storage call at all.
- `apps/api/src/jobs/prune.ts`'s retention query only considers `Build` rows with `status: "SUCCESS"` that still exist — correct for its own job, cited as evidence of the same underlying gap, not something to change.
- `apps/api/src/lib/storage.ts` already exports `listObjects(prefix)` (paginated) and `deleteObjects(keys)` — the two primitives a prefix-deletion workflow needs. `deleteObjects` passes its whole input to one `DeleteObjectsCommand`, but S3's `DeleteObjects` hard-caps at 1000 keys per request; today's only caller (`prune.ts`, `PRUNE_BATCH_LIMIT = 500` builds × 2 keys = 1000) happens to always be at or under that limit, but a whole-series prefix delete has no such cap.
- Object keys already follow a deterministic, discoverable convention: `builds/{seriesId}/{build.id}/dictionary.epub` and `.../sources.zip`. This means a cleanup mechanism never needs to enumerate exact keys from a database row that might not exist — a **prefix** (`builds/{seriesId}/{build.id}/` for one failed attempt, or `builds/{seriesId}/` for a whole deleted series) combined with `listObjects` is sufficient to find everything that needs deleting, including objects a database row never tracked at all.
- `processDictionaryBuild(prisma, storage, seriesId)` has 6 call sites today (1 production in `worker.ts`, 5 in `build.test.ts`/`sweepRebuild.test.ts`), all passing exactly 3 arguments.

## Goals / Non-Goals

**Goals:**
- A build that fails after uploading (either object) eventually has that upload removed.
- Deleting a series eventually removes every object it ever produced, including already-retained (not-yet-pruned) builds.
- The mechanism is safe to retry indefinitely regardless of which dependency (database or object store) was unavailable at any point.

**Non-Goals:**
- Any latency guarantee for cleanup — both acceptance criteria say "eventually," so no synchronous best-effort enqueue is attempted anywhere (contrast with PROD-006's email outbox, where a user is plausibly waiting).
- Changing `processDictionaryBuild`'s public signature — the design avoids adding a `Queue` dependency to it entirely, precisely because no immediate enqueue is needed.
- Changing `prune.ts`'s retention logic or `PRUNE_BATCH_LIMIT` — only `deleteObjects` (which `prune.ts` also calls) gets the chunking fix, as a shared correctness improvement.
- Bucket lifecycle rules as an infrastructure-level backstop — out of this codebase's scope; noted as a possible future addition, not implemented here.

## Decisions

### 1. `PendingStorageCleanup` model — the durable record

```prisma
enum StorageCleanupReason {
  BUILD_FAILED
  SERIES_DELETED
}

model PendingStorageCleanup {
  id        String                @id @default(cuid())
  prefix    String
  reason    StorageCleanupReason
  createdAt DateTime              @default(now())
  attempts  Int                   @default(0)
  error     String?

  @@index([createdAt])
}
```

No foreign key to `Series` — it must survive the series being gone, which is the entire point (mirrors why `EmailOutbox` doesn't need survival past its subject in the same way, but for the opposite reason: here the subject is deliberately being destroyed). `attempts`/`error` mirror `Build`'s and `EmailOutbox`'s existing style, directly satisfying "observable" from the finding's own suggested_fix.

Alternative considered and rejected: capturing the exact key list (not just a prefix) at schedule time. Rejected as unnecessary — the deterministic naming convention means a prefix plus `listObjects` finds everything, including objects that were never recorded in any column (exactly the failure mode this fixes), so there's nothing to gain from also persisting a key list and one more way for it to be wrong (e.g. stale if more objects appear under the same prefix later, which can't happen for a per-build prefix but is relevant to keep in mind if this pattern is ever reused elsewhere).

### 2. `apps/api/src/lib/storageCleanup.ts`

```ts
import type { Prisma, PrismaClient, StorageCleanupReason } from "@prisma/client";
import { isPrismaError } from "./errors.js";

export interface CleanupStorage {
  listObjects(prefix: string): Promise<{ key: string }[]>;
  deleteObjects(keys: string[]): Promise<void>;
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

export async function scheduleStorageCleanup(
  tx: Prisma.TransactionClient,
  prefix: string,
  reason: StorageCleanupReason
): Promise<void> {
  await tx.pendingStorageCleanup.create({ data: { prefix, reason } });
}

export async function processStorageCleanup(
  prisma: PrismaClient,
  storage: CleanupStorage,
  cleanupId: string
): Promise<void> {
  const row = await prisma.pendingStorageCleanup.findUnique({ where: { id: cleanupId } });
  if (!row) return; // already completed by a prior/concurrent attempt

  try {
    const objects = await storage.listObjects(row.prefix);
    await storage.deleteObjects(objects.map((o) => o.key));
    await prisma.pendingStorageCleanup.delete({ where: { id: cleanupId } });
  } catch (err: unknown) {
    if (isPrismaError(err, "P2025")) return; // removed concurrently mid-attempt - already done
    try {
      await prisma.pendingStorageCleanup.update({
        where: { id: cleanupId },
        data: { attempts: { increment: 1 }, error: formatError(err) },
      });
    } catch {
      // best-effort bookkeeping only - never let a secondary DB failure here
      // mask the original error below.
    }
    throw err;
  }
}

export async function runStorageCleanupSweep(prisma: PrismaClient, storage: CleanupStorage): Promise<void> {
  const pending = await prisma.pendingStorageCleanup.findMany({ select: { id: true } });
  let succeeded = 0;
  for (const { id } of pending) {
    try {
      await processStorageCleanup(prisma, storage, id);
      succeeded++;
    } catch {
      // logged by the caller's job-failure handler if needed; one row's
      // failure must not stop the rest of the sweep.
    }
  }
  console.log(`[storage-cleanup] processed ${pending.length} pending cleanup(s), ${succeeded} succeeded`);
}
```

`processStorageCleanup` is idempotent by construction: an empty or already-cleaned prefix just deletes zero objects; a row removed by a concurrent sweep run surfaces as `P2025` on the final delete, treated as success. `runStorageCleanupSweep` is the only thing a repeatable job calls — it never throws, so BullMQ never retries the *job*; instead, any row that failed simply remains pending and is retried by the *next* sweep invocation. This is deliberately simpler than a per-row BullMQ job with its own retry/backoff: there's no latency requirement to protect, so "try again next hour" is a complete retry strategy.

### 3. `build.ts`'s failure path schedules cleanup for its own prefix

```ts
} catch (err: unknown) {
  await prisma.$transaction(async (tx) => {
    await tx.build.update({
      where: { id: build.id },
      data: { status: "FAILED", error: formatError(err), finishedAt: new Date() },
    });
    await scheduleStorageCleanup(tx, `builds/${seriesId}/${build.id}/`, "BUILD_FAILED");
  });
  throw err;
}
```

Scheduled unconditionally on any failure, regardless of which step threw (file generation, either upload, or the success-transaction commit) — deleting objects that were never actually uploaded is a harmless no-op via `listObjects` returning nothing for that prefix. `processDictionaryBuild`'s signature, return type, and retry/rethrow behavior are all unchanged; none of its 6 existing call sites need updating.

### 4. `series.ts`'s delete path schedules cleanup for the whole series' prefix

```ts
fastify.delete("/api/series/:slug", { preHandler: requireAdmin }, async (request, reply) => {
  const { slug } = request.params as { slug: string };
  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.series.delete({ where: { slug }, select: { id: true } });
      await scheduleStorageCleanup(tx, `builds/${deleted.id}/`, "SERIES_DELETED");
    });
    return reply.status(204).send();
  } catch (err: unknown) {
    if (isPrismaError(err, "P2025")) throw Errors.NOT_FOUND();
    throw err;
  }
});
```

`select: { id: true }` on the `delete` call avoids a separate lookup round trip. Wrapping both statements in one transaction means a failure to schedule cleanup rolls back the delete too — the series is **not** deleted rather than deleted-but-unreclaimable. The existing `P2025 → 404` mapping is unchanged (still fires when `tx.series.delete` itself finds nothing).

### 5. One new repeatable job on the existing `maintenance` queue

```ts
// worker.ts
if (job.name === "cleanup-storage") {
  await runStorageCleanupSweep(prisma, { listObjects, deleteObjects });
  return;
}
// ...existing prune-series handling...

await maintenanceQueue.upsertJobScheduler(
  "cleanup-storage",
  { pattern: "0 * * * *" },
  { name: "cleanup-storage", data: {} }
);
```

Reuses the `maintenance` queue (already hosts `prune-series` — the same category of housekeeping work) rather than adding a new queue. Hourly cadence matches this session's other "no urgency" repeatable jobs (`reconcile-pending-emails`, `reconcile-all-series` is daily, but that one guards a rarer failure mode — hourly here is simply a reasonable default with no specific requirement forcing a particular number). `upsertJobScheduler` makes registration idempotent across worker redeploys, matching every other repeatable job in this codebase.

### 6. `storage.ts`'s `deleteObjects` chunks at 1000 keys

```ts
const S3_DELETE_BATCH_LIMIT = 1000;

export async function deleteObjects(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += S3_DELETE_BATCH_LIMIT) {
    const batch = keys.slice(i, i + S3_DELETE_BATCH_LIMIT);
    if (batch.length === 0) continue;
    await getClient().send(
      new DeleteObjectsCommand({ Bucket: getBucket(), Delete: { Objects: batch.map((key) => ({ Key: key })) } })
    );
  }
}
```

Transparent to every caller — `prune.ts` and the new cleanup code both just call `deleteObjects(keys)`. An empty input array already short-circuits (the loop body never runs), preserving today's existing no-op behavior for zero keys.

## Risks / Trade-offs

- **[Risk] A series with an unusually large, never-pruned build history could still take a while to fully clean up (many `listObjects`/`deleteObjects` round trips in one sweep pass for one row).** → Accepted: `listObjects` already paginates internally, and `deleteObjects` now chunks correctly; this is a one-time cost per deleted series, not a recurring one, and there's no latency requirement to violate.
- **[Risk] `runStorageCleanupSweep` never throws, so BullMQ's own job-level failure/retry mechanism never engages** — a systemic problem (e.g. the object store completely unreachable for days) would just mean every row's `attempts` climbs every hour with no escalation. → Accepted for this change: `attempts`/`error` make the problem observable (an admin or a future dashboard can query for rows with high `attempts`), which satisfies the finding's own "observable" requirement; adding alerting on stuck rows is a reasonable follow-up but not required by this finding's acceptance criteria.
- **[Risk] Deleting a series whose cleanup-record insert fails leaves the admin's delete request erroring (500) instead of succeeding.** → Deliberate, not a gap: stated explicitly in Decision 4 as the correct trade-off (refuse the delete rather than lose the storage-reclamation guarantee).

## Migration Plan

Purely additive: one new table + one new enum, no changes to any existing column or table. No backfill needed — the new mechanism only applies to builds that fail or series that get deleted after this change ships; nothing needs to reconstruct history for objects that were already orphaned before this change existed (out of scope — a one-off manual bucket audit, not an application-level concern). No rollback concerns beyond the standard additive-migration case.
