import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { cleanSeries, buildApp } from "./helpers.js";
import { pruneOldBuilds } from "../src/jobs/prune.js";
import * as storage from "../src/lib/storage.js";

const SLUG_PREFIX = "test-prune-series";

let prisma: PrismaClient;

async function createTestSeries(slugSuffix: string): Promise<{ id: string }> {
  return prisma.series.create({
    data: { slug: `${SLUG_PREFIX}-${slugSuffix}`, title: `Test Prune Series ${slugSuffix}` },
    select: { id: true },
  });
}

async function createSuccessBuild(seriesId: string, index: number, createdAt: Date) {
  const epubKey = `builds/${seriesId}/build-${index}/dictionary.epub`;
  const sourceKey = `builds/${seriesId}/build-${index}/sources.zip`;
  await storage.putObject(epubKey, Buffer.from(`epub-${index}`), "application/epub+zip");
  await storage.putObject(sourceKey, Buffer.from(`sources-${index}`), "application/zip");

  return prisma.build.create({
    data: {
      seriesId,
      status: "SUCCESS",
      contentHash: `hash-${index}`,
      entryCount: 1,
      epubKey,
      sourceKey,
      epubBytes: 10,
      createdAt,
      finishedAt: createdAt,
    },
  });
}

async function objectExists(key: string): Promise<boolean> {
  try {
    const url = await storage.getPresignedDownloadUrl(key);
    const res = await fetch(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  ({ prisma } = await buildApp());
  await storage.ensureBucketExists();
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterEach(async () => {
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("pruneOldBuilds", () => {
  it("keeps the 10 most recent SUCCESS builds, prunes the rest, and never touches the newest", async () => {
    const series = await createTestSeries("twelve-builds");
    const base = Date.now();
    // index 0 = oldest, index 11 = newest
    const builds = [];
    for (let i = 0; i < 12; i++) {
      builds.push(await createSuccessBuild(series.id, i, new Date(base + i * 1000)));
    }

    await pruneOldBuilds(prisma, storage, series.id);

    const remaining = await prisma.build.findMany({
      where: { seriesId: series.id },
      orderBy: { createdAt: "desc" },
    });
    const withKeys = remaining.filter((b) => b.epubKey !== null);
    expect(withKeys).toHaveLength(10);

    // The 2 oldest (index 0 and 1) should be pruned.
    const oldest = builds[0]!;
    const secondOldest = builds[1]!;
    const prunedOldest = remaining.find((b) => b.id === oldest.id)!;
    const prunedSecondOldest = remaining.find((b) => b.id === secondOldest.id)!;
    expect(prunedOldest.epubKey).toBeNull();
    expect(prunedOldest.sourceKey).toBeNull();
    expect(prunedSecondOldest.epubKey).toBeNull();
    // Row itself (status, contentHash, entryCount) still present for audit history.
    expect(prunedOldest.status).toBe("SUCCESS");
    expect(prunedOldest.contentHash).toBe("hash-0");

    expect(await objectExists(oldest.epubKey!)).toBe(false);
    expect(await objectExists(oldest.sourceKey!)).toBe(false);

    // The newest build (index 11) must never be pruned, even if pruning runs again immediately.
    const newest = builds[11]!;
    await pruneOldBuilds(prisma, storage, series.id);
    const newestAfter = await prisma.build.findUniqueOrThrow({ where: { id: newest.id } });
    expect(newestAfter.epubKey).toBe(newest.epubKey);
    expect(await objectExists(newest.epubKey!)).toBe(true);
  });

  it("does nothing when there are 10 or fewer SUCCESS builds", async () => {
    const series = await createTestSeries("few-builds");
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      await createSuccessBuild(series.id, i, new Date(base + i * 1000));
    }

    await pruneOldBuilds(prisma, storage, series.id);

    const remaining = await prisma.build.findMany({ where: { seriesId: series.id } });
    expect(remaining.every((b) => b.epubKey !== null)).toBe(true);
  });
});
