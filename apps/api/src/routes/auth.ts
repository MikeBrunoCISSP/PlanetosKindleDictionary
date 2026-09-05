import type { FastifyPluginAsync } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  normalizeWord,
  type UserDto,
} from "@planetos/shared";
import { Errors, isPrismaError } from "../lib/errors.js";
import {
  REGISTRATION_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  FORGOT_PASSWORD_RATE_LIMIT,
  RESET_PASSWORD_RATE_LIMIT,
  VERIFY_EMAIL_RATE_LIMIT,
  RESEND_VERIFICATION_RATE_LIMIT,
} from "../plugins/rateLimit.js";
import { decrypt } from "../lib/crypto.js";
import { verify as verifyTurnstile } from "../lib/turnstile.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/mailer.js";
import { config } from "../config.js";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

      const rawToken = randomBytes(32).toString("hex");
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
        },
      });

      const baseUrl = config.publicBaseUrl;
      const verifyUrl = `${baseUrl}/verify-email?token=${rawToken}`;
      // Best-effort: a delivery failure must not fail registration or leave an
      // orphaned user - the "check your email" card offers a resend.
      try {
        await sendVerificationEmail(user.email, verifyUrl);
      } catch (err) {
        request.log.error(err, "Failed to send verification email after registration");
      }

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
          emailVerified: true,
          createdAt: true,
          passwordHash: true,
        },
      });

      if (!user) throw Errors.INVALID_CREDENTIALS();

      if (!user.isActive) throw Errors.ACCOUNT_DISABLED();

      if (!user.emailVerified) throw Errors.EMAIL_NOT_VERIFIED();

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

  // Always responds with the same generic message regardless of whether the
  // identifier matched an account, to avoid leaking account existence. The
  // match/no-match branch only decides whether an email is sent as a side
  // effect - it never changes the response shape.
  fastify.post(
    "/api/auth/forgot-password",
    { config: FORGOT_PASSWORD_RATE_LIMIT },
    async (request, reply) => {
      const body = forgotPasswordSchema.parse(request.body);
      const identifier = normalizeWord(body.identifier);

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ usernameNormalized: identifier }, { email: identifier }],
        },
        select: { id: true, email: true, isActive: true },
      });

      if (user?.isActive) {
        await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });

        const rawToken = randomBytes(32).toString("hex");
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(rawToken),
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });

        const baseUrl = config.publicBaseUrl;
        const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
        // Best-effort: swallow send failures so the response stays identical to
        // the non-matching-identifier path (no account-existence leak).
        try {
          await sendPasswordResetEmail(user.email, resetUrl);
        } catch (err) {
          request.log.error(err, "Failed to send password-reset email");
        }
      }

      return reply.status(200).send({
        message:
          "If an account registered with that username or email address was found, an email with instructions to reset your password has been sent.",
      });
    }
  );

  fastify.post(
    "/api/auth/reset-password",
    { config: RESET_PASSWORD_RATE_LIMIT },
    async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      const tokenHash = hashToken(body.token);

      const resetToken = await prisma.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true },
      });

      if (!resetToken) throw Errors.INVALID_RESET_TOKEN();

      const passwordHash = await hash(body.password);

      await prisma.$transaction([
        prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
      ]);

      return reply.status(200).send({ message: "Your password has been reset." });
    }
  );

  fastify.post(
    "/api/auth/verify-email",
    { config: VERIFY_EMAIL_RATE_LIMIT },
    async (request, reply) => {
      const body = verifyEmailSchema.parse(request.body);
      const tokenHash = hashToken(body.token);

      const verificationToken = await prisma.emailVerificationToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true },
      });

      if (!verificationToken) throw Errors.INVALID_VERIFICATION_TOKEN();

      await prisma.$transaction([
        prisma.user.update({
          where: { id: verificationToken.userId },
          data: { emailVerified: true },
        }),
        prisma.emailVerificationToken.update({
          where: { id: verificationToken.id },
          data: { usedAt: new Date() },
        }),
      ]);

      return reply.status(200).send({ message: "Your email address has been verified." });
    }
  );

  // Same no-enumeration shape as forgot-password: always the same generic
  // response, regardless of whether the identifier matched an account or
  // that account is already verified. Only sends an email as a side effect
  // when there's actually something to verify.
  fastify.post(
    "/api/auth/resend-verification",
    { config: RESEND_VERIFICATION_RATE_LIMIT },
    async (request, reply) => {
      const body = resendVerificationSchema.parse(request.body);
      const identifier = normalizeWord(body.identifier);

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ usernameNormalized: identifier }, { email: identifier }],
        },
        select: { id: true, email: true, isActive: true, emailVerified: true },
      });

      if (user?.isActive && !user.emailVerified) {
        await prisma.emailVerificationToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });

        const rawToken = randomBytes(32).toString("hex");
        await prisma.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(rawToken),
            expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
          },
        });

        const baseUrl = config.publicBaseUrl;
        const verifyUrl = `${baseUrl}/verify-email?token=${rawToken}`;
        // Best-effort: swallow send failures so the generic response is
        // unchanged (no account-existence leak).
        try {
          await sendVerificationEmail(user.email, verifyUrl);
        } catch (err) {
          request.log.error(err, "Failed to send verification email on resend");
        }
      }

      return reply.status(200).send({
        message:
          "If an account registered with that username or email address needs verification, a new verification email has been sent.",
      });
    }
  );

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
