import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp } from "./helpers.js";

const EMAIL_PREFIX = "resettest-";
const EMAIL_DOMAIN = "example.com";
const VALID_PASSWORD = "SecureP4ss!";
const REASON = "I'd like to contribute definitions.";
const MAILPIT_API = "http://localhost:8025/api/v1";

let app: FastifyInstance;
let prisma: PrismaClient;
let counter = 0;

function uniqueUser() {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  return {
    email: `${EMAIL_PREFIX}${suffix}@${EMAIL_DOMAIN}`,
    username: `ResetTestUser${suffix}`,
  };
}

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

// Registration now also sends a verification email to the same address, so
// searching by recipient alone isn't enough to isolate the reset email -
// filter to the one whose subject is actually the reset email's.
async function findResetEmail(to: string): Promise<{ id: string; text: string } | undefined> {
  const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(to)}`);
  const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
  const summary = messages.find((m) => m.Subject.includes("Reset your"));
  if (!summary) return undefined;
  const fullRes = await fetch(`${MAILPIT_API}/message/${summary.ID}`);
  const full = (await fullRes.json()) as { Text: string };
  return { id: summary.ID, text: full.Text };
}

function extractToken(emailText: string): string {
  const match = /token=([a-f0-9]+)/.exec(emailText);
  if (!match?.[1]) throw new Error("No reset token found in email body");
  return match[1];
}

function register(email: string, username: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: REASON, password: VALID_PASSWORD },
  });
}

async function markVerified(email: string) {
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
}

function forgotPassword(identifier: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/forgot-password",
    payload: { identifier },
  });
}

function resetPassword(token: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/reset-password",
    payload: { token, password },
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

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanTestUsers();
});

afterAll(async () => {
  await cleanTestUsers();
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/auth/forgot-password", () => {
  it("returns the generic message and sends a real reset email for a matching active account (by email)", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);

    const res = await forgotPassword(user.email);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string }>();
    expect(body.message).toMatch(/if an account.*was found/i);

    const email = await findResetEmail(user.email);
    expect(email).toBeDefined();
    expect(email!.text).toContain("/reset-password?token=");
  });

  it("returns the generic message and sends a real reset email for a matching active account (by username)", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);

    const res = await forgotPassword(user.username);
    expect(res.statusCode).toBe(200);

    const email = await findResetEmail(user.email);
    expect(email).toBeDefined();
  });

  it("returns the identical generic message and sends no email for an unknown identifier", async () => {
    const user = uniqueUser();
    const res = await forgotPassword(user.email);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string }>();
    expect(body.message).toMatch(/if an account.*was found/i);

    const email = await findResetEmail(user.email);
    expect(email).toBeUndefined();
  });

  it("returns the identical generic message and sends no email for a disabled account", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    await prisma.user.update({ where: { email: user.email }, data: { isActive: false } });

    const res = await forgotPassword(user.email);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ message: string }>();
    expect(body.message).toMatch(/if an account.*was found/i);

    const email = await findResetEmail(user.email);
    expect(email).toBeUndefined();
  });

  it("invalidates a previously issued unused token when a new request is made", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);

    await forgotPassword(user.email);
    const firstEmail = await findResetEmail(user.email);
    const firstToken = extractToken(firstEmail!.text);

    await forgotPassword(user.email);

    const res = await resetPassword(firstToken, "NewSecureP4ss!");
    expect(res.statusCode).toBe(400);
    const body = res.json<{ type?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-reset-token");
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets a new password with a valid token, which then works for login and the old password no longer does", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    await markVerified(user.email);
    await forgotPassword(user.email);
    const email = await findResetEmail(user.email);
    const token = extractToken(email!.text);

    const newPassword = "BrandNewP4ss!";
    const resetRes = await resetPassword(token, newPassword);
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.headers["set-cookie"]).toBeUndefined();

    const newLogin = await login(user.email, newPassword);
    expect(newLogin.statusCode).toBe(200);

    const oldLogin = await login(user.email, VALID_PASSWORD);
    expect(oldLogin.statusCode).toBe(401);
  });

  it("rejects reusing an already-redeemed token", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    await markVerified(user.email);
    await forgotPassword(user.email);
    const email = await findResetEmail(user.email);
    const token = extractToken(email!.text);

    const first = await resetPassword(token, "FirstNewP4ss!");
    expect(first.statusCode).toBe(200);

    const second = await resetPassword(token, "SecondNewP4ss!");
    expect(second.statusCode).toBe(400);
    const body = second.json<{ type?: string; detail?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-reset-token");
    expect(body.detail).toMatch(/invalid or has expired/i);

    const stillWorks = await login(user.email, "FirstNewP4ss!");
    expect(stillWorks.statusCode).toBe(200);
  });

  it("rejects an expired token", async () => {
    const user = uniqueUser();
    const registerRes = await register(user.email, user.username);
    const userId = registerRes.json<{ id: string }>().id;

    const rawToken = `expired-test-token-${Date.now()}`;
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await resetPassword(rawToken, "NewSecureP4ss!");
    expect(res.statusCode).toBe(400);
    const body = res.json<{ type?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-reset-token");
  });

  it("rejects an unknown/garbage token", async () => {
    const res = await resetPassword("this-token-was-never-issued", "NewSecureP4ss!");
    expect(res.statusCode).toBe(400);
    const body = res.json<{ type?: string }>();
    expect(body.type).toBe("urn:planetos:error:invalid-reset-token");
  });

  it("rejects a password that violates complexity rules, even with a valid token", async () => {
    const user = uniqueUser();
    await register(user.email, user.username);
    await markVerified(user.email);
    await forgotPassword(user.email);
    const email = await findResetEmail(user.email);
    const token = extractToken(email!.text);

    const res = await resetPassword(token, "alllower");
    expect(res.statusCode).toBe(400);

    const stillOldPassword = await login(user.email, VALID_PASSWORD);
    expect(stillOldPassword.statusCode).toBe(200);
  });
});
