import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { updateUserSchema, type AdminUserDto, type PendingUserDto } from "@planetos/shared";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors } from "../lib/errors.js";
import { sendAccountApprovedEmail } from "../lib/mailer.js";

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
      const users = await prisma.user.findMany({
        where: { approvalStatus: "PENDING" },
        select: { id: true, username: true, email: true, reasonForJoining: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      return reply.status(200).send(users.map(toPendingUserDto));
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

      const target = await prisma.user.findUnique({ where: { id }, select: { approvalStatus: true } });
      if (!target) throw Errors.NOT_FOUND();
      if (target.approvalStatus !== "PENDING") throw Errors.ALREADY_REVIEWED();

      await prisma.user.delete({ where: { id } });

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
