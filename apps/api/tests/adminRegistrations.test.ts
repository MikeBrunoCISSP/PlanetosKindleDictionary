import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers } from "./helpers.js";
import * as mailer from "../src/lib/mailer.js";

const MAILPIT_API = "http://localhost:8025/api/v1";

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
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining, password: PASSWORD },
  });
  // Registration no longer opens a session (email verification is required
  // before login) - mark the test account verified directly, then log in
  // for a real cookie.
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

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER_EMAIL_2]);
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER_EMAIL_2]);
  await prisma.blockedEmail.deleteMany({ where: { email: { in: [MEMBER_EMAIL, MEMBER_EMAIL_2] } } });
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
    const body = res.json<{
      items: { id: string; username: string; email: string; reasonForJoining: string | null; createdAt: string }[];
      nextCursor: string | null;
    }>();

    expect(body.items.some((u) => u.email === ADMIN_EMAIL)).toBe(false);
    const first = body.items.find((u) => u.email === MEMBER_EMAIL);
    const second = body.items.find((u) => u.email === MEMBER_EMAIL_2);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.username).toBe(MEMBER_USERNAME);
    expect(first?.reasonForJoining).toBe(REASON);
    expect(body.items.indexOf(first!)).toBeLessThan(body.items.indexOf(second!));
  });

  it("PERF-002: a page respects limit, and nextCursor is set only while more rows remain", async () => {
    // The shared dev/test database may already have other, unrelated
    // pending accounts - derive positions dynamically rather than assuming
    // these two test fixtures are the very first pending rows.
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registerAndGetCookie(MEMBER_EMAIL_2, MEMBER_USERNAME_2);

    const full = await app.inject({
      method: "GET",
      url: "/api/admin/users/pending?limit=200",
      headers: { cookie: adminCookie },
    });
    const fullItems = full.json<{ items: { email: string }[] }>().items;
    const firstIndex = fullItems.findIndex((u) => u.email === MEMBER_EMAIL);
    const secondIndex = fullItems.findIndex((u) => u.email === MEMBER_EMAIL_2);
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);

    const pageSize = firstIndex + 1;
    const page1 = await app.inject({
      method: "GET",
      url: `/api/admin/users/pending?limit=${pageSize}`,
      headers: { cookie: adminCookie },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json<{ items: { email: string }[]; nextCursor: string | null }>();
    expect(body1.items).toHaveLength(pageSize);
    expect(body1.items.at(-1)?.email).toBe(MEMBER_EMAIL);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/admin/users/pending?limit=200&cursor=${encodeURIComponent(body1.nextCursor!)}`,
      headers: { cookie: adminCookie },
    });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json<{ items: { email: string }[]; nextCursor: string | null }>();
    expect(body2.items.some((u) => u.email === MEMBER_EMAIL)).toBe(false);
    expect(body2.items.some((u) => u.email === MEMBER_EMAIL_2)).toBe(true);
  });

  it("PERF-002: approving an item shown on page 1 does not cause page 2 to skip or duplicate a remaining item", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registerAndGetCookie(MEMBER_EMAIL_2, MEMBER_USERNAME_2);

    const full = await app.inject({
      method: "GET",
      url: "/api/admin/users/pending?limit=200",
      headers: { cookie: adminCookie },
    });
    const fullItems = full.json<{ items: { id: string; email: string }[] }>().items;
    const firstIndex = fullItems.findIndex((u) => u.email === MEMBER_EMAIL);
    const memberId = fullItems[firstIndex]!.id;
    const pageSize = firstIndex + 1;

    const page1 = await app.inject({
      method: "GET",
      url: `/api/admin/users/pending?limit=${pageSize}`,
      headers: { cookie: adminCookie },
    });
    const body1 = page1.json<{ items: { email: string }[]; nextCursor: string | null }>();
    expect(body1.items.at(-1)?.email).toBe(MEMBER_EMAIL);

    // Approve the account shown on page 1 - it leaves the PENDING set while
    // the admin is still holding page 1's cursor, exactly the race an
    // offset-based page/limit would mishandle.
    await app.inject({
      method: "POST",
      url: `/api/admin/users/${memberId}/approve`,
      headers: { cookie: adminCookie },
    });

    const page2 = await app.inject({
      method: "GET",
      url: `/api/admin/users/pending?limit=200&cursor=${encodeURIComponent(body1.nextCursor!)}`,
      headers: { cookie: adminCookie },
    });
    const body2 = page2.json<{ items: { email: string }[]; nextCursor: string | null }>();
    expect(body2.items.some((u) => u.email === MEMBER_EMAIL)).toBe(false);
    expect(body2.items.some((u) => u.email === MEMBER_EMAIL_2)).toBe(true);
  });

  it("PERF-002: rejects a malformed cursor with 400", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/users/pending?cursor=not-a-real-cursor",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(400);
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
    expect(pendingRes.json<{ items: { email: string }[] }>().items.some((u) => u.email === MEMBER_EMAIL)).toBe(false);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
    });
    expect(listRes.json<{ email: string }[]>().some((u) => u.email === MEMBER_EMAIL)).toBe(true);
  });

  it("sends a real approval-notification email to the approved user", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);

    const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(MEMBER_EMAIL)}`);
    const { messages } = (await listRes.json()) as { messages: { Subject: string }[] };
    expect(messages.some((m) => m.Subject.includes("account has been approved"))).toBe(true);
  });

  it("still approves the user even when sending the notification email fails", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const spy = vi
      .spyOn(mailer, "sendAccountApprovedEmail")
      .mockRejectedValueOnce(new Error("simulated SMTP failure"));

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ approvalStatus: string }>();
    expect(body.approvalStatus).toBe("APPROVED");

    spy.mockRestore();
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
    expect(pendingRes.json<{ items: { email: string }[] }>().items.some((u) => u.email === MEMBER_EMAIL)).toBe(false);

    const blocked = await prisma.blockedEmail.findUnique({ where: { email: MEMBER_EMAIL } });
    expect(blocked).toBeNull();
  });

  it("denying with block: true deletes the account and blocks the email", async () => {
    const adminCookie = await setupAdmin();
    await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/users/${target.id}/deny`,
      headers: { cookie: adminCookie },
      payload: { block: true },
    });
    expect(res.statusCode).toBe(204);

    const stillExists = await prisma.user.findUnique({ where: { id: target.id } });
    expect(stillExists).toBeNull();

    const blocked = await prisma.blockedEmail.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });
    expect(blocked.reason).toContain(MEMBER_USERNAME);

    const registerRes = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: MEMBER_EMAIL, username: MEMBER_USERNAME_2, reasonForJoining: REASON, password: PASSWORD },
    });
    expect(registerRes.statusCode).toBe(403);
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
