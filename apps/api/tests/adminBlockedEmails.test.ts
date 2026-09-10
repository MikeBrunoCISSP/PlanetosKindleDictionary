import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers } from "./helpers.js";

const ADMIN_EMAIL = "blockadmin@example.com";
const ADMIN_USERNAME = "BlockAdminUser";
const MEMBER_EMAIL = "blockmember@example.com";
const MEMBER_USERNAME = "BlockMemberUser";
const BLOCKED_EMAIL = "blocktarget@example.com";
const BLOCKED_EMAIL_2 = "blocktarget2@example.com";
const PASSWORD = "SecureP4ss!";
const REASON = "I'd like to help build out the dictionary.";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string): Promise<string> {
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: REASON, password: PASSWORD },
  });
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { identifier: email, password: PASSWORD },
  });
  const cookie = loginRes.headers["set-cookie"] as string | string[];
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

async function cleanBlocked() {
  await prisma.blockedEmail.deleteMany({ where: { email: { in: [BLOCKED_EMAIL, BLOCKED_EMAIL_2] } } });
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await cleanBlocked();
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await cleanBlocked();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/admin/blocked-emails", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/blocked-emails" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/blocked-emails",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists blocked emails newest-first", async () => {
    const adminCookie = await setupAdmin();
    await prisma.blockedEmail.create({ data: { email: BLOCKED_EMAIL } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.blockedEmail.create({ data: { email: BLOCKED_EMAIL_2 } });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/blocked-emails",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ email: string }[]>();
    const idx1 = body.findIndex((b) => b.email === BLOCKED_EMAIL);
    const idx2 = body.findIndex((b) => b.email === BLOCKED_EMAIL_2);
    expect(idx2).toBeLessThan(idx1);
  });
});

describe("POST /api/admin/blocked-emails", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/blocked-emails",
      payload: { email: BLOCKED_EMAIL },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/blocked-emails",
      headers: { cookie: memberCookie },
      payload: { email: BLOCKED_EMAIL },
    });
    expect(res.statusCode).toBe(403);

    const row = await prisma.blockedEmail.findUnique({ where: { email: BLOCKED_EMAIL } });
    expect(row).toBeNull();
  });

  it("blocks an email that never registered", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/blocked-emails",
      headers: { cookie: adminCookie },
      payload: { email: BLOCKED_EMAIL, reason: "Known spammer" },
    });
    expect(res.statusCode).toBe(201);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/admin/blocked-emails",
      headers: { cookie: adminCookie },
    });
    const body = listRes.json<{ email: string; reason: string | null }[]>();
    expect(body.some((b) => b.email === BLOCKED_EMAIL && b.reason === "Known spammer")).toBe(true);
  });

  it("is case-insensitive against a later registration attempt", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "POST",
      url: "/api/admin/blocked-emails",
      headers: { cookie: adminCookie },
      payload: { email: BLOCKED_EMAIL },
    });

    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: BLOCKED_EMAIL.toUpperCase(),
        username: "CaseCheckUser",
        reasonForJoining: REASON,
        password: PASSWORD,
      },
    });
    expect(registerRes.statusCode).toBe(403);
  });

  it("returns 409 when the email is already blocked", async () => {
    const adminCookie = await setupAdmin();
    await prisma.blockedEmail.create({ data: { email: BLOCKED_EMAIL } });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/blocked-emails",
      headers: { cookie: adminCookie },
      payload: { email: BLOCKED_EMAIL },
    });
    expect(res.statusCode).toBe(409);

    const rows = await prisma.blockedEmail.findMany({ where: { email: BLOCKED_EMAIL } });
    expect(rows).toHaveLength(1);
  });
});

describe("DELETE /api/admin/blocked-emails/:id", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/admin/blocked-emails/nonexistent" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const blocked = await prisma.blockedEmail.create({ data: { email: BLOCKED_EMAIL } });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/blocked-emails/${blocked.id}`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);

    const stillExists = await prisma.blockedEmail.findUnique({ where: { id: blocked.id } });
    expect(stillExists).not.toBeNull();
  });

  it("returns 404 for a nonexistent id", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/admin/blocked-emails/nonexistent-id",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("unblocks an email, allowing registration again", async () => {
    const adminCookie = await setupAdmin();
    const blocked = await prisma.blockedEmail.create({ data: { email: BLOCKED_EMAIL } });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/admin/blocked-emails/${blocked.id}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(204);

    const stillExists = await prisma.blockedEmail.findUnique({ where: { id: blocked.id } });
    expect(stillExists).toBeNull();

    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: BLOCKED_EMAIL, username: "UnblockedUser", reasonForJoining: REASON, password: PASSWORD },
    });
    expect(registerRes.statusCode).toBe(201);
    await cleanUsers(prisma, [BLOCKED_EMAIL]);
  });
});
