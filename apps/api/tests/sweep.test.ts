import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { normalizeWord } from "@planetos/shared";
import { buildApp, cleanSeries } from "./helpers.js";
import { runSweep } from "../src/jobs/sweep.js";

const SLUG_PREFIX = "test-sweep-series";

let prisma: PrismaClient;
let connection: Redis;
let queue: Queue;

async function createTestSeries(slugSuffix: string): Promise<{ id: string; slug: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: `Test Sweep Series ${slugSuffix}` },
    select: { id: true, slug: true },
  });
}

async function createApprovedEntry(seriesId: string, headword: string, definitionHtml = "<p>A definition.</p>") {
  const entry = await prisma.entry.create({
    data: {
      seriesId,
      headword,
      sortKey: normalizeWord(headword),
      definitionHtml,
      status: "PUBLISHED",
      approvalStatus: "APPROVED",
    },
  });
  await prisma.seriesWord.create({
    data: { seriesId, entryId: entry.id, normalizedWord: normalizeWord(headword) },
  });
  return entry;
}

async function waitingJobIdsFor(seriesId: string): Promise<string[]> {
  const jobs = await queue.getJobs(["waiting", "delayed"]);
  return jobs.filter((job) => job.data.seriesId === seriesId).map((job) => job.id!);
}

beforeAll(async () => {
  ({ prisma } = await buildApp());
  connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  queue = new Queue("test-sweep-dictionary-build", { connection });
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

describe("runSweep", () => {
  it("enqueues a build for a series with no prior contentHash", async () => {
    const series = await createTestSeries("no-prior-hash");
    await createApprovedEntry(series.id, "Wolf");

    await runSweep(prisma, queue);

    const jobIds = await waitingJobIdsFor(series.id);
    expect(jobIds).toHaveLength(1);
  });

  it("does not enqueue when the content hash already matches Series.contentHash", async () => {
    const series = await createTestSeries("unchanged");
    await createApprovedEntry(series.id, "Wolf");

    await runSweep(prisma, queue);
    await queue.obliterate({ force: true });

    // Simulate a successful build: the build job would set Series.contentHash
    // to the just-computed hash. Re-running the sweep with nothing changed
    // should then enqueue nothing.
    const jobs = await queue.getJobs(["waiting", "completed", "failed"]);
    void jobs;
    const { computeContentHash } = await import("@planetos/kindle");
    const { loadSeriesInputs } = await import("../src/jobs/mapping.js");
    const { series: seriesInput, entries } = await loadSeriesInputs(prisma, series.id);
    const hash = computeContentHash(seriesInput, entries);
    await prisma.series.update({ where: { id: series.id }, data: { contentHash: hash } });

    await runSweep(prisma, queue);

    const jobIds = await waitingJobIdsFor(series.id);
    expect(jobIds).toHaveLength(0);
  });

  it("running the sweep twice in a row with no intervening change enqueues nothing the second time", async () => {
    const series = await createTestSeries("twice-in-a-row");
    await createApprovedEntry(series.id, "Wolf");

    await runSweep(prisma, queue);
    const firstRunJobIds = await waitingJobIdsFor(series.id);
    expect(firstRunJobIds).toHaveLength(1);

    await runSweep(prisma, queue);
    const afterSecondRun = await waitingJobIdsFor(series.id);
    // Same jobId (deterministic on unchanged content hash) means BullMQ
    // dedups - still exactly one job, not two.
    expect(afterSecondRun).toHaveLength(1);
    expect(afterSecondRun[0]).toBe(firstRunJobIds[0]);
  });

  it("an edit reverted to its exact prior state does not trigger a rebuild once the base hash is recorded", async () => {
    const series = await createTestSeries("reverted-edit");
    const entry = await createApprovedEntry(series.id, "Wolf", "<p>Original definition.</p>");

    const { computeContentHash } = await import("@planetos/kindle");
    const { loadSeriesInputs } = await import("../src/jobs/mapping.js");
    const { series: seriesInput, entries } = await loadSeriesInputs(prisma, series.id);
    const originalHash = computeContentHash(seriesInput, entries);
    await prisma.series.update({ where: { id: series.id }, data: { contentHash: originalHash } });

    // Edit, then revert to the exact original text.
    await prisma.entry.update({ where: { id: entry.id }, data: { definitionHtml: "<p>Changed.</p>" } });
    await prisma.entry.update({ where: { id: entry.id }, data: { definitionHtml: "<p>Original definition.</p>" } });

    await runSweep(prisma, queue);

    const jobIds = await waitingJobIdsFor(series.id);
    expect(jobIds).toHaveLength(0);
  });

  it("multiple content changes between sweeps still enqueue exactly one build reflecting the final state", async () => {
    const series = await createTestSeries("multiple-changes");
    const entry = await createApprovedEntry(series.id, "Wolf", "<p>V1.</p>");

    await prisma.entry.update({ where: { id: entry.id }, data: { definitionHtml: "<p>V2.</p>" } });
    await prisma.entry.update({ where: { id: entry.id }, data: { definitionHtml: "<p>V3 final.</p>" } });

    await runSweep(prisma, queue);

    const jobIds = await waitingJobIdsFor(series.id);
    expect(jobIds).toHaveLength(1);

    const { computeContentHash } = await import("@planetos/kindle");
    const { loadSeriesInputs } = await import("../src/jobs/mapping.js");
    const { series: seriesInput, entries } = await loadSeriesInputs(prisma, series.id);
    const finalHash = computeContentHash(seriesInput, entries);
    expect(jobIds[0]).toBe(`${series.id}-${finalHash}`);
  });
});
