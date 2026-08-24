import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@prisma/client";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: "MEMBER" | "ADMIN";
  isActive: boolean;
  createdAt: Date;
};

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: AdminUser;
  }
}

export function makeRequireAdmin(prisma: PrismaClient): preHandlerHookHandler {
  return async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.session.userId;
    if (!userId) {
      return reply.status(401).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        detail: "Authentication required.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
    });

    if (!user || !user.isActive || user.role !== "ADMIN") {
      return reply.status(403).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "Administrator access required.",
      });
    }

    request.adminUser = user;
  };
}
