import type { FastifyPluginAsync } from "fastify";
import { hash, verify } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { registerSchema, loginSchema, normalizeWord, type UserDto } from "@planetos/shared";
import { Errors, isPrismaError } from "../lib/errors.js";
import { REGISTRATION_RATE_LIMIT, LOGIN_RATE_LIMIT } from "../plugins/rateLimit.js";
import { decrypt } from "../lib/crypto.js";
import { verify as verifyTurnstile } from "../lib/turnstile.js";

const TURNSTILE_SETTINGS_ID = "singleton";

function toUserDto(user: {
  id: string;
  email: string;
  username: string;
  role: "MEMBER" | "ADMIN";
  approvalStatus: "PENDING" | "APPROVED";
  createdAt: Date;
}): UserDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    approvalStatus: user.approvalStatus,
    createdAt: user.createdAt.toISOString(),
  };
}

const authRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;

  fastify.post(
    "/api/auth/register",
    { config: REGISTRATION_RATE_LIMIT },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const email = normalizeWord(body.email);
      const usernameNormalized = normalizeWord(body.username);

      const settings = await prisma.turnstileSettings.findUnique({
        where: { id: TURNSTILE_SETTINGS_ID },
      });

      if (settings?.enabled) {
        if (!settings.secretKeyEncrypted) {
          request.log.error("Turnstile is enabled but has no Secret Key configured.");
          throw Errors.TURNSTILE_MISCONFIGURED();
        }
        if (!body.turnstileToken) {
          throw Errors.TURNSTILE_VERIFICATION_FAILED();
        }
        const secretKey = decrypt(settings.secretKeyEncrypted);
        const result = await verifyTurnstile(secretKey, body.turnstileToken, request.ip);
        if (!result.success) {
          throw Errors.TURNSTILE_VERIFICATION_FAILED();
        }
      }

      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { usernameNormalized }],
        },
        select: { email: true, usernameNormalized: true },
      });

      if (existing) {
        if (existing.email === email) throw Errors.DUPLICATE_EMAIL();
        throw Errors.DUPLICATE_USERNAME();
      }

      const passwordHash = await hash(body.password);

      let user: {
        id: string;
        email: string;
        username: string;
        role: "MEMBER" | "ADMIN";
        approvalStatus: "PENDING" | "APPROVED";
        createdAt: Date;
      };
      try {
        user = await prisma.user.create({
          data: {
            email,
            username: body.username,
            usernameNormalized,
            reasonForJoining: body.reasonForJoining,
            passwordHash,
            role: "MEMBER",
            approvalStatus: "PENDING",
          },
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            approvalStatus: true,
            createdAt: true,
          },
        });
      } catch (err: unknown) {
        if (isPrismaError(err, "P2002")) {
          const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
          if (target.includes("email")) throw Errors.DUPLICATE_EMAIL();
          throw Errors.DUPLICATE_USERNAME();
        }
        throw err;
      }

      request.session.userId = user.id;
      await request.session.save();

      return reply.status(201).send(toUserDto(user));
    }
  );

  fastify.post(
    "/api/auth/login",
    { config: LOGIN_RATE_LIMIT },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const identifier = normalizeWord(body.identifier);

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ usernameNormalized: identifier }, { email: identifier }],
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          approvalStatus: true,
          isActive: true,
          createdAt: true,
          passwordHash: true,
        },
      });

      if (!user) throw Errors.INVALID_CREDENTIALS();

      if (!user.isActive) throw Errors.ACCOUNT_DISABLED();

      const valid = await verify(user.passwordHash, body.password);
      if (!valid) throw Errors.INVALID_CREDENTIALS();

      request.session.userId = user.id;
      await request.session.save();

      const { passwordHash: _, ...safeUser } = user;
      return reply.status(200).send(toUserDto(safeUser));
    }
  );

  fastify.post("/api/auth/logout", async (request, reply) => {
    await request.session.destroy();
    return reply.status(204).send();
  });

  fastify.get("/api/auth/me", async (request, reply) => {
    const userId = request.session.userId;
    if (!userId) {
      return reply.status(401).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        detail: "No active session.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        approvalStatus: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      await request.session.destroy();
      return reply.status(401).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        detail: "Session user not found.",
      });
    }

    if (!user.isActive) {
      return reply.status(403).header("content-type", "application/problem+json").send({
        type: "urn:planetos:error:account-disabled",
        title: "This account has been disabled.",
        status: 403,
        detail: "This account has been disabled.",
      });
    }

    return reply.status(200).send(toUserDto(user));
  });
};

export default authRoutes;
