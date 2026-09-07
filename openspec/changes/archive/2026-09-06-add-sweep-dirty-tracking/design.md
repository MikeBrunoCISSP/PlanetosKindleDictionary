## Context

See proposal.md - Why. In addition to that motivation, two implementation constraints shape this design:

- **SPEC.md §7 forbids using `updatedAt` as the rebuild trigger** ("Do not use `Series.updatedAt` as the trigger — a no-op edit that reverts a typo would otherwise cause a pointless rebuild"). This design does not violate that: the content-hash comparison remains the sole thing that decides whether to enqueue a build. The new marker only decides which series get hash-checked on the fast hourly pass.
- **Every current write path that can change hash-relevant content was enumerated by reading the code** (`entries.ts`, `entryEditProposals.ts`, `series.ts`, `admin.ts`, and a grep of all `prisma.{entry,series,book,inflection}.{create,update,delete,upsert}` calls in `apps/api/src`):
  1. `entries.ts` `POST /api/series/:slug/entries` — `tx.entry.create` — hash-relevant only when `isAdmin` (auto-`APPROVED`, enters the hashed set immediately).
  2. `entries.ts` `POST /api/admin/entries/:id/approve` — `tx.entry.update` PENDING→APPROVED — always hash-relevant.
  3. `entries.ts` `POST /api/admin/entries/:id/reject` — PENDING→REJECTED — not hash-relevant given the existing `if (entry.approvalStatus !== "PENDING") throw` guard (a PENDING row was never in the hashed set).
  4. `entryEditProposals.ts`'s shared `applyEditProposalToEntry(tx, entry, proposal, reviewerId)` — always hash-relevant; called from both the admin-self-approve branch of `POST /api/entries/:id/edit-proposals` and from `POST /api/admin/entry-edit-proposals/:id/approve`.
  5. `series.ts` `PATCH /api/series/:slug` — updates `title`/`description`, both fed into `SeriesInput` by `mapping.ts::loadSeriesInputs`.
  6. `series.ts` `POST /api/series` (create) — new series always has `contentHash: null`.
  7. `jobs/build.ts` success path — this is a **clear**, not a **mark**.
  - No `Book` write route exists anywhere yet, and no `Entry` delete/soft-delete route exists either (both grepped, zero hits). These are documented gaps: whenever either is added, it must call the dirty-marking helper too.
- **Tests that simulate content changes via raw `prisma.entry.update(...)`** (`tests/sweep.test.ts`, `tests/sweepRebuild.test.ts`) bypass the route layer entirely, so they never trigger route-level dirty-marking. Read in full during planning; one existing scenario (`sweep.test.ts`'s "an edit reverted to its exact prior state...") would otherwise start passing vacuously — the series would never become a sweep candidate at all under the new query, so its intended hash-equality check would never run. Both files' raw-mutation helpers must call the new dirty-marking function directly to keep exercising real behavior.

## Goals / Non-Goals

**Goals:**
- Normal hourly sweep work scales with the number of series that actually changed (or have never been built), not total corpus size.
- Preserve every existing externally-observable guarantee of the sweep (see the "Hourly Change-Detection Sweep" spec scenarios) exactly.
- Provide a safety net that does not trust the new marker, so a bug in dirty-marking (present or future) cannot permanently stop a series from ever being rebuilt.
- Bound per-run concurrency and add basic instrumentation.

**Non-Goals:**
- Changing how or whether a build gets enqueued once a hash mismatch is found (COR-001's `deduplication`/retry semantics are untouched).
- Precise "how long has this series been dirty" instrumentation — the marker only needs to answer "is there unswept work," not preserve the earliest dirty timestamp across repeated edits.
- Retrofitting dirty-marking for `Book` or `Entry`-delete write paths that don't exist yet (documented as gaps the reconciliation job covers if they're ever added without updating this mechanism).
- Making the sweep/reconciliation interval configurable via a new environment variable — both are plain literals, matching `dictionaryBuildWorker`'s own hardcoded `concurrency: 2` and this session's established precedent (PROD-006) of using an independent literal cron rather than reusing or exposing a new config knob for an unrelated schedule.

## Decisions

### 1. `Series.dirtySince DateTime?` column, not a separate table

```prisma
model Series {
  // ...existing fields...
  dirtySince  DateTime?

  @@index([dirtySince])
}
```

A nullable column needs no cascade-delete handling (dropped with the `Series` row) and is the smallest possible additive migration. Alternative considered: a separate `DirtySeries` table (id = seriesId) acting as a work queue. Rejected — it would need its own cascade-delete-on-series-delete handling and gains nothing here given the confirmed small scale (SPEC.md's dev seed and scope description suggest low hundreds of series at most).

Every dirty-marking write sets `dirtySince: new Date()` unconditionally (not "only if currently null") — simplest, and sufficient since the sweep only checks `IS NOT NULL`.

### 2. `markSeriesDirty(tx, seriesId)` in `apps/api/src/lib/dirtySeries.ts`

```ts
import type { Prisma } from "@prisma/client";

/**
 * Marks a series as having possibly-changed hashed content since it was
 * last checked by the sweep (PERF-001). Call this in the SAME transaction
 * as any write that changes a series' Published+Approved entries/
 * inflections or its own title/description/language/book fields - the
 * hourly sweep only hash-checks series with this marker set (or with no
 * successful build yet), so a write that changes hashed content without
 * calling this can go unswept until the next full reconciliation pass.
 * This includes test fixtures that write hash-relevant content directly
 * via Prisma, bypassing the routes below - see tests/sweep.test.ts and
 * tests/sweepRebuild.test.ts for the pattern.
 */
export async function markSeriesDirty(tx: Prisma.TransactionClient, seriesId: string): Promise<void> {
  await tx.series.update({ where: { id: seriesId }, data: { dirtySince: new Date() } });
}
```

Called from:
- `entries.ts`: inside the existing transaction in the admin-auto-approved branch of entry creation, and inside the existing transaction in the approve handler.
- `entryEditProposals.ts`: once, inside `applyEditProposalToEntry` itself (covers both call sites that invoke it).

`series.ts`'s `PATCH` handler folds `dirtySince: new Date()` directly into its existing single-row `series.update({ data: { title, description, ... } })` call instead of calling the helper — it's already updating the same `Series` row, so no second statement or transaction is needed.

`POST /api/series` (create) and the reject handler are deliberately **not** touched:
- Create: a new series already has `contentHash: null`, which the candidate query (Decision 3) always treats as a candidate.
- Reject: the existing `if (entry.approvalStatus !== "PENDING") throw ALREADY_REVIEWED()` guard means a PENDING→REJECTED transition never removes anything from the hashed set. A code comment at that call site ties this omission to the guard, so a future change that loosens it is forced to reconsider.

### 3. Proportional candidate query

```ts
const candidates = await prisma.series.findMany({
  where: { OR: [{ dirtySince: { not: null } }, { contentHash: null }] },
  select: { id: true, contentHash: true, dirtySince: true },
});
```

Replaces the current unconditional `findMany({})`. This is the change that makes normal hourly work proportional to changed-or-new series (acceptance criterion 1).

### 4. Shared per-series check, with a race-safe clear

Both the sweep and the reconciliation job need identical hash-check-and-enqueue logic, so it's extracted once:

```ts
async function checkAndMaybeEnqueue(
  prisma: PrismaClient,
  queue: Queue,
  series: { id: string; contentHash: string | null; dirtySince: Date | null }
): Promise<{ enqueued: boolean }> {
  const { series: seriesInput, entries } = await loadSeriesInputs(prisma, series.id);
  const hash = computeContentHash(seriesInput, entries);

  if (hash === series.contentHash) {
    // Compare-and-swap: only clear if dirtySince still has the value we
    // read at candidate-selection time. If a concurrent write changed it
    // (a real edit that landed while this check was in flight), the WHERE
    // no longer matches, the update becomes a no-op, and the newer mark
    // survives for the next run - the same technique auth.ts (SEC-002)
    // already uses for atomic token-claim races.
    await prisma.series.updateMany({
      where: { id: series.id, dirtySince: series.dirtySince },
      data: { dirtySince: null },
    });
    return { enqueued: false };
  }

  await queue.add(
    "dictionary-build",
    { seriesId: series.id },
    { ...BUILD_JOB_RETRY_OPTIONS, deduplication: { id: series.id, keepLastIfActive: true } }
  );
  return { enqueued: true };
}
```

No change to the enqueue call itself — same `deduplication` shape COR-001 established.

**Why the CAS matters here specifically**: without it, a blind `data: { dirtySince: null }` write could erase a dirty mark set by a concurrent edit that landed between this function's `loadSeriesInputs` read and its clearing write — silently losing a real, pending change until the next reconciliation run (hours later). This is exactly the shape of race `auth.ts:283-287` (SEC-002) already solved for token consumption; the same `updateMany`-keyed-on-the-value-just-read pattern applies directly.

### 5. Bounded concurrency: a small in-house helper, no new dependency

`package.json` has no `p-limit`/`p-queue`/similar already. Checked before deciding — not worth adding a dependency for this:

```ts
const SWEEP_CONCURRENCY = 5;

async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
```

`SWEEP_CONCURRENCY` is a plain exported constant, not an environment variable — matches `dictionaryBuildWorker`'s own hardcoded `concurrency: 2` in `worker.ts`, and this codebase's demonstrated preference (this session, PROD-006) for a literal over a new config knob when a value isn't genuinely meant to vary per environment. 5 is chosen against the confirmed small scale (SPEC.md: no documented "large" dataset; dev seed is 2 series/~50 entries; scope description frames this as fan-built, series-specific glossaries, realistically low hundreds of series at most) — enough to meaningfully parallelize a burst of simultaneously-dirtied series without meaningfully increasing peak DB load.

### 6. `runSweep` and `runReconciliation`

```ts
export async function runSweep(prisma: PrismaClient, queue: Queue): Promise<void> {
  const start = Date.now();
  const candidates = await prisma.series.findMany({
    where: { OR: [{ dirtySince: { not: null } }, { contentHash: null }] },
    select: { id: true, contentHash: true, dirtySince: true },
  });

  let enqueued = 0;
  await withConcurrency(candidates, SWEEP_CONCURRENCY, async (series) => {
    if ((await checkAndMaybeEnqueue(prisma, queue, series)).enqueued) enqueued++;
  });

  console.log(`[sweep] checked ${candidates.length} dirty/new series, enqueued ${enqueued} build(s) in ${Date.now() - start}ms`);
}

export async function runReconciliation(prisma: PrismaClient, queue: Queue): Promise<void> {
  const start = Date.now();
  const allSeries = await prisma.series.findMany({
    select: { id: true, contentHash: true, dirtySince: true },
  });

  let enqueued = 0;
  let missed = 0;
  await withConcurrency(allSeries, SWEEP_CONCURRENCY, async (series) => {
    const result = await checkAndMaybeEnqueue(prisma, queue, series);
    if (result.enqueued) {
      enqueued++;
      if (series.dirtySince === null) missed++;
    }
  });

  console.log(
    `[reconcile] checked ${allSeries.length} series (full corpus), enqueued ${enqueued} build(s), ${missed} missed by dirty-tracking, in ${Date.now() - start}ms`
  );
}
```

`runReconciliation` deliberately ignores `dirtySince` at the query level (selects every series) — it doesn't trust the marker at all, it just re-derives ground truth from the hash, which is what makes "a reconciliation path can still detect missed dirty markers" true rather than aspirational. The `missed` counter (a mismatch found on a series whose `dirtySince` was `null`) is the concrete signal that some write path isn't calling `markSeriesDirty` when it should.

Incrementing plain local counters (`enqueued`, `missed`) from inside `withConcurrency`'s parallel callbacks is safe: Node is single-threaded and each increment happens synchronously within one callback invocation, not split across an `await`.

### 7. `worker.ts` wiring

```ts
const RECONCILE_ALL_SERIES_CRON = "0 3 * * *"; // daily, off-peak - independent of config.buildCron

async function processDictionaryBuildQueueJob(job: Job): Promise<void> {
  if (job.name === "sweep-changed-series") {
    await runSweep(prisma, dictionaryBuildQueue);
    return;
  }
  if (job.name === "reconcile-all-series") {
    await runReconciliation(prisma, dictionaryBuildQueue);
    return;
  }
  const { seriesId } = job.data as { seriesId: string };
  await processDictionaryBuild(prisma, { putObject }, seriesId);
  await maintenanceQueue.add("prune-series", { seriesId });
}

await dictionaryBuildQueue.upsertJobScheduler(
  "reconcile-all-series",
  { pattern: RECONCILE_ALL_SERIES_CRON },
  { name: "reconcile-all-series", data: {} }
);
```

A literal cron string, not `config.buildCron` — the same reasoning this session already applied to the email-outbox reconciliation job (`add-email-outbox` design.md): an unrelated schedule shouldn't be hidden-coupled to the hourly sweep's own tunable, so an operator changing one cadence doesn't silently change the other. Registered on the same `dictionary-build` queue and using `upsertJobScheduler`, so it's idempotent across worker redeploys exactly like `sweep-changed-series` already is.

### 8. `build.ts`'s success path clears the marker, race-safely

The current success transaction:

```ts
await prisma.$transaction([
  prisma.build.update({ where: { id: build.id }, data: { status: "SUCCESS", ... } }),
  prisma.series.update({ where: { id: seriesId }, data: { contentHash } }),
]);
```

becomes (reading `dirtySince` once at the top of `processDictionaryBuild`, before `loadSeriesInputs`, to minimize the race window and to have a value to CAS against):

```ts
const before = await prisma.series.findUniqueOrThrow({ where: { id: seriesId }, select: { dirtySince: true } });
// ...loadSeriesInputs, computeContentHash, build.create, buildDictionaryFiles, putObject calls unchanged...

await prisma.$transaction([
  prisma.build.update({ where: { id: build.id }, data: { status: "SUCCESS", ... } }),
  prisma.series.updateMany({
    where: { id: seriesId, dirtySince: before.dirtySince },
    data: { contentHash },
  }),
]);
```

Same CAS reasoning as Decision 4: an edit that lands while this build is running (after `before` is read, before this transaction commits) sets a newer `dirtySince`, which this `updateMany`'s `WHERE` then no longer matches — the clear no-ops, `contentHash` still gets updated (via a separate statement if needed — see note below), and the newer dirty mark survives so the next sweep picks up the just-landed edit instead of silently missing it.

**Note**: switching `series.update` to `series.updateMany` in the transaction changes it from "throws if the row doesn't exist" to "silently affects 0 rows" if the `WHERE` doesn't match on `id` (it always will, absent a concurrent series deletion) — the only realistic way this `updateMany` affects 0 rows is the CAS race itself, in which case `contentHash` still needs to be set. Implementation should structure this as **two separate statements** in the array (`series.update({ where: { id }, data: { contentHash } })` unconditionally, plus `series.updateMany({ where: { id, dirtySince: before.dirtySince }, data: { dirtySince: null } })` conditionally) rather than one combined statement, so a lost CAS race on the dirty-clear never risks also skipping the `contentHash` update itself.

## Risks / Trade-offs

- **[Risk] A future write path (a `Book` route, an `Entry` delete route) forgets to call `markSeriesDirty`.** → Mitigation: the daily reconciliation job (Decision 6) re-derives truth from the hash regardless of the marker, so such a gap causes at most a one-day delay before self-correcting, and it's the one case reconciliation explicitly logs as a "missed" count — observable, not silent.
- **[Risk] `dirtySince` accumulates across many rapid edits without ever being "the earliest" edit time.** → Accepted trade-off, stated explicitly in Goals/Non-Goals: the marker only needs to answer "is there unswept work," not measure staleness duration precisely.
- **[Risk] Existing tests (`sweep.test.ts`, `sweepRebuild.test.ts`) simulate edits via raw `prisma.entry.update`, which never calls `markSeriesDirty`.** → Mitigation: both files' raw-mutation helpers are updated to call `markSeriesDirty` directly (tasks.md), matching the same contract a real write path now upholds; the alternative (rewriting them to go through `app.inject` against real routes) was considered but rejected as a larger, unrelated-to-this-finding test-architecture change for tests whose deliberate purpose is unit-testing `runSweep`'s own comparison logic in isolation from the route layer.
- **[Risk] The reconciliation job's full-corpus scan reintroduces exactly the O(corpus) cost this change is trying to remove.** → Accepted and intentional (per the finding's own `suggested_fix`: "Preserve a periodic reconciliation job as a safety net rather than making full re-hashing the primary trigger") — it just runs far less often (daily vs. hourly), so its contribution to total sweep-related DB load stays small.

## Migration Plan

Purely additive: one new nullable column + index on `Series`. No backfill needed — existing rows get `dirtySince: NULL`, which the candidate query already treats correctly (not a candidate unless `contentHash` is also `NULL`, i.e. never built). No rolling-compatibility split required (matches the `add-migration-deployment-safety` change's own additive-migration guidance). No rollback concerns beyond the standard additive-migration case.
