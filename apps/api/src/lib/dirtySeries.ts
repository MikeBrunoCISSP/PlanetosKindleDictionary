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
