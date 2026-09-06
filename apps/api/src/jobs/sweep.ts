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

/**
 * SPEC.md §7 "The hourly sweep": for every series, compute its current
 * content hash and compare against Series.contentHash (the hash recorded
 * as of the last successful build). Only a mismatch enqueues a build -
 * BullMQ's `deduplication` option (keyed by series id, not by hash) makes
 * repeated enqueues while a build is already outstanding a no-op, so
 * several edits within one sweep interval still collapse to exactly one
 * build, without permanently blocking a later rebuild of a content state
 * that was already built once before (COR-001; see the comment on the
 * `add()` call below).
 */
export async function runSweep(prisma: PrismaClient, queue: Queue): Promise<void> {
  const allSeries = await prisma.series.findMany({ select: { id: true, contentHash: true } });

  for (const series of allSeries) {
    const { series: seriesInput, entries } = await loadSeriesInputs(prisma, series.id);
    const hash = computeContentHash(seriesInput, entries);

    if (hash === series.contentHash) continue;

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
  }
}
