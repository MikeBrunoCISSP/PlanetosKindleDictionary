import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

// Every send fails - registration / reset / resend must still behave normally.
vi.mock("../src/lib/mailer.js", () => ({
  sendVerificationEmail: vi.fn().mockRejectedValue(new Error("mail transport down")),
  sendPasswordResetEmail: vi.fn().mockRejectedValue(new Error("mail transport down")),
  sendAccountApprovedEmail: vi.fn().mockRejectedValue(new Error("mail transport down")),
}));

import { buildApp, cleanUsers } from "./helpers.js";

const EMAIL = "resilience-test@example.com";
const USERNAME = "ResilienceTestUser";
const PASSWORD = "SecureP4ss!";
const REASON = "Testing best-effort email.";

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

describe("transactional email is best-effort", () => {
  it("registration returns 201 with the user + verification token persisted when the send fails", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: EMAIL, username: USERNAME, reasonForJoining: REASON, password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);

    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user).not.toBeNull();
    const token = await prisma.emailVerificationToken.findFirst({ where: { userId: user!.id } });
    expect(token).not.toBeNull();
  });

  it("forgot-password returns the identical generic response whether or not the account matches, when the send fails", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: EMAIL, username: USERNAME, reasonForJoining: REASON, password: PASSWORD },
    });

    const matching = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { identifier: EMAIL },
    });
    const nonMatching = await app.inject({
      method: "POST",
      url: "/api/auth/forgot-password",
      payload: { identifier: "definitely-nobody@example.org" },
    });

    expect(matching.statusCode).toBe(200);
    expect(matching.statusCode).toBe(nonMatching.statusCode);
    expect(matching.body).toBe(nonMatching.body);
  });

  it("resend-verification returns the generic 200 when the send fails", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: EMAIL, username: USERNAME, reasonForJoining: REASON, password: PASSWORD },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/resend-verification",
      payload: { identifier: EMAIL },
    });
    expect(res.statusCode).toBe(200);
  });
});
