import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

// PROD-006: the routes no longer call the mailer directly at all - delivery
// is a durable outbox row plus a queued job. What must still hold is that a
// failure to *enqueue* that job (e.g. Redis briefly unreachable) never fails
// the request or loses the outbox row itself; the hourly reconciliation
// sweep (worker.ts) is what recovers it.
vi.mock("../src/lib/queues.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/queues.js")>();
  return {
    ...actual,
    getEmailQueue: () => ({
      add: vi.fn().mockRejectedValue(new Error("redis unreachable")),
    }),
  };
});

import { buildApp, cleanUsers } from "./helpers.js";

const EMAIL = "resilience-test@example.com";
const USERNAME = "ResilienceTestUser";
const PASSWORD = "SecureP4ss!";
const REASON = "Testing best-effort email enqueue.";

let app: FastifyInstance;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [EMAIL]);
  await prisma.emailOutbox.deleteMany({ where: { recipientEmail: EMAIL } });
});

afterEach(async () => {
  await cleanUsers(prisma, [EMAIL]);
  await prisma.emailOutbox.deleteMany({ where: { recipientEmail: EMAIL } });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("email enqueue is best-effort", () => {
  it("registration returns 201 with the user, token, and a PENDING outbox row when the enqueue fails", async () => {
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

    const outbox = await prisma.emailOutbox.findFirst({ where: { recipientEmail: EMAIL } });
    expect(outbox).not.toBeNull();
    expect(outbox?.type).toBe("VERIFICATION");
    expect(outbox?.status).toBe("PENDING");
  });

  it("forgot-password returns the identical generic response whether or not the account matches, when the enqueue fails", async () => {
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

    const outbox = await prisma.emailOutbox.findFirst({
      where: { recipientEmail: EMAIL, type: "PASSWORD_RESET" },
    });
    expect(outbox).not.toBeNull();
    expect(outbox?.status).toBe("PENDING");
  });

  it("resend-verification returns the generic 200 when the enqueue fails, with an outbox row created", async () => {
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

    const outboxRows = await prisma.emailOutbox.findMany({
      where: { recipientEmail: EMAIL, type: "VERIFICATION" },
    });
    // One from registration, one from the resend.
    expect(outboxRows).toHaveLength(2);
    expect(outboxRows.every((row) => row.status === "PENDING")).toBe(true);
  });
});
