import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors } from "../lib/errors.js";
import { getPresignedDownloadUrl } from "../lib/storage.js";
import { getDictionaryBuildQueue } from "../lib/queues.js";
import { BUILD_JOB_RETRY_OPTIONS } from "../jobs/sweep.js";
import { buildDictionaryFilename } from "../lib/filename.js";

interface BuildListItemDto {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  createdAt: string;
  entryCount: number;
}

function toBuildListItem(build: {
  id: string;
  status: string;
  createdAt: Date;
  entryCount: number;
}): BuildListItemDto {
  return {
    id: build.id,
    status: build.status as BuildListItemDto["status"],
    createdAt: build.createdAt.toISOString(),
    entryCount: build.entryCount,
  };
}

const downloadsRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAdmin = makeRequireAdmin(prisma);

  // Admin-only immediate rebuild - bypasses the sweep's hash comparison
  // entirely. Uses a fresh unique jobId (not the deterministic
  // seriesId-hash form sweep.ts uses) since the point is forcing a build
  // regardless of whether content actually changed.
  fastify.post(
    "/api/series/:slug/rebuild",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const series = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
      if (!series) throw Errors.NOT_FOUND();

      const job = await getDictionaryBuildQueue().add(
        "dictionary-build",
        { seriesId: series.id },
        BUILD_JOB_RETRY_OPTIONS
      );

      return reply.status(202).send({ jobId: job.id });
    }
  );

  fastify.get("/api/series/:slug/download", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const series = await prisma.series.findUnique({ where: { slug }, select: { id: true, title: true } });
    if (!series) throw Errors.NOT_FOUND();

    const build = await prisma.build.findFirst({
      where: { seriesId: series.id, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { epubKey: true, createdAt: true },
    });
    if (!build?.epubKey) throw Errors.NO_BUILD_AVAILABLE();

    const filename = buildDictionaryFilename(series.title, build.createdAt);
    const url = await getPresignedDownloadUrl(build.epubKey, 300, filename);
    return reply.status(302).redirect(url);
  });

  fastify.get("/api/series/:slug/download/source", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const series = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
    if (!series) throw Errors.NOT_FOUND();

    const build = await prisma.build.findFirst({
      where: { seriesId: series.id, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { sourceKey: true },
    });
    if (!build?.sourceKey) throw Errors.NO_BUILD_AVAILABLE();

    const url = await getPresignedDownloadUrl(build.sourceKey);
    return reply.status(302).redirect(url);
  });

  // Public listing for the all-dictionaries download page - only series with
  // at least one successful build (nothing to download otherwise), lean
  // DTO (slug/title only, no build metadata - the actual filename is
  // decided server-side at download time by the route above).
  fastify.get("/api/downloads", async (_request, reply) => {
    const series = await prisma.series.findMany({
      where: { builds: { some: { status: "SUCCESS" } } },
      select: { slug: true, title: true },
      orderBy: { title: "asc" },
    });
    return reply.status(200).send(series);
  });

  // Public build history - lean DTO only (status/createdAt/entryCount);
  // error/log are internal diagnostic detail, deliberately never exposed
  // to a non-admin caller.
  fastify.get("/api/series/:slug/builds", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const series = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
    if (!series) throw Errors.NOT_FOUND();

    const builds = await prisma.build.findMany({
      where: { seriesId: series.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, entryCount: true },
    });

    return reply.status(200).send(builds.map(toBuildListItem));
  });
};

export default downloadsRoutes;
