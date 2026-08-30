import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { hash as hashPassword } from "@node-rs/argon2";
import { buildApp, cleanUsers } from "./helpers.js";

const MAILPIT_API = "http://localhost:8025/api/v1";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

const TEST_EMAIL = "authtest@example.com";
const TEST_EMAIL_2 = "authtest2@example.com";
const TEST_USERNAME = "AuthTestUser";
const TEST_USERNAME_2 = "AuthTestUser2";
const VALID_PASSWORD = "SecureP4ss!";
const REASON = "I'd like to contribute definitions.";

let app: FastifyInstance;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [TEST_EMAIL, TEST_EMAIL_2]);
});

afterEach(async () => {
  await cleanUsers(prisma, [TEST_EMAIL, TEST_EMAIL_2]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

function register(email: string, username: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: REASON, password: VALID_PASSWORD, ...extra },
  });
}

async function markVerified(email: string) {
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
}

async function loginAndGetCookie(identifier: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifier, password },
  });
  const cookie = res.headers["set-cookie"] as string | string[];
  return (Array.isArray(cookie) ? cookie[0] : cookie)?.split(";")[0] ?? "";
}

describe("POST /api/auth/register", () => {
  it("creates a user and returns 201 with UserDto", async () => {
    const res = await register(TEST_EMAIL, TEST_USERNAME);
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      id: string;
      email: string;
      username: string;
      role: string;
      approvalStatus: string;
    }>();
    expect(body.email).toBe(TEST_EMAIL);
    expect(body.username).toBe(TEST_USERNAME);
    expect(body.role).toBe("MEMBER");
    expect(body.approvalStatus).toBe("PENDING");
    expect(body).not.toHaveProperty("passwordHash");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("stores and returns the email lowercased regardless of submitted case", async () => {
    const res = await register(TEST_EMAIL.toUpperCase(), TEST_USERNAME);
    expect(res.statusCode).toBe(201);
    expect(res.json<{ email: string }>().email).toBe(TEST_EMAIL);
  });

  it("ignores a client-supplied role or approvalStatus", async () => {
    const res = await register(TEST_EMAIL, TEST_USERNAME, { role: "ADMIN", approvalStatus: "APPROVED" });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ role: string; approvalStatus: string }>();
    expect(body.role).toBe("MEMBER");
    expect(body.approvalStatus).toBe("PENDING");
  });

  it("returns 409 on duplicate email", async () => {
    await register(TEST_EMAIL, TEST_USERNAME);
    const res = await register(TEST_EMAIL, TEST_USERNAME_2);
    expect(res.statusCode).toBe(409);
    expect(res.headers["content-type"]).toMatch(/problem\+json/);
  });

  it("returns 409 on an email that differs only in case", async () => {
    await register(TEST_EMAIL, TEST_USERNAME);
    const res = await register(TEST_EMAIL.toUpperCase(), TEST_USERNAME_2);
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 on duplicate username", async () => {
    await register(TEST_EMAIL, TEST_USERNAME);
    const res = await register(TEST_EMAIL_2, TEST_USERNAME);
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 on a username that differs only in case", async () => {
    await register(TEST_EMAIL, TEST_USERNAME);
    const res = await register(TEST_EMAIL_2, TEST_USERNAME.toUpperCase());
    expect(res.statusCode).toBe(409);
  });

  it("returns 400 for invalid email", async () => {
    const res = await register("not-an-email", TEST_USERNAME);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a missing reasonForJoining", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, username: TEST_USERNAME, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for short password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, username: TEST_USERNAME, reasonForJoining: REASON, password: "Ab1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for password missing uppercase", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: TEST_EMAIL,
        username: TEST_USERNAME,
        reasonForJoining: REASON,
        password: "alllower1",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("sends a real verification email to the registered address", async () => {
    const res = await register(TEST_EMAIL, TEST_USERNAME);
    expect(res.statusCode).toBe(201);

    const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(TEST_EMAIL)}`);
    const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]!.Subject).toContain("Verify your eReader Dictionaries email address");

    const fullRes = await fetch(`${MAILPIT_API}/message/${messages[0]!.ID}`);
    const full = (await fullRes.json()) as { Text: string };
    expect(full.Text).toContain("/verify-email?token=");
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await register(TEST_EMAIL, TEST_USERNAME);
    await markVerified(TEST_EMAIL);
  });

  it("returns 200 and sets session cookie when logging in with the email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: TEST_EMAIL, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ email: string }>();
    expect(body.email).toBe(TEST_EMAIL);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 200 when logging in with the email in a different case", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: TEST_EMAIL.toUpperCase(), password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 when logging in with the username", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: TEST_USERNAME, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 when logging in with the username in a different case", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: TEST_USERNAME.toLowerCase(), password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 for wrong password (generic message)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: TEST_EMAIL, password: "WrongP4ss!" },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json<{ title: string }>();
    expect(body.title).not.toMatch(/password/i);
    expect(body.title).not.toMatch(/email/i);
    expect(body.title).not.toMatch(/username/i);
  });

  it("returns 401 for unknown email (generic message)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "nobody@example.com", password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for unknown username (generic message)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "NobodyAtAll", password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 EMAIL_NOT_VERIFIED for an unverified account with correct credentials, no session opened", async () => {
    await register(TEST_EMAIL_2, TEST_USERNAME_2);
    // Deliberately not calling markVerified - this account stays unverified.

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: TEST_EMAIL_2, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json<{ type?: string }>();
    expect(body.type).toBe("urn:planetos:error:email-not-verified");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("a pre-existing account (already emailVerified, never redeemed a token) logs in normally", async () => {
    // Simulates an account grandfathered in by the migration backfill:
    // isActive + emailVerified = true, with no EmailVerificationToken ever
    // created or redeemed for it.
    await prisma.user.create({
      data: {
        email: TEST_EMAIL_2,
        username: TEST_USERNAME_2,
        usernameNormalized: TEST_USERNAME_2.toLowerCase(),
        reasonForJoining: REASON,
        passwordHash: await hashPassword(VALID_PASSWORD),
        role: "MEMBER",
        approvalStatus: "PENDING",
        emailVerified: true,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: TEST_EMAIL_2, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with UserDto when authenticated", async () => {
    await register(TEST_EMAIL, TEST_USERNAME);
    await markVerified(TEST_EMAIL);
    const cookieHeader = await loginAndGetCookie(TEST_EMAIL, VALID_PASSWORD);

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ email: string; username: string; approvalStatus: string }>();
    expect(body.email).toBe(TEST_EMAIL);
    expect(body.username).toBe(TEST_USERNAME);
    expect(body.approvalStatus).toBe("PENDING");
  });
});

describe("POST /api/auth/logout", () => {
  it("destroys session and returns 204", async () => {
    await register(TEST_EMAIL, TEST_USERNAME);
    await markVerified(TEST_EMAIL);
    const cookieHeader = await loginAndGetCookie(TEST_EMAIL, VALID_PASSWORD);

    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: cookieHeader },
    });
    expect(logoutRes.statusCode).toBe(204);

    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader },
    });
    expect(meRes.statusCode).toBe(401);
  });
});
