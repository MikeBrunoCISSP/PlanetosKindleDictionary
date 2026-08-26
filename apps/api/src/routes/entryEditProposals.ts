import type { FastifyPluginAsync } from "fastify";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  submitEntryEditProposalSchema,
  rejectEntrySchema,
  normalizeWord,
  type EntryEditProposalDto,
  type PendingQueueItemDto,
} from "@planetos/shared";
import { sanitizeDefinitionHtml } from "@planetos/shared/sanitize";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { makeRequireAuth } from "../plugins/requireAuth.js";
import { Errors, isPrismaError } from "../lib/errors.js";
import { toEntryDto, entryInclude } from "./entries.js";

// Applies a proposal's proposed Definition/Inflections to its target entry,
// re-checking word conflicts, and marks the proposal reviewed - shared by
// the manual admin approve endpoint and the immediate self-approval path an
// administrator's own submission takes (see admin-auto-approve-submissions).
// Assumes the caller has already confirmed the proposal is Pending; the
// staleness check here still runs so both call sites stay structurally
// identical, even though it can never trip for a proposal applied inline
// within the same transaction it was created in.
async function applyEditProposalToEntry(
  tx: Prisma.TransactionClient,
  entry: {
    id: string;
    seriesId: string;
    updatedAt: Date;
    inflections: { id: string; value: string }[];
  },
  proposal: {
    id: string;
    proposedDefinitionHtml: string;
    baseEntryUpdatedAt: Date;
    inflections: { value: string }[];
  },
  reviewerId: string
) {
  if (entry.updatedAt.getTime() !== proposal.baseEntryUpdatedAt.getTime()) {
    throw Errors.STALE_ENTRY_REVISION();
  }

  const currentNormalized = new Set(entry.inflections.map((i) => normalizeWord(i.value)));
  const proposedNormalized = new Set(proposal.inflections.map((i) => normalizeWord(i.value)));

  const toAdd = proposal.inflections.filter((i) => !currentNormalized.has(normalizeWord(i.value)));
  const toRemove = entry.inflections.filter((i) => !proposedNormalized.has(normalizeWord(i.value)));

  if (toAdd.length > 0) {
    const conflict = await tx.seriesWord.findFirst({
      where: {
        seriesId: entry.seriesId,
        entryId: { not: entry.id },
        normalizedWord: { in: toAdd.map((i) => normalizeWord(i.value)) },
      },
    });
    if (conflict) throw Errors.DUPLICATE_WORD();
  }

  try {
    // Always executed, even if the definition text is unchanged, so
    // Entry.updatedAt reliably advances (see the schema comment on
    // Entry.updatedAt) - required for stale-revision detection to work.
    await tx.entry.update({
      where: { id: entry.id },
      data: { definitionHtml: proposal.proposedDefinitionHtml },
    });

    for (const inflection of toRemove) {
      await tx.inflection.delete({ where: { id: inflection.id } });
    }
    for (const inflection of toAdd) {
      const created = await tx.inflection.create({
        data: { entryId: entry.id, value: inflection.value },
      });
      await tx.seriesWord.create({
        data: {
          seriesId: entry.seriesId,
          entryId: entry.id,
          inflectionId: created.id,
          normalizedWord: normalizeWord(inflection.value),
        },
      });
    }
  } catch (err: unknown) {
    if (isPrismaError(err, "P2002")) throw Errors.DUPLICATE_WORD();
    throw err;
  }

  await tx.entryEditProposal.update({
    where: { id: proposal.id },
    data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: new Date() },
  });

  const result = await tx.entry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude });

  await tx.revision.create({
    data: {
      entryId: entry.id,
      authorId: reviewerId,
      action: "UPDATE",
      snapshot: {
        headword: result.headword,
        definitionHtml: result.definitionHtml,
        inflections: result.inflections.map((i) => i.value),
        approvalStatus: result.approvalStatus,
      },
    },
  });

  return result;
}

const entryEditProposalRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAuth = makeRequireAuth(prisma);
  const requireAdmin = makeRequireAdmin(prisma);

  // Submit a proposed edit to an already-Approved entry. Any authenticated
  // user may submit one (not gated by the account's own approval status) -
  // deliberately looser than entry creation's requireApproved.
  fastify.post(
    "/api/entries/:id/edit-proposals",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = submitEntryEditProposalSchema.parse(request.body);
      const userId = request.authUser!.id;
      const isAdmin = request.authUser!.role === "ADMIN";

      const entry = await prisma.entry.findUnique({
        where: { id },
        select: {
          id: true,
          seriesId: true,
          headword: true,
          status: true,
          approvalStatus: true,
          updatedAt: true,
          inflections: { select: { id: true, value: true } },
        },
      });

      if (!entry || entry.status !== "PUBLISHED" || entry.approvalStatus !== "APPROVED") {
        throw Errors.NOT_FOUND();
      }

      const definitionHtml = sanitizeDefinitionHtml(body.definitionHtml);
      const headwordNormalized = normalizeWord(entry.headword);
      const currentNormalized = new Set(entry.inflections.map((i) => normalizeWord(i.value)));

      if (body.inflections.some((value) => normalizeWord(value) === headwordNormalized)) {
        throw Errors.DUPLICATE_WORD();
      }

      try {
        const proposal = await prisma.$transaction(
          async (tx) => {
            const existingPending = await tx.entryEditProposal.findFirst({
              where: { entryId: entry.id, status: "PENDING" },
              select: { id: true },
            });
            if (existingPending) throw Errors.EDIT_ALREADY_PENDING();

            const newValues = body.inflections.filter(
              (value) => !currentNormalized.has(normalizeWord(value))
            );
            if (newValues.length > 0) {
              const conflict = await tx.seriesWord.findFirst({
                where: {
                  seriesId: entry.seriesId,
                  entryId: { not: entry.id },
                  normalizedWord: { in: newValues.map(normalizeWord) },
                },
              });
              if (conflict) throw Errors.DUPLICATE_WORD();
            }

            const created = await tx.entryEditProposal.create({
              data: {
                entryId: entry.id,
                proposedDefinitionHtml: definitionHtml,
                submittedById: userId,
                baseEntryUpdatedAt: entry.updatedAt,
                inflections: { create: body.inflections.map((value) => ({ value })) },
              },
              include: { inflections: true },
            });

            // An administrator's own edit applies immediately, self-reviewed,
            // instead of waiting in the queue - see
            // admin-auto-approve-submissions. The EntryEditProposal row is
            // still created above so its history stays uniform with
            // manually-reviewed edits.
            if (isAdmin) {
              await applyEditProposalToEntry(tx, entry, created, userId);
            }

            return created;
          },
          { isolationLevel: "Serializable" }
        );

        return reply.status(201).send({ id: proposal.id, status: isAdmin ? ("APPROVED" as const) : ("PENDING" as const) });
      } catch (err: unknown) {
        // A losing concurrent submission for the same entry can surface as
        // either a unique-constraint violation on insert (P2002) or a
        // Postgres serialization failure under Serializable isolation
        // (P2034) - both mean the same thing here: someone else's proposal
        // won the race.
        if (isPrismaError(err, "P2002") || isPrismaError(err, "P2034")) throw Errors.EDIT_ALREADY_PENDING();
        throw err;
      }
    }
  );

  fastify.get(
    "/api/admin/review-queue",
    { preHandler: requireAdmin },
    async (_request, reply) => {
      const [pendingEntries, pendingProposals] = await Promise.all([
        prisma.entry.findMany({
          where: { approvalStatus: "PENDING" },
          select: { id: true, headword: true, createdAt: true },
        }),
        prisma.entryEditProposal.findMany({
          where: { status: "PENDING" },
          select: { id: true, entryId: true, createdAt: true, entry: { select: { headword: true } } },
        }),
      ]);

      const items: PendingQueueItemDto[] = [
        ...pendingEntries.map((entry) => ({
          type: "NEW_ENTRY" as const,
          id: entry.id,
          headword: entry.headword,
          createdAt: entry.createdAt.toISOString(),
        })),
        ...pendingProposals.map((proposal) => ({
          type: "EDIT" as const,
          id: proposal.id,
          entryId: proposal.entryId,
          headword: proposal.entry.headword,
          createdAt: proposal.createdAt.toISOString(),
        })),
      ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      return reply.status(200).send(items);
    }
  );

  fastify.get(
    "/api/admin/entry-edit-proposals/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const proposal = await prisma.entryEditProposal.findUnique({
        where: { id },
        include: {
          inflections: { select: { value: true } },
          entry: { include: { inflections: { select: { id: true, value: true } } } },
        },
      });
      if (!proposal) throw Errors.NOT_FOUND();

      const dto: EntryEditProposalDto = {
        id: proposal.id,
        entryId: proposal.entryId,
        status: proposal.status,
        submittedById: proposal.submittedById,
        submittedAt: proposal.createdAt.toISOString(),
        reviewedById: proposal.reviewedById,
        reviewedAt: proposal.reviewedAt ? proposal.reviewedAt.toISOString() : null,
        rejectionNote: proposal.rejectionNote,
        current: {
          headword: proposal.entry.headword,
          definitionHtml: proposal.entry.definitionHtml,
          inflections: proposal.entry.inflections.map((i) => ({ id: i.id, value: i.value })),
        },
        proposed: {
          definitionHtml: proposal.proposedDefinitionHtml,
          inflections: proposal.inflections.map((i) => i.value),
        },
      };

      return reply.status(200).send(dto);
    }
  );

  fastify.post(
    "/api/admin/entry-edit-proposals/:id/approve",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const adminId = request.adminUser!.id;

      let updated;
      try {
        updated = await prisma.$transaction(
          async (tx) => {
            const proposal = await tx.entryEditProposal.findUnique({
              where: { id },
              include: { inflections: true },
            });
            if (!proposal) throw Errors.NOT_FOUND();
            if (proposal.status !== "PENDING") throw Errors.ALREADY_REVIEWED();

            const entry = await tx.entry.findUnique({
              where: { id: proposal.entryId },
              include: { inflections: true },
            });
            if (!entry) throw Errors.NOT_FOUND();

            return applyEditProposalToEntry(tx, entry, proposal, adminId);
          },
          { isolationLevel: "Serializable" }
        );
      } catch (err: unknown) {
        // A losing concurrent approval attempt on the same proposal surfaces
        // as a Postgres serialization failure (P2034) under Serializable
        // isolation, not a P2002 - by the time it can be retried, the other
        // transaction has already committed, so this proposal really is
        // already reviewed.
        if (isPrismaError(err, "P2034")) throw Errors.ALREADY_REVIEWED();
        throw err;
      }

      return reply.status(200).send(toEntryDto(updated));
    }
  );

  fastify.post(
    "/api/admin/entry-edit-proposals/:id/reject",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = rejectEntrySchema.parse(request.body ?? {});
      const adminId = request.adminUser!.id;

      const updated = await prisma.$transaction(async (tx) => {
        const proposal = await tx.entryEditProposal.findUnique({ where: { id } });
        if (!proposal) throw Errors.NOT_FOUND();
        if (proposal.status !== "PENDING") throw Errors.ALREADY_REVIEWED();

        return tx.entryEditProposal.update({
          where: { id },
          data: {
            status: "REJECTED",
            reviewedById: adminId,
            reviewedAt: new Date(),
            rejectionNote: body.note ?? null,
          },
        });
      });

      return reply.status(200).send({
        id: updated.id,
        status: updated.status,
        rejectionNote: updated.rejectionNote,
      });
    }
  );
};

export default entryEditProposalRoutes;
