import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { updateUserSchema, type AdminUserDto } from "@planetos/shared";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { Errors } from "../lib/errors.js";

function toAdminUserDto(user: {
  id: string;
  email: string;
  displayName: string;
  role: "MEMBER" | "ADMIN";
  isActive: boolean;
  createdAt: Date;
}): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
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
        select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        skip,
        take: query.limit,
      });

      return reply.status(200).send(users.map(toAdminUserDto));
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
          select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
        });
      }, { isolationLevel: "Serializable" });

      return reply.status(200).send(toAdminUserDto(updated));
    }
  );
};

export default adminRoutes;
