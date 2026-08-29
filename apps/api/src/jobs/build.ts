import type { PrismaClient } from "@prisma/client";
import { buildDictionaryFiles, zipAsEpub, zipAsSourceArchive, computeContentHash } from "@planetos/kindle";
import { loadSeriesInputs } from "./mapping.js";

export interface BuildStorage {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/**
 * SPEC.md §7 "The build job": generates and stores one series' dictionary
 * EPUB + sources archive. Creates its own Build row (going straight to
 * RUNNING, matching SPEC's own 7-step list which starts there - no
 * separately-persisted QUEUED phase). On success, updates Series.contentHash
 * so the sweep won't re-enqueue this exact content state again. On any
 * throw, marks the Build FAILED with error detail and rethrows so BullMQ's
 * retry/backoff engages - the series' previous successful build (if any) is
 * never touched by a failing attempt.
 */
export async function processDictionaryBuild(
  prisma: PrismaClient,
  storage: BuildStorage,
  seriesId: string
): Promise<{ buildId: string }> {
  const { series, entries } = await loadSeriesInputs(prisma, seriesId);
  const contentHash = computeContentHash(series, entries);

  const build = await prisma.build.create({
    data: {
      seriesId,
      status: "RUNNING",
      contentHash,
      entryCount: entries.length,
      startedAt: new Date(),
    },
  });

  try {
    const files = buildDictionaryFiles(series, entries);
    const epubBuffer = zipAsEpub(files);
    const sourcesBuffer = zipAsSourceArchive(files);

    const epubKey = `builds/${seriesId}/${build.id}/dictionary.epub`;
    const sourceKey = `builds/${seriesId}/${build.id}/sources.zip`;

    await storage.putObject(epubKey, epubBuffer, "application/epub+zip");
    await storage.putObject(sourceKey, sourcesBuffer, "application/zip");

    await prisma.$transaction([
      prisma.build.update({
        where: { id: build.id },
        data: {
          status: "SUCCESS",
          epubKey,
          epubBytes: epubBuffer.length,
          sourceKey,
          finishedAt: new Date(),
        },
      }),
      // Only advance the series' "what's currently built" pointer once this
      // build has actually succeeded - never from the sweep or a failed attempt.
      prisma.series.update({ where: { id: seriesId }, data: { contentHash } }),
    ]);

    return { buildId: build.id };
  } catch (err: unknown) {
    await prisma.build.update({
      where: { id: build.id },
      data: { status: "FAILED", error: formatError(err), finishedAt: new Date() },
    });
    throw err;
  }
}
