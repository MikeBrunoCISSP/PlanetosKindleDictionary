import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createBlockedEmailSchema, normalizeWord, type BlockedEmailDto } from "@planetos/shared";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors, isPrismaError } from "../lib/errors.js";

function toBlockedEmailDto(row: {
  id: string;
  email: string;
  reason: string | null;
  blockedAt: Date;
  blockedById: string | null;
}): BlockedEmailDto {
  return {
    id: row.id,
    email: row.email,
    reason: row.reason,
    blockedAt: row.blockedAt.toISOString(),
    blockedById: row.blockedById,
  };
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const adminBlockedEmailsRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAdmin = makeRequireAdmin(prisma);

  fastify.get(
    "/api/admin/blocked-emails",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      const rows = await prisma.blockedEmail.findMany({
        orderBy: { blockedAt: "desc" },
        skip,
        take: query.limit,
      });

      return reply.status(200).send(rows.map(toBlockedEmailDto));
    }
  );

  fastify.post(
    "/api/admin/blocked-emails",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = createBlockedEmailSchema.parse(request.body);
      const email = normalizeWord(body.email);

      try {
        const row = await prisma.blockedEmail.create({
          data: {
            email,
            reason: body.reason ?? null,
            blockedById: request.session.userId ?? null,
          },
        });
        return reply.status(201).send(toBlockedEmailDto(row));
      } catch (err: unknown) {
        if (isPrismaError(err, "P2002")) throw Errors.EMAIL_ALREADY_BLOCKED();
        throw err;
      }
    }
  );

  fastify.delete(
    "/api/admin/blocked-emails/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.blockedEmail.findUnique({ where: { id } });
      if (!existing) throw Errors.NOT_FOUND();

      await prisma.blockedEmail.delete({ where: { id } });

      return reply.status(204).send();
    }
  );
};

export default adminBlockedEmailsRoutes;
