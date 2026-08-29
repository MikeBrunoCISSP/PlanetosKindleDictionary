import type { PrismaClient } from "@prisma/client";

export interface PruneStorage {
  deleteObjects(keys: string[]): Promise<void>;
}

const RETENTION_COUNT = 10;

/**
 * SPEC.md §7 retention: keeps the RETENTION_COUNT most recent SUCCESS
 * builds per series. Older ones have their stored objects deleted and
 * epubKey/sourceKey nulled, but the Build row itself (status, contentHash,
 * entryCount, timestamps) is left intact for audit history - only object
 * storage is the actual cost being reclaimed. The single most recent
 * SUCCESS build is never touched, which also guarantees the download route
 * (always "most recent SUCCESS") can never resolve to a pruned build.
 */
export async function pruneOldBuilds(prisma: PrismaClient, storage: PruneStorage, seriesId: string): Promise<void> {
  const successfulBuilds = await prisma.build.findMany({
    where: { seriesId, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    select: { id: true, epubKey: true, sourceKey: true },
  });

  const toPrune = successfulBuilds.slice(RETENTION_COUNT);
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
