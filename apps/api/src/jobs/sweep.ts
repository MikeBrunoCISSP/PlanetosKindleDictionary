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
 * as of the last successful build). Only a mismatch enqueues a build - the
 * deterministic jobId makes repeated enqueues for the same resulting
 * content state a no-op (BullMQ dedups by jobId), so several edits within
 * one sweep interval still collapse to exactly one build.
 */
export async function runSweep(prisma: PrismaClient, queue: Queue): Promise<void> {
  const allSeries = await prisma.series.findMany({ select: { id: true, contentHash: true } });

  for (const series of allSeries) {
    const { series: seriesInput, entries } = await loadSeriesInputs(prisma, series.id);
    const hash = computeContentHash(seriesInput, entries);

    if (hash === series.contentHash) continue;

    // BullMQ custom job ids cannot contain ":" (reserved for its own Redis
    // key namespacing), so this uses "-" as the separator rather than the
    // literal "seriesId:hash" form SPEC.md's prose example shows - same
    // dedup semantics, just a BullMQ-safe delimiter.
    await queue.add(
      "dictionary-build",
      { seriesId: series.id },
      { jobId: `${series.id}-${hash}`, ...BUILD_JOB_RETRY_OPTIONS }
    );
  }
}
