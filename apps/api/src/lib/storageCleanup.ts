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
