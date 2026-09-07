import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { normalizeWord } from "@planetos/shared";
import { computeContentHash } from "@planetos/kindle";
import { buildApp, cleanSeries } from "./helpers.js";
import { runSweep, runReconciliation, checkAndMaybeEnqueue } from "../src/jobs/sweep.js";
import { loadSeriesInputs } from "../src/jobs/mapping.js";

// PERF-001: the hourly sweep (runSweep) only checks series marked dirty or
// never built - these tests prove the periodic reconciliation (which checks
// every series regardless) is a real safety net, not just a duplicate of
// the sweep, and that the sweep's race-safe dirty-clear actually survives a
// concurrent edit landing mid-check.

const SLUG_PREFIX = "test-sweep-reconcile-series";

let prisma: PrismaClient;
let connection: Redis;
let queue: Queue;

async function createTestSeries(slugSuffix: string): Promise<{ id: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({ data: { slug, title: `Test Reconcile ${slugSuffix}` }, select: { id: true } });
}

async function createApprovedEntry(seriesId: string, headword: string, definitionHtml: string) {
  const entry = await prisma.entry.create({
    data: { seriesId, headword, sortKey: normalizeWord(headword), definitionHtml, status: "PUBLISHED", approvalStatus: "APPROVED" },
  });
  await prisma.seriesWord.create({ data: { seriesId, entryId: entry.id, normalizedWord: normalizeWord(headword) } });
  return entry;
}

async function currentHash(seriesId: string): Promise<string> {
  const { series, entries } = await loadSeriesInputs(prisma, seriesId);
  return computeContentHash(series, entries);
}

async function waitingJobIdsFor(seriesId: string): Promise<string[]> {
  const jobs = await queue.getJobs(["waiting", "delayed"]);
  return jobs.filter((job) => job.data.seriesId === seriesId).map((job) => job.id!);
}

beforeAll(async () => {
  ({ prisma } = await buildApp());
  connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  queue = new Queue("test-sweep-reconcile-dictionary-build", { connection });
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterEach(async () => {
  await queue.obliterate({ force: true });
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterAll(async () => {
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
});

describe("runReconciliation: catches what the sweep would miss", () => {
  it("a stale contentHash with dirtySince null is invisible to the sweep but caught by reconciliation", async () => {
    const series = await createTestSeries("missed-marker");
    const entry = await createApprovedEntry(series.id, "Wolf", "<p>Original.</p>");
    const originalHash = await currentHash(series.id);
    await prisma.series.update({ where: { id: series.id }, data: { contentHash: originalHash } });

    // Simulate a write path that changed content without calling
    // markSeriesDirty (the gap reconciliation exists for) - a raw update
    // with no accompanying dirty-mark.
    await prisma.entry.update({ where: { id: entry.id }, data: { definitionHtml: "<p>Changed, but not marked dirty.</p>" } });
    const row = await prisma.series.findUniqueOrThrow({ where: { id: series.id } });
    expect(row.dirtySince).toBeNull();

    await runSweep(prisma, queue);
    expect(await waitingJobIdsFor(series.id)).toHaveLength(0);

    await runReconciliation(prisma, queue);
    expect(await waitingJobIdsFor(series.id)).toHaveLength(1);
  });

  it("leaves an already-consistent series alone", async () => {
    const series = await createTestSeries("consistent");
    await createApprovedEntry(series.id, "Wolf", "<p>Unchanged.</p>");
    const hash = await currentHash(series.id);
    await prisma.series.update({ where: { id: series.id }, data: { contentHash: hash } });

    await runReconciliation(prisma, queue);

    expect(await waitingJobIdsFor(series.id)).toHaveLength(0);
  });
});

describe("checkAndMaybeEnqueue's dirty-clear survives a concurrent edit", () => {
  it("does not erase a dirty mark set after the candidate snapshot was read", async () => {
    const series = await createTestSeries("cas-race");
    await createApprovedEntry(series.id, "Wolf", "<p>Stable.</p>");
    const hash = await currentHash(series.id);
    const staleSnapshotTime = new Date(Date.now() - 60_000);
    await prisma.series.update({ where: { id: series.id }, data: { contentHash: hash, dirtySince: staleSnapshotTime } });

    // A concurrent write lands after the caller's candidate query already
    // read dirtySince (captured in `staleSnapshotTime` above) but before
    // checkAndMaybeEnqueue's own clear runs - simulated directly by moving
    // the row's real dirtySince forward before calling it with the stale
    // snapshot, exactly the race design.md Decision 4 describes.
    const concurrentEditTime = new Date();
    await prisma.series.update({ where: { id: series.id }, data: { dirtySince: concurrentEditTime } });

    // Content still matches the recorded hash (no rebuild needed), so this
    // takes the CAS-clear branch - keyed on the now-stale snapshot.
    const result = await checkAndMaybeEnqueue(prisma, queue, {
      id: series.id,
      contentHash: hash,
      dirtySince: staleSnapshotTime,
    });

    expect(result.enqueued).toBe(false);
    const after = await prisma.series.findUniqueOrThrow({ where: { id: series.id } });
    // The clear's WHERE no longer matched the row's actual dirtySince, so it
    // no-oped - the newer mark survives instead of being erased.
    expect(after.dirtySince?.getTime()).toBe(concurrentEditTime.getTime());
  });

  it("clears the dirty mark when no concurrent write has happened", async () => {
    const series = await createTestSeries("cas-clean-clear");
    await createApprovedEntry(series.id, "Wolf", "<p>Stable.</p>");
    const hash = await currentHash(series.id);
    const dirtyAt = new Date();
    await prisma.series.update({ where: { id: series.id }, data: { contentHash: hash, dirtySince: dirtyAt } });

    const result = await checkAndMaybeEnqueue(prisma, queue, { id: series.id, contentHash: hash, dirtySince: dirtyAt });

    expect(result.enqueued).toBe(false);
    const after = await prisma.series.findUniqueOrThrow({ where: { id: series.id } });
    expect(after.dirtySince).toBeNull();
  });
});
