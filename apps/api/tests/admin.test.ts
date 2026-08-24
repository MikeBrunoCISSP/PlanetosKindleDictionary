import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers } from "./helpers.js";

const ADMIN_EMAIL = "admintest@example.com";
const MEMBER_EMAIL = "membertest@example.com";
const MEMBER_EMAIL_2 = "membertest2@example.com";
const ADMIN_DISPLAY = "AdminTestUser";
const MEMBER_DISPLAY = "MemberTestUser";
const MEMBER_DISPLAY_2 = "MemberTestUser2";
const PASSWORD = "SecureP4ss!";

let app: FastifyInstance;
let prisma: PrismaClient;
let preExistingAdminIds: string[] = [];

async function registerAndGetCookie(
  email: string,
  displayName: string,
  password = PASSWORD
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, displayName, password },
  });
  const cookie = res.headers["set-cookie"] as string | string[];
  return ((Array.isArray(cookie) ? cookie[0] : cookie) ?? "").split(";")[0] ?? "";
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER_EMAIL_2]);
  // Deactivate any pre-existing active admins so last-admin tests are deterministic
  const existing = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  preExistingAdminIds = existing.map((u) => u.id);
  if (preExistingAdminIds.length > 0) {
    await prisma.user.updateMany({ where: { id: { in: preExistingAdminIds } }, data: { isActive: false } });
  }
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER_EMAIL_2]);
});

afterAll(async () => {
  // Restore pre-existing admins
  if (preExistingAdminIds.length > 0) {
    await prisma.user.updateMany({ where: { id: { in: preExistingAdminIds } }, data: { isActive: true } });
  }
  await app.close();
  await prisma.$disconnect();
});

// ─── Auth enforcement (tasks 4.2, 4.3) ─────────────────────────────────────

describe("POST /api/auth/login — disabled account", () => {
  it("returns 403 for disabled user and does not set session cookie", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: MEMBER_EMAIL, displayName: MEMBER_DISPLAY, password: PASSWORD },
    });
    await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { isActive: false } });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: MEMBER_EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toMatch(/problem\+json/);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("GET /api/auth/me — disabled mid-session", () => {
  it("returns 403 when account is disabled after login", async () => {
    const cookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { isActive: false } });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ type: string }>().type).toBe("urn:planetos:error:account-disabled");
  });
});

// ─── Admin routes (tasks 5.1, 5.2, 5.3) ────────────────────────────────────

describe("GET /api/admin/users", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/users" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const cookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 with user list for admin", async () => {
    const cookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { role: "ADMIN" } });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Array<{ email: string; isActive: boolean; role: string }>>();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((u) => u.email === MEMBER_EMAIL);
    expect(found).toBeDefined();
    expect(found?.isActive).toBe(true);
    expect(found?.role).toBe("ADMIN");
  });
});

describe("PATCH /api/admin/users/:id", () => {
  async function setupAdminAndMember() {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
    const member = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } }).catch(async () => {
      await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
      return prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });
    });
    return { adminCookie, memberId: member.id };
  }

  it("returns 403 for non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${target.id}`,
      headers: { cookie: memberCookie },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for unknown user", async () => {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/users/nonexistent-id",
      headers: { cookie: adminCookie },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it("disables a non-last-admin user (200)", async () => {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    const member = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${member.id}`,
      headers: { cookie: adminCookie },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ isActive: boolean }>().isActive).toBe(false);
  });

  it("enables a disabled user (200)", async () => {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { isActive: false } });
    const member = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${member.id}`,
      headers: { cookie: adminCookie },
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ isActive: boolean }>().isActive).toBe(true);
  });

  it("promotes a member to ADMIN (200)", async () => {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    const member = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${member.id}`,
      headers: { cookie: adminCookie },
      payload: { role: "ADMIN" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ role: string }>().role).toBe("ADMIN");
  });

  it("demotes an admin to MEMBER when another admin exists (200)", async () => {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_DISPLAY);
    await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { role: "ADMIN" } });
    const secondAdmin = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${secondAdmin.id}`,
      headers: { cookie: adminCookie },
      payload: { role: "MEMBER" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ role: string }>().role).toBe("MEMBER");
  });

  it("blocks disabling the last active admin (409)", async () => {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    const admin = await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { role: "ADMIN" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${admin.id}`,
      headers: { cookie: adminCookie },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ type: string }>().type).toBe("urn:planetos:error:last-admin");
  });

  it("blocks demoting the last active admin (409)", async () => {
    const adminCookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_DISPLAY);
    const admin = await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { role: "ADMIN" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${admin.id}`,
      headers: { cookie: adminCookie },
      payload: { role: "MEMBER" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ type: string }>().type).toBe("urn:planetos:error:last-admin");
  });
});
