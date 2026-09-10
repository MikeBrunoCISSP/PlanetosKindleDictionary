import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { updateUserSchema, denyRegistrationSchema, type AdminUserDto, type PendingUserDto } from "@planetos/shared";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors, isPrismaError } from "../lib/errors.js";
import { sendAccountApprovedEmail } from "../lib/mailer.js";
import { encodeCursor, decodeCursor } from "../lib/cursor.js";

function toAdminUserDto(user: {
  id: string;
  email: string;
  username: string;
  role: "MEMBER" | "ADMIN";
  isActive: boolean;
  approvalStatus: "PENDING" | "APPROVED";
  createdAt: Date;
}): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    approvalStatus: user.approvalStatus,
    createdAt: user.createdAt.toISOString(),
  };
}

function toPendingUserDto(user: {
  id: string;
  username: string;
  email: string;
  reasonForJoining: string | null;
  createdAt: Date;
}): PendingUserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    reasonForJoining: user.reasonForJoining,
    createdAt: user.createdAt.toISOString(),
  };
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// PERF-002: cursor rather than page/limit - this list is actively depleted
// (approved/denied) while an admin pages through it, so offset pagination's
// skip=N would land on the wrong row once earlier rows are removed. See
// openspec design.md for the full reasoning.
const pendingUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const adminRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAdmin = makeRequireAdmin(prisma);

  fastify.get(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      const users = await prisma.user.findMany({
        where: { approvalStatus: { not: "PENDING" } },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          approvalStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        skip,
        take: query.limit,
      });

      return reply.status(200).send(users.map(toAdminUserDto));
    }
  );

  fastify.get(
    "/api/admin/users/pending",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const query = pendingUsersQuerySchema.parse(request.query);
      const cursor = query.cursor ? decodeCursor(query.cursor) : null;

      const users = await prisma.user.findMany({
        where: {
          approvalStatus: "PENDING",
          ...(cursor
            ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }
            : {}),
        },
        select: { id: true, username: true, email: true, reasonForJoining: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: query.limit,
      });

      // A partial page proves the source is exhausted - no point in one
      // more round-trip that would return empty.
      const last = users.at(-1);
      const nextCursor =
        users.length === query.limit && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null;

      return reply.status(200).send({ items: users.map(toPendingUserDto), nextCursor });
    }
  );

  fastify.post(
    "/api/admin/users/:id/approve",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const target = await prisma.user.findUnique({ where: { id }, select: { approvalStatus: true } });
      if (!target) throw Errors.NOT_FOUND();
      if (target.approvalStatus !== "PENDING") throw Errors.ALREADY_REVIEWED();

      const updated = await prisma.user.update({
        where: { id },
        data: { approvalStatus: "APPROVED" },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          approvalStatus: true,
          createdAt: true,
        },
      });

      // Best-effort: the approval itself is the primary effect and must
      // succeed regardless of whether the notification email can be sent.
      try {
        await sendAccountApprovedEmail(updated.email);
      } catch (err) {
        request.log.error(err, "Failed to send account-approved email");
      }

      return reply.status(200).send(toAdminUserDto(updated));
    }
  );

  fastify.post(
    "/api/admin/users/:id/deny",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { block } = denyRegistrationSchema.parse(request.body ?? {});

      const target = await prisma.user.findUnique({
        where: { id },
        select: { email: true, username: true, approvalStatus: true },
      });
      if (!target) throw Errors.NOT_FOUND();
      if (target.approvalStatus !== "PENDING") throw Errors.ALREADY_REVIEWED();

      await prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { id } });

        if (block) {
          try {
            await tx.blockedEmail.create({
              data: {
                email: target.email,
                reason: `Blocked when denying registration (was: ${target.username})`,
                blockedById: request.session.userId ?? null,
              },
            });
          } catch (err: unknown) {
            // Already blocked by a concurrent request - the end state (account
            // deleted, email blocked) is already correct either way.
            if (!isPrismaError(err, "P2002")) throw err;
          }
        }
      });

      return reply.status(204).send();
    }
  );

  fastify.patch(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateUserSchema.parse(request.body);

      const data: { role?: "MEMBER" | "ADMIN"; isActive?: boolean } = {};
      if (body.role !== undefined) data.role = body.role;
      if (body.isActive !== undefined) data.isActive = body.isActive;

      const updated = await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id },
          select: { id: true, role: true, isActive: true },
        });

        if (!target) throw Errors.NOT_FOUND();

        const wouldRemoveAdmin =
          (body.isActive === false && target.role === "ADMIN" && target.isActive) ||
          (body.role === "MEMBER" && target.role === "ADMIN" && target.isActive !== false && (body.isActive === undefined || body.isActive === true));

        if (wouldRemoveAdmin) {
          const activeAdminCount = await tx.user.count({
            where: { role: "ADMIN", isActive: true },
          });
          if (activeAdminCount <= 1) throw Errors.LAST_ADMIN();
        }

        return tx.user.update({
          where: { id },
          data,
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isActive: true,
            approvalStatus: true,
            createdAt: true,
          },
        });
      }, { isolationLevel: "Serializable" });

      return reply.status(200).send(toAdminUserDto(updated));
    }
  );
};

export default adminRoutes;
