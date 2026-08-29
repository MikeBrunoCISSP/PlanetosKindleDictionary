import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeWord } from "@planetos/shared";
import { buildApp, cleanSeries } from "./helpers.js";
import { processDictionaryBuild } from "../src/jobs/build.js";
import * as storage from "../src/lib/storage.js";

const SLUG_PREFIX = "test-build-series";

let prisma: PrismaClient;

async function createTestSeries(slugSuffix: string): Promise<{ id: string; slug: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: `Test Build Series ${slugSuffix}` },
    select: { id: true, slug: true },
  });
}

async function createEntry(
  seriesId: string,
  headword: string,
  options: { status?: "PUBLISHED" | "DELETED"; approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" } = {}
) {
  const { status = "PUBLISHED", approvalStatus = "APPROVED" } = options;
  const entry = await prisma.entry.create({
    data: {
      seriesId,
      headword,
      sortKey: normalizeWord(headword),
      definitionHtml: `<p>Definition of ${headword}.</p>`,
      status,
      approvalStatus,
    },
  });
  await prisma.seriesWord.create({
    data: { seriesId, entryId: entry.id, normalizedWord: normalizeWord(headword) },
  });
  return entry;
}

async function downloadObject(key: string): Promise<Buffer> {
  const url = await storage.getPresignedDownloadUrl(key);
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

function extractText(zipBuffer: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "kindle-build-test-"));
  const zipPath = join(dir, "out.zip");
  writeFileSync(zipPath, zipBuffer);
  try {
    return execFileSync("unzip", ["-p", zipPath], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

describe("processDictionaryBuild", () => {
  it("succeeds end-to-end: Build row reaches SUCCESS, real non-empty zip objects are uploaded, Series.contentHash updates", async () => {
    const series = await createTestSeries("success");
    await createEntry(series.id, "Wolf");

    const result = await processDictionaryBuild(prisma, storage, series.id);

    const build = await prisma.build.findUniqueOrThrow({ where: { id: result.buildId } });
    expect(build.status).toBe("SUCCESS");
    expect(build.entryCount).toBe(1);
    expect(build.contentHash).toBeTruthy();
    expect(build.epubKey).toBe(`builds/${series.id}/${build.id}/dictionary.epub`);
    expect(build.sourceKey).toBe(`builds/${series.id}/${build.id}/sources.zip`);
    expect(build.epubBytes).toBeGreaterThan(0);
    expect(build.finishedAt).not.toBeNull();

    const epubBytes = await downloadObject(build.epubKey!);
    expect(epubBytes.length).toBeGreaterThan(0);
    const epubText = extractText(epubBytes);
    expect(epubText).toContain("Wolf");

    const updatedSeries = await prisma.series.findUniqueOrThrow({ where: { id: series.id } });
    expect(updatedSeries.contentHash).toBe(build.contentHash);
  });

  it("marks the Build FAILED with error detail and does not update Series.contentHash when storage throws", async () => {
    const series = await createTestSeries("failure");
    await createEntry(series.id, "Wolf");

    const failingStorage = {
      putObject: async () => {
        throw new Error("simulated storage failure");
      },
    };

    await expect(processDictionaryBuild(prisma, failingStorage, series.id)).rejects.toThrow(
      "simulated storage failure"
    );

    const build = await prisma.build.findFirstOrThrow({ where: { seriesId: series.id } });
    expect(build.status).toBe("FAILED");
    expect(build.error).toContain("simulated storage failure");
    expect(build.epubKey).toBeNull();

    const updatedSeries = await prisma.series.findUniqueOrThrow({ where: { id: series.id } });
    expect(updatedSeries.contentHash).toBeNull();
  });

  it("only includes Published+Approved entries, excluding Pending, Rejected, and Deleted", async () => {
    const series = await createTestSeries("filter");
    await createEntry(series.id, "ApprovedWord");
    await createEntry(series.id, "PendingWord", { approvalStatus: "PENDING" });
    await createEntry(series.id, "RejectedWord", { approvalStatus: "REJECTED" });
    await createEntry(series.id, "DeletedWord", { status: "DELETED" });

    const result = await processDictionaryBuild(prisma, storage, series.id);
    const build = await prisma.build.findUniqueOrThrow({ where: { id: result.buildId } });
    expect(build.entryCount).toBe(1);

    const epubText = extractText(await downloadObject(build.epubKey!));
    expect(epubText).toContain("ApprovedWord");
    expect(epubText).not.toContain("PendingWord");
    expect(epubText).not.toContain("RejectedWord");
    expect(epubText).not.toContain("DeletedWord");
  });

  it("a new build never modifies the objects of a prior successful build", async () => {
    const series = await createTestSeries("no-overwrite");
    await createEntry(series.id, "FirstWord");

    const first = await processDictionaryBuild(prisma, storage, series.id);
    const firstBuild = await prisma.build.findUniqueOrThrow({ where: { id: first.buildId } });
    const firstContentBefore = extractText(await downloadObject(firstBuild.epubKey!));

    await createEntry(series.id, "SecondWord");
    const second = await processDictionaryBuild(prisma, storage, series.id);
    expect(second.buildId).not.toBe(first.buildId);

    const firstContentAfter = extractText(await downloadObject(firstBuild.epubKey!));
    expect(firstContentAfter).toBe(firstContentBefore);
    expect(firstContentAfter).toContain("FirstWord");
    expect(firstContentAfter).not.toContain("SecondWord");
  });
});
