import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";

// PROD-006: proves the core correctness claim - forcing the outbox-creation
// step to fail must roll back the whole transaction, leaving the prior,
// previously-valid token untouched rather than invalidated with no
// replacement ever durably queued for delivery.
vi.mock("../src/lib/outbox.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/outbox.js")>();
  return {
    ...actual,
    createOutboxEntry: vi.fn().mockRejectedValue(new Error("simulated outbox creation failure")),
  };
});

import { buildApp, cleanUsers } from "./helpers.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const EMAIL = "outbox-atomicity-test@example.com";
const USERNAME = "OutboxAtomicityTestUser";

let app: FastifyInstance;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [EMAIL]);
});

afterEach(async () => {
  await cleanUsers(prisma, [EMAIL]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function seedUser(): Promise<{ id: string; email: string }> {
  return prisma.user.create({
    data: {
      email: EMAIL,
      username: USERNAME,
      usernameNormalized: USERNAME.toLowerCase(),
      passwordHash: "not-a-real-hash",
      isActive: true,
    },
    select: { id: true, email: true },
  });
}

describe("outbox creation failure rolls back the whole token transaction", () => {
  it("forgot-password: a prior valid reset token survives a failed outbox creation", async () => {
    const user = await seedUser();
    const priorRawToken = randomBytes(32).toString("hex");
    const priorToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(priorRawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { identifier: EMAIL },
    });

    // A genuine DB failure during the transaction is not the best-effort
    // delivery path - it's expected to surface as an error, not a masked 200.
    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const survivingPrior = await prisma.passwordResetToken.findUnique({ where: { id: priorToken.id } });
    expect(survivingPrior?.usedAt).toBeNull();

    const allTokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(allTokens).toHaveLength(1);
  });

  it("resend-verification: a prior valid verification token survives a failed outbox creation", async () => {
    const user = await seedUser();
    const priorRawToken = randomBytes(32).toString("hex");
    const priorToken = await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(priorRawToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/resend-verification",
      payload: { identifier: EMAIL },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const survivingPrior = await prisma.emailVerificationToken.findUnique({ where: { id: priorToken.id } });
    expect(survivingPrior?.usedAt).toBeNull();

    const allTokens = await prisma.emailVerificationToken.findMany({ where: { userId: user.id } });
    expect(allTokens).toHaveLength(1);
  });

  it("register: a failed outbox creation leaves no orphaned user or token behind", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: EMAIL,
        username: USERNAME,
        reasonForJoining: "Testing outbox atomicity.",
        password: "SecureP4ss!",
      },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user).toBeNull();
  });
});
