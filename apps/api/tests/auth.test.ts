import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers } from "./helpers.js";

const TEST_EMAIL = "authtest@example.com";
const TEST_EMAIL_2 = "authtest2@example.com";
const TEST_DISPLAY = "AuthTestUser";
const TEST_DISPLAY_2 = "AuthTestUser2";
const VALID_PASSWORD = "SecureP4ss!";

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

describe("POST /api/auth/register", () => {
  it("creates a user and returns 201 with UserDto", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; email: string; displayName: string; role: string }>();
    expect(body.email).toBe(TEST_EMAIL);
    expect(body.displayName).toBe(TEST_DISPLAY);
    expect(body.role).toBe("MEMBER");
    expect(body).not.toHaveProperty("passwordHash");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 409 on duplicate email", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY_2, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(409);
    expect(res.headers["content-type"]).toMatch(/problem\+json/);
  });

  it("returns 409 on duplicate displayName", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL_2, displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 400 for invalid email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for short password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: "Ab1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for password missing uppercase", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: "alllower1" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
  });

  it("returns 200 and sets session cookie on valid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: TEST_EMAIL, password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ email: string }>();
    expect(body.email).toBe(TEST_EMAIL);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 401 for wrong password (generic message)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: TEST_EMAIL, password: "WrongP4ss!" },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json<{ title: string }>();
    expect(body.title).not.toMatch(/password/i);
    expect(body.title).not.toMatch(/email/i);
  });

  it("returns 401 for unknown email (generic message)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: VALID_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with UserDto when authenticated", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
    const cookie = loginRes.headers["set-cookie"] as string | string[];
    const cookieHeader = Array.isArray(cookie) ? cookie[0] : cookie;

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: cookieHeader?.split(";")[0] ?? "" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ email: string }>();
    expect(body.email).toBe(TEST_EMAIL);
  });
});

describe("POST /api/auth/logout", () => {
  it("destroys session and returns 204", async () => {
    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: TEST_EMAIL, displayName: TEST_DISPLAY, password: VALID_PASSWORD },
    });
    const cookie = registerRes.headers["set-cookie"] as string | string[];
    const cookieHeader = (Array.isArray(cookie) ? cookie[0] : cookie)?.split(";")[0] ?? "";

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
