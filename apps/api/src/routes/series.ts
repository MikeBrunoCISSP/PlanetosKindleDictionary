import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  createSeriesSchema,
  updateSeriesSchema,
  type SeriesDto,
  type SeriesListItemDto,
} from "@planetos/shared";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors, isPrismaError } from "../lib/errors.js";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSeriesDto(series: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  inLanguage: string;
  outLanguage: string;
  createdAt: Date;
  createdById: string | null;
}): SeriesDto {
  return {
    id: series.id,
    slug: series.slug,
    title: series.title,
    description: series.description,
    inLanguage: series.inLanguage,
    outLanguage: series.outLanguage,
    createdAt: series.createdAt.toISOString(),
    createdById: series.createdById,
  };
}

function toSeriesListItem(series: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
}): SeriesListItemDto {
  return {
    id: series.id,
    slug: series.slug,
    title: series.title,
    description: series.description,
  };
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const seriesRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAdmin = makeRequireAdmin(prisma);

  fastify.get("/api/series", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const items = await prisma.series.findMany({
      select: { id: true, slug: true, title: true, description: true },
      orderBy: { title: "asc" },
      skip,
      take: query.limit,
    });

    return reply.status(200).send(items.map(toSeriesListItem));
  });

  fastify.get("/api/series/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const series = await prisma.series.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        inLanguage: true,
        outLanguage: true,
        createdAt: true,
        createdById: true,
      },
    });
    if (!series) throw Errors.NOT_FOUND();
    return reply.status(200).send(toSeriesDto(series));
  });

  fastify.post("/api/series", { preHandler: requireAdmin }, async (request, reply) => {
    const body = createSeriesSchema.parse(request.body);
    const userId = request.session.userId!;

    const baseSlug = slugify(body.title) || "series";
    let slug = baseSlug;
    let attempt = 1;

    while (true) {
      try {
        const created = await prisma.series.create({
          data: {
            slug,
            title: body.title,
            description: body.description,
            createdById: userId,
          },
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            inLanguage: true,
            outLanguage: true,
            createdAt: true,
            createdById: true,
          },
        });
        return reply.status(201).send(toSeriesDto(created));
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          attempt++;
          slug = `${baseSlug}-${attempt}`;
        } else {
          throw err;
        }
      }
    }
  });

  fastify.delete("/api/series/:slug", { preHandler: requireAdmin }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    try {
      await prisma.series.delete({ where: { slug } });
      return reply.status(204).send();
    } catch (err: unknown) {
      if (isPrismaError(err, "P2025")) throw Errors.NOT_FOUND();
      throw err;
    }
  });

  fastify.patch("/api/series/:slug", { preHandler: requireAdmin }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = updateSeriesSchema.parse(request.body);

    const data: { title?: string; description?: string } = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;

    try {
      const updated = await prisma.series.update({
        where: { slug },
        data,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          inLanguage: true,
          outLanguage: true,
          createdAt: true,
          createdById: true,
        },
      });
      return reply.status(200).send(toSeriesDto(updated));
    } catch (err: unknown) {
      if (isPrismaError(err, "P2025")) throw Errors.NOT_FOUND();
      throw err;
    }
  });
};

export default seriesRoutes;
