import type { PrismaClient } from "@prisma/client";
import type { Queue, JobsOptions } from "bullmq";
import { computeContentHash } from "@planetos/kindle";
import { loadSeriesInputs } from "./mapping.js";

// SPEC.md §7 "the build job": 3 retries with exponential backoff on
// failure. Shared by both the sweep's own enqueue call and the admin
// manual-rebuild route, so a forced rebuild gets the same retry behavior.
export const BUILD_JOB_RETRY_OPTIONS: Pick<JobsOptions, "attempts" | "backoff"> = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
};

// PERF-001: bounds how many series are hash-checked concurrently within one
// sweep/reconciliation run. A plain constant, not an env var - matches
// worker.ts's own hardcoded dictionaryBuildWorker concurrency, and the
// confirmed small scale (SPEC.md documents no "large" dataset) doesn't
// warrant a new per-environment knob.
const SWEEP_CONCURRENCY = 5;

/** Runs `fn` over `items` with at most `limit` concurrent calls in flight. */
async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker(): Promise<void> {
    while (index < items.length) {
      const item = items[index++]!;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export interface SeriesCandidate {
  id: string;
  contentHash: string | null;
  dirtySince: Date | null;
}

/**
 * Computes one series' current content hash and compares it to the hash
 * recorded for its most recent successful build - the sole thing that
 * decides whether a build is enqueued (SPEC.md §7: never use `updatedAt`
 * for this). On a match, clears the series' dirty marker via a
 * compare-and-swap keyed on the `dirtySince` value the caller read at
 * candidate-selection time: if a concurrent write has since set a *newer*
 * mark (a real edit that landed while this check was in flight), the
 * `WHERE` no longer matches, the clear silently no-ops, and the newer mark
 * survives for the next run instead of being erased - the same race-safe
 * pattern `auth.ts` (SEC-002) already uses for atomic token-claim races.
 */
export async function checkAndMaybeEnqueue(
  prisma: PrismaClient,
  queue: Queue,
  series: SeriesCandidate
): Promise<{ enqueued: boolean }> {
  const { series: seriesInput, entries } = await loadSeriesInputs(prisma, series.id);
  const hash = computeContentHash(seriesInput, entries);

  if (hash === series.contentHash) {
    await prisma.series.updateMany({
      where: { id: series.id, dirtySince: series.dirtySince },
      data: { dirtySince: null },
    });
    return { enqueued: false };
  }

  // No explicit jobId: a deterministic seriesId-hash jobId dedups against
  // ANY retained job with that id, including old completed ones, which
  // permanently suppresses a rebuild if content ever reverts to a
  // previously-built hash (COR-001). BullMQ's own duplicate-jobId check
  // short-circuits before `deduplication` is ever consulted, so the hash
  // must not go in jobId even alongside deduplication - that would
  // silently reintroduce the same bug. `deduplication` dedups by series
  // only (not by hash), and its dedup key is cleared by BullMQ on every
  // job finalization, so it can never accumulate stale state that blocks
  // a legitimate future rebuild. keepLastIfActive: true preserves the
  // original "one enqueue per outstanding build" behavior - a sweep
  // firing while a build for this series is already waiting or active
  // still enqueues only once.
  await queue.add(
    "dictionary-build",
    { seriesId: series.id },
    { ...BUILD_JOB_RETRY_OPTIONS, deduplication: { id: series.id, keepLastIfActive: true } }
  );
  return { enqueued: true };
}

/**
 * SPEC.md §7 "The hourly sweep": for every series marked dirty since it was
 * last checked, plus any series that has never had a successful build,
 * compute its current content hash and compare against Series.contentHash
 * (PERF-001 - previously this checked every series, every run; see
 * design.md for the write-path audit backing this candidate query). Only a
 * mismatch enqueues a build.
 */
export async function runSweep(prisma: PrismaClient, queue: Queue): Promise<void> {
  const start = Date.now();
  const candidates: SeriesCandidate[] = await prisma.series.findMany({
    where: { OR: [{ dirtySince: { not: null } }, { contentHash: null }] },
    select: { id: true, contentHash: true, dirtySince: true },
  });

  let enqueued = 0;
  await withConcurrency(candidates, SWEEP_CONCURRENCY, async (series) => {
    if ((await checkAndMaybeEnqueue(prisma, queue, series)).enqueued) enqueued++;
  });

  console.log(`[sweep] checked ${candidates.length} dirty/new series, enqueued ${enqueued} build(s) in ${Date.now() - start}ms`);
}

/**
 * PERF-001's safety net: unlike `runSweep`, this checks every series
 * regardless of its dirty marker - it doesn't trust the marker at all, it
 * just re-derives the truth from the hash, the same ultimate authority the
 * fast sweep already uses. Meant to run far less often than the hourly
 * sweep (see worker.ts). A mismatch found on a series whose `dirtySince`
 * was null is logged distinctly - the concrete signal that some write path
 * isn't calling markSeriesDirty when it should.
 */
export async function runReconciliation(prisma: PrismaClient, queue: Queue): Promise<void> {
  const start = Date.now();
  const allSeries: SeriesCandidate[] = await prisma.series.findMany({
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
