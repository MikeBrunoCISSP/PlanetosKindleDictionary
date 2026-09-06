import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { normalizeWord } from "@planetos/shared";
import { computeContentHash } from "@planetos/kindle";
import { buildApp, cleanSeries } from "./helpers.js";
import { runSweep } from "../src/jobs/sweep.js";
import { processDictionaryBuild } from "../src/jobs/build.js";
import { loadSeriesInputs } from "../src/jobs/mapping.js";
import * as storage from "../src/lib/storage.js";

// COR-001: proves the fixed dedup mechanism against real Redis, driving an
// actual Worker through completed builds (not just runSweep(), which every
// test in sweep.test.ts already exercises without ever letting a job
// actually finish - the retained-completed-job dedup bug can only surface
// once a job has genuinely completed).

const SLUG_PREFIX = "test-sweep-rebuild-series";
const QUEUE_NAME = "test-sweep-rebuild-dictionary-build";

let prisma: PrismaClient;
let connection: Redis;
let queue: Queue;

async function createTestSeries(slugSuffix: string): Promise<{ id: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({ data: { slug, title: `Test Sweep Rebuild ${slugSuffix}` }, select: { id: true } });
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

async function waitFor(predicate: () => Promise<boolean>, description: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

beforeAll(async () => {
  ({ prisma } = await buildApp());
  connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  queue = new Queue(QUEUE_NAME, { connection });
  await storage.ensureBucketExists();
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

describe("sweep + worker: content reverted to a previously-built state", () => {
  it("A -> B -> A produces a new successful A build each time, including on revert", async () => {
    const series = await createTestSeries("a-b-a");
    const entry = await createApprovedEntry(series.id, "Wolf", "<p>State A.</p>");

    const worker = new Worker(QUEUE_NAME, async (job) => processDictionaryBuild(prisma, storage, job.data.seriesId), {
      connection,
    });
    worker.on("error", () => {});

    try {
      const hashA = await currentHash(series.id);

      // Build A.
      await runSweep(prisma, queue);
      await waitFor(
        async () => (await prisma.series.findUniqueOrThrow({ where: { id: series.id } })).contentHash === hashA,
        "Series.contentHash to become hashA"
      );

      // Edit to B, build B.
      await prisma.entry.update({ where: { id: entry.id }, data: { definitionHtml: "<p>State B.</p>" } });
      const hashB = await currentHash(series.id);
      expect(hashB).not.toBe(hashA);
      await runSweep(prisma, queue);
      await waitFor(
        async () => (await prisma.series.findUniqueOrThrow({ where: { id: series.id } })).contentHash === hashB,
        "Series.contentHash to become hashB"
      );

      // Revert to A's exact original content - this is the call that
      // silently no-oped under the old deterministic-jobId scheme, because
      // a completed job for "seriesId-hashA" already existed in Redis.
      await prisma.entry.update({ where: { id: entry.id }, data: { definitionHtml: "<p>State A.</p>" } });
      const revertedHash = await currentHash(series.id);
      expect(revertedHash).toBe(hashA);
      await runSweep(prisma, queue);
      await waitFor(
        async () => (await prisma.series.findUniqueOrThrow({ where: { id: series.id } })).contentHash === hashA,
        "Series.contentHash to return to hashA after revert"
      );

      const builds = await prisma.build.findMany({ where: { seriesId: series.id }, orderBy: { startedAt: "asc" } });
      expect(builds).toHaveLength(3);
      expect(builds.every((b) => b.status === "SUCCESS")).toBe(true);
    } finally {
      await worker.close();
    }
  });
});

describe("sweep + worker: concurrent sweeps while a build is active", () => {
  it("a sweep firing while a build is active does not create a second visible job, and does not lose the request", async () => {
    const series = await createTestSeries("active-dedup");
    await createApprovedEntry(series.id, "Wolf", "<p>Active dedup content.</p>");

    let releaseFirst: () => void = () => {};
    const firstJobHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let callCount = 0;

    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        callCount++;
        if (callCount === 1) await firstJobHeld;
        return processDictionaryBuild(prisma, storage, job.data.seriesId);
      },
      { connection }
    );
    worker.on("error", () => {});

    try {
      await runSweep(prisma, queue);
      await waitFor(async () => {
        const active = await queue.getJobs(["active"]);
        return active.some((job) => job.data.seriesId === series.id);
      }, "first job to become active");

      // Content unchanged, but Series.contentHash hasn't advanced yet (the
      // active job hasn't finished) - the sweep still tries to enqueue.
      await runSweep(prisma, queue);

      const visible = await queue.getJobs(["waiting", "active"]);
      expect(visible.filter((job) => job.data.seriesId === series.id)).toHaveLength(1);

      releaseFirst();

      // BullMQ auto-promotes the stashed second request once the active job
      // finalizes - the request is deferred, not dropped. Confirm it runs
      // to completion, not just that its Build row was created.
      await waitFor(async () => {
        const builds = await prisma.build.findMany({ where: { seriesId: series.id } });
        return builds.length === 2 && builds.every((b) => b.status !== "RUNNING");
      }, "the deferred second build to reach a terminal state after the first completes");

      const builds = await prisma.build.findMany({ where: { seriesId: series.id } });
      expect(builds.every((b) => b.status === "SUCCESS")).toBe(true);
    } finally {
      await worker.close();
    }
  });
});
