import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";
import { buildApp, startEmailWorker } from "./helpers.js";

const EMAIL_PREFIX = "verifytest-";
const EMAIL_DOMAIN = "example.com";
const VALID_PASSWORD = "SecureP4ss!";
const REASON = "I'd like to contribute definitions.";
const MAILPIT_API = "http://localhost:8025/api/v1";

let app: FastifyInstance;
let prisma: PrismaClient;
let emailWorker: Worker;
let counter = 0;

function uniqueUser() {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  return {
    email: `${EMAIL_PREFIX}${suffix}@${EMAIL_DOMAIN}`,
    username: `VerifyTestUser${suffix}`,
  };
}

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

// Delivery is now asynchronous (PROD-006: the route only enqueues a job) -
// even with emailWorker actively draining the queue, the message may not
// have landed in Mailpit yet by the time this runs, so poll briefly instead
// of checking once.
async function findVerificationEmail(
  to: string,
  timeoutMs = 10000
): Promise<{ id: string; text: string } | undefined> {
  const start = Date.now();
  do {
    const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(to)}`);
    const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    const summary = messages.find((m) => m.Subject.includes("Verify your"));
    if (summary) {
      const fullRes = await fetch(`${MAILPIT_API}/message/${summary.ID}`);
      const full = (await fullRes.json()) as { Text: string };
      return { id: summary.ID, text: full.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() - start < timeoutMs);
  return undefined;
}

async function countVerificationEmails(to: string): Promise<number> {
  const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(to)}`);
  const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
  return messages.filter((m) => m.Subject.includes("Verify your")).length;
}

function extractToken(emailText: string): string {
  const match = /token=([a-f0-9]+)/.exec(emailText);
  if (!match?.[1]) throw new Error("No verification token found in email body");
  return match[1];
}

function register(email: string, username: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: REASON, password: VALID_PASSWORD },
  });
}

function verifyEmail(token: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: { token },
  });
}

function resendVerification(identifier: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/resend-verification",
    payload: { identifier },
  });
}

function login(identifier: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifier, password },
  });
}

async function cleanTestUsers() {
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

async function waitForVerificationEmailCount(to: string, atLeast: number, timeoutMs = 5000): Promise<number> {
  const start = Date.now();
  let count = await countVerificationEmails(to);
  while (count < atLeast && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    count = await countVerificationEmails(to);
  }
  return count;
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  emailWorker = startEmailWorker(prisma);
  await cleanTestUsers();
});

afterAll(async () => {
  await cleanTestUsers();
  await emailWorker.close();
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/auth/verify-email", () => {
  it("verifies the account with a valid token, and a subsequent login succeeds", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    const email = await findVerificationEmail(user.email);
    const token = extractToken(email!.text);

    const res = await verifyEmail(token);
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();

    const loginRes = await login(user.email, VALID_PASSWORD);
    expect(loginRes.statusCode).toBe(200);
  });

  it("rejects reusing an already-redeemed token", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    const email = await findVerificationEmail(user.email);
    const token = extractToken(email!.text);

    const first = await verifyEmail(token);
    expect(first.statusCode).toBe(200);

    const second = await verifyEmail(token);
    expect(second.statusCode).toBe(400);
    const body = second.json<{ type?: string; detail?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-verification-token");
    expect(body.detail).toMatch(/invalid or has expired/i);
  });

  it("SEC-002: exactly one of two concurrent redemptions of the same token succeeds", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    const email = await findVerificationEmail(user.email);
    const token = extractToken(email!.text);

    const [first, second] = await Promise.all([verifyEmail(token), verifyEmail(token)]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 400]);

    const failing = first.statusCode === 400 ? first : second;
    const failingBody = failing.json<{ type?: string }>();
    expect(failingBody.type).toBe("urn:planetos:error:invalid-verification-token");

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    expect(updatedUser.emailVerified).toBe(true);
  });

  it("rejects an expired token", async () => {
    const user = uniqueUser();
    const registerRes = await register(user.email, user.username);
    const userId = registerRes.json<{ id: string }>().id;

    const rawToken = `expired-test-token-${Date.now()}`;
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await verifyEmail(rawToken);
    expect(res.statusCode).toBe(400);
    const body = res.json<{ type?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-verification-token");
  });

  it("rejects an unknown/garbage token", async () => {
    const res = await verifyEmail("this-token-was-never-issued");
    expect(res.statusCode).toBe(400);
    const body = res.json<{ type?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-verification-token");
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("returns the generic message and sends a new verification email for a matching unverified active account", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);

    const res = await resendVerification(user.email);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string }>();
    expect(body.message).toMatch(/if an account.*needs verification/i);

    const count = await waitForVerificationEmailCount(user.email, 2);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("returns the identical generic message and sends no email for an already-verified account", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    const email = await findVerificationEmail(user.email);
    await verifyEmail(extractToken(email!.text));

    const res = await resendVerification(user.email);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string }>();
    expect(body.message).toMatch(/if an account.*needs verification/i);

    // Give a wrongly-enqueued job a chance to be delivered before asserting
    // none was - this is a negative check, so there's nothing to poll for.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await countVerificationEmails(user.email)).toBe(1); // only the original, no new one
  });

  it("returns the identical generic message and sends no email for an unknown identifier", async () => {
    const user = uniqueUser();
    const res = await resendVerification(user.email);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string }>();
    expect(body.message).toMatch(/if an account.*needs verification/i);

    const email = await findVerificationEmail(user.email, 500);
    expect(email).toBeUndefined();
  });

  it("returns the identical generic message and sends no email for a disabled account", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    await prisma.user.update({ where: { email: user.email }, data: { isActive: false } });

    const res = await resendVerification(user.email);
    expect(res.statusCode).toBe(200);

    // Give the original registration email a moment to actually land before
    // asserting no second one appears.
    await waitForVerificationEmailCount(user.email, 1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await countVerificationEmails(user.email)).toBe(1); // only the original registration email
  });

  it("invalidates a previously issued unused token when a resend is requested", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    const firstEmail = await findVerificationEmail(user.email);
    const firstToken = extractToken(firstEmail!.text);

    await resendVerification(user.email);

    const res = await verifyEmail(firstToken);
    expect(res.statusCode).toBe(400);
    const body = res.json<{ type?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-verification-token");
  });
});
