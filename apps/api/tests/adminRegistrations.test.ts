import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers } from "./helpers.js";

const ADMIN_EMAIL = "regadmin@example.com";
const ADMIN_USERNAME = "RegAdminUser";
const MEMBER_EMAIL = "regmember@example.com";
const MEMBER_USERNAME = "RegMemberUser";
const MEMBER_EMAIL_2 = "regmember2@example.com";
const MEMBER_USERNAME_2 = "RegMemberUser2";
const PASSWORD = "SecureP4ss!";
const REASON = "I'd like to help build out the dictionary.";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string, reasonForJoining = REASON): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining, password: PASSWORD },
  });
  const cookie = res.headers["set-cookie"] as string | string[];
  return ((Array.isArray(cookie) ? cookie[0] : cookie) ?? "").split(";")[0] ?? "";
}

async function setupAdmin(): Promise<string> {
  const cookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_USERNAME);
  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data: { role: "ADMIN", approvalStatus: "APPROVED" },
  });
  return cookie;
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER_EMAIL_2]);
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER_EMAIL_2]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/admin/users/pending", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/users/pending" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users/pending",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists pending registrations oldest-first with the expected shape, excluding approved users", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registerAndGetCookie(MEMBER_EMAIL_2, MEMBER_USERNAME_2);

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users/pending",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<
      { id: string; username: string; email: string; reasonForJoining: string | null; createdAt: string }[]
    >();

    expect(body.some((u) => u.email === ADMIN_EMAIL)).toBe(false);
    const first = body.find((u) => u.email === MEMBER_EMAIL);
    const second = body.find((u) => u.email === MEMBER_EMAIL_2);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.username).toBe(MEMBER_USERNAME);
    expect(first?.reasonForJoining).toBe(REASON);
    expect(body.indexOf(first!)).toBeLessThan(body.indexOf(second!));
  });
});

describe("POST /api/admin/users/:id/approve", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/users/nonexistent/approve" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users/nonexistent/approve",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for an unknown user id", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users/nonexistent-id/approve",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("approves a pending user and removes them from the pending list", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ approvalStatus: string }>();
    expect(body.approvalStatus).toBe("APPROVED");

    const pendingRes = await app.inject({
      method: "GET",
      url: "/api/admin/users/pending",
      headers: { cookie: adminCookie },
    });
    expect(pendingRes.json<{ email: string }[]>().some((u) => u.email === MEMBER_EMAIL)).toBe(false);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
    });
    expect(listRes.json<{ email: string }[]>().some((u) => u.email === MEMBER_EMAIL)).toBe(true);
  });

  it("returns 409 when approving an already-approved user", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/approve`,
      headers: { cookie: adminCookie },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("POST /api/admin/users/:id/deny", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/users/nonexistent/deny" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users/nonexistent/deny",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for an unknown user id", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/users/nonexistent-id/deny",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("permanently deletes a pending user and removes them from the pending list", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/deny`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(204);

    const stillExists = await prisma.user.findUnique({ where: { id: target.id } });
    expect(stillExists).toBeNull();

    const pendingRes = await app.inject({
      method: "GET",
      url: "/api/admin/users/pending",
      headers: { cookie: adminCookie },
    });
    expect(pendingRes.json<{ email: string }[]>().some((u) => u.email === MEMBER_EMAIL)).toBe(false);
  });

  it("returns 409 when denying an already-approved user", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });
    await prisma.user.update({ where: { id: target.id }, data: { approvalStatus: "APPROVED" } });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/deny`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 when denying an already-denied (deleted) user", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/deny`,
      headers: { cookie: adminCookie },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/deny`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
