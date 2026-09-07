import type { PrismaClient } from "@prisma/client";

export interface PruneStorage {
  deleteObjects(keys: string[]): Promise<void>;
}

const RETENTION_COUNT = 10;
// PERF-002: a hard safety valve for a pathological backlog (e.g. this job
// broken for a long time) - memory use per invocation is capped regardless
// of how large that backlog gets; it self-heals over subsequent
// invocations, each pruning up to this many more.
const PRUNE_BATCH_LIMIT = 500;

/**
 * SPEC.md §7 retention: keeps the RETENTION_COUNT most recent SUCCESS
 * builds per series. Older ones have their stored objects deleted and
 * epubKey/sourceKey nulled, but the Build row itself (status, contentHash,
 * entryCount, timestamps) is left intact for audit history - only object
 * storage is the actual cost being reclaimed. The single most recent
 * SUCCESS build is never touched, which also guarantees the download route
 * (always "most recent SUCCESS") can never resolve to a pruned build.
 *
 * PERF-002: the `OR` below (only rows that still have a key to prune) is
 * what makes this query's cost proportional to unswept backlog rather than
 * the series' entire historical SUCCESS count - once a row is pruned (both
 * keys nulled), it never matches this query again, so in steady state
 * (this job runs once per successful build) each invocation only sees the
 * delta since the last successful run, not the series' whole history.
 */
export async function pruneOldBuilds(prisma: PrismaClient, storage: PruneStorage, seriesId: string): Promise<void> {
  const toPrune = await prisma.build.findMany({
    where: {
      seriesId,
      status: "SUCCESS",
      OR: [{ epubKey: { not: null } }, { sourceKey: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    skip: RETENTION_COUNT,
    take: PRUNE_BATCH_LIMIT,
    select: { id: true, epubKey: true, sourceKey: true },
  });

  if (toPrune.length === 0) return;

  const keysToDelete = toPrune.flatMap((build) => [build.epubKey, build.sourceKey].filter((key) => key !== null));
  if (keysToDelete.length > 0) {
    await storage.deleteObjects(keysToDelete);
  }

  await prisma.build.updateMany({
    where: { id: { in: toPrune.map((build) => build.id) } },
    data: { epubKey: null, sourceKey: null },
  });
}
