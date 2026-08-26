import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import {
  createEntrySchema,
  normalizeWord,
  rejectEntrySchema,
  type EntryDto,
  type EntrySummaryDto,
  type PublicEntryDto,
} from "@planetos/shared";
import { sanitizeDefinitionHtml } from "@planetos/shared/sanitize";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { makeRequireAuth, makeRequireApproved } from "../plugins/requireAuth.js";
import { Errors, isPrismaError } from "../lib/errors.js";

type EntryWithInflections = {
  id: string;
  seriesId: string;
  headword: string;
  definitionHtml: string;
  inflections: { id: string; value: string }[];
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  submittedById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  rejectionNote: string | null;
  createdAt: Date;
};

export function toEntryDto(entry: EntryWithInflections): EntryDto {
  return {
    id: entry.id,
    seriesId: entry.seriesId,
    headword: entry.headword,
    definitionHtml: entry.definitionHtml,
    inflections: entry.inflections.map((inflection) => ({ id: inflection.id, value: inflection.value })),
    approvalStatus: entry.approvalStatus,
    submittedById: entry.submittedById,
    reviewedById: entry.reviewedById,
    reviewedAt: entry.reviewedAt ? entry.reviewedAt.toISOString() : null,
    rejectionNote: entry.rejectionNote,
    createdAt: entry.createdAt.toISOString(),
  };
}

function toEntrySummaryDto(entry: { id: string; headword: string; createdAt: Date }): EntrySummaryDto {
  return { id: entry.id, headword: entry.headword, createdAt: entry.createdAt.toISOString() };
}

function toPublicEntryDto(entry: {
  id: string;
  seriesId: string;
  series: { slug: string };
  headword: string;
  definitionHtml: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  inflections: { id: string; value: string }[];
}): PublicEntryDto {
  return {
    id: entry.id,
    seriesId: entry.seriesId,
    seriesSlug: entry.series.slug,
    headword: entry.headword,
    definitionHtml: entry.definitionHtml,
    approvalStatus: entry.approvalStatus as "PENDING" | "APPROVED",
    inflections: entry.inflections.map((inflection) => ({ id: inflection.id, value: inflection.value })),
  };
}

export const entryInclude = { inflections: { select: { id: true, value: true } } } as const;

const entriesRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAuth = makeRequireAuth(prisma);
  const requireApproved = makeRequireApproved(prisma);
  const requireAdmin = makeRequireAdmin(prisma);

  // Public entry detail. Pending entries are shown too (with the approval
  // status surfaced for the frontend's "awaiting review" banner) - only
  // Rejected and soft-Deleted entries are treated as not found.
  fastify.get("/api/entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await prisma.entry.findUnique({
      where: { id },
      include: { inflections: { select: { id: true, value: true } }, series: { select: { slug: true } } },
    });

    if (!entry || entry.status !== "PUBLISHED" || entry.approvalStatus === "REJECTED") {
      throw Errors.NOT_FOUND();
    }

    return reply.status(200).send(toPublicEntryDto(entry));
  });

  fastify.post(
    "/api/series/:slug/entries",
    { preHandler: requireApproved },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = createEntrySchema.parse(request.body);
      const userId = request.authUser!.id;
      const isAdmin = request.authUser!.role === "ADMIN";

      const series = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
      if (!series) throw Errors.NOT_FOUND();

      const definitionHtml = sanitizeDefinitionHtml(body.definitionHtml);
      const sortKey = normalizeWord(body.headword);

      try {
        const entry = await prisma.$transaction(
          async (tx) => {
            const created = await tx.entry.create({
              data: {
                seriesId: series.id,
                headword: body.headword,
                sortKey,
                definitionHtml,
                approvalStatus: isAdmin ? "APPROVED" : "PENDING",
                submittedById: userId,
                // An administrator's own submission is self-reviewed
                // immediately - see proposal.md/design.md for
                // admin-auto-approve-submissions.
                ...(isAdmin ? { reviewedById: userId, reviewedAt: new Date() } : {}),
              },
            });

            await tx.seriesWord.create({
              data: {
                seriesId: series.id,
                entryId: created.id,
                normalizedWord: normalizeWord(body.headword),
              },
            });

            for (const value of body.inflections) {
              const inflection = await tx.inflection.create({
                data: { entryId: created.id, value },
              });
              await tx.seriesWord.create({
                data: {
                  seriesId: series.id,
                  entryId: created.id,
                  inflectionId: inflection.id,
                  normalizedWord: normalizeWord(value),
                },
              });
            }

            await tx.revision.create({
              data: {
                entryId: created.id,
                authorId: userId,
                action: "CREATE",
                snapshot: {
                  headword: created.headword,
                  definitionHtml: created.definitionHtml,
                  inflections: body.inflections,
                  approvalStatus: created.approvalStatus,
                },
              },
            });

            return tx.entry.findUniqueOrThrow({ where: { id: created.id }, include: entryInclude });
          },
          { isolationLevel: "Serializable" }
        );

        return reply.status(201).send(toEntryDto(entry));
      } catch (err: unknown) {
        if (isPrismaError(err, "P2002")) throw Errors.DUPLICATE_WORD();
        throw err;
      }
    }
  );

  // Existing words (headwords + inflections) in a dictionary, for client-side
  // duplicate-word pre-checking in the Add Entry form. The server-side
  // create transaction remains the source of truth for uniqueness.
  fastify.get(
    "/api/series/:slug/entries/words",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const series = await prisma.series.findUnique({ where: { slug }, select: { id: true } });
      if (!series) throw Errors.NOT_FOUND();

      const entries = await prisma.entry.findMany({
        where: { seriesId: series.id },
        select: { headword: true, inflections: { select: { value: true } } },
      });

      const words = entries.flatMap((entry) => [
        entry.headword,
        ...entry.inflections.map((inflection) => inflection.value),
      ]);
      return reply.status(200).send(words);
    }
  );

  fastify.get(
    "/api/admin/entries/pending",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const entries = await prisma.entry.findMany({
        where: { approvalStatus: "PENDING" },
        select: { id: true, headword: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      return reply.status(200).send(entries.map(toEntrySummaryDto));
    }
  );

  fastify.get(
    "/api/admin/entries/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const entry = await prisma.entry.findUnique({ where: { id }, include: entryInclude });
      if (!entry) throw Errors.NOT_FOUND();
      return reply.status(200).send(toEntryDto(entry));
    }
  );

  fastify.post(
    "/api/admin/entries/:id/approve",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const adminId = request.adminUser!.id;

      const updated = await prisma.$transaction(async (tx) => {
        const entry = await tx.entry.findUnique({ where: { id } });
        if (!entry) throw Errors.NOT_FOUND();
        if (entry.approvalStatus !== "PENDING") throw Errors.ALREADY_REVIEWED();

        const result = await tx.entry.update({
          where: { id },
          data: { approvalStatus: "APPROVED", reviewedById: adminId, reviewedAt: new Date() },
          include: entryInclude,
        });

        await tx.revision.create({
          data: {
            entryId: id,
            authorId: adminId,
            action: "UPDATE",
            snapshot: {
              headword: result.headword,
              definitionHtml: result.definitionHtml,
              inflections: result.inflections.map((inflection) => inflection.value),
              approvalStatus: result.approvalStatus,
            },
          },
        });

        return result;
      });

      return reply.status(200).send(toEntryDto(updated));
    }
  );

  fastify.post(
    "/api/admin/entries/:id/reject",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = rejectEntrySchema.parse(request.body ?? {});
      const adminId = request.adminUser!.id;

      const updated = await prisma.$transaction(async (tx) => {
        const entry = await tx.entry.findUnique({ where: { id } });
        if (!entry) throw Errors.NOT_FOUND();
        if (entry.approvalStatus !== "PENDING") throw Errors.ALREADY_REVIEWED();

        const result = await tx.entry.update({
          where: { id },
          data: {
            approvalStatus: "REJECTED",
            reviewedById: adminId,
            reviewedAt: new Date(),
            rejectionNote: body.note ?? null,
          },
          include: entryInclude,
        });

        await tx.revision.create({
          data: {
            entryId: id,
            authorId: adminId,
            action: "UPDATE",
            snapshot: {
              headword: result.headword,
              definitionHtml: result.definitionHtml,
              inflections: result.inflections.map((inflection) => inflection.value),
              approvalStatus: result.approvalStatus,
              rejectionNote: result.rejectionNote,
            },
          },
        });

        return result;
      });

      return reply.status(200).send(toEntryDto(updated));
    }
  );
};

export default entriesRoutes;
