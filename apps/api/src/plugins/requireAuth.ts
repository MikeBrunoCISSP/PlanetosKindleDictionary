import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "@prisma/client";

type AuthUser = {
  id: string;
  email: string;
  username: string;
  role: "MEMBER" | "ADMIN";
  isActive: boolean;
  approvalStatus: "PENDING" | "APPROVED";
  createdAt: Date;
};

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export function makeRequireAuth(prisma: PrismaClient): preHandlerHookHandler {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
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

    if (!user || !user.isActive) {
      return reply.status(403).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "This account has been disabled.",
      });
    }

    request.authUser = user;
  };
}

export function makeRequireApproved(prisma: PrismaClient): preHandlerHookHandler {
  return async function requireApproved(request: FastifyRequest, reply: FastifyReply) {
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

    if (!user || !user.isActive) {
      return reply.status(403).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "This account has been disabled.",
      });
    }

    if (user.role !== "ADMIN" && user.approvalStatus !== "APPROVED") {
      return reply.status(403).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "Your account is pending administrator approval.",
      });
    }

    request.authUser = user;
  };
}
