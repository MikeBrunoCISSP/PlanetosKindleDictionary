import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers, cleanSeries } from "./helpers.js";

const ADMIN_EMAIL = "seriesadmin@example.com";
const ADMIN_USERNAME = "SeriesAdminUser";
const MEMBER_EMAIL = "seriesmember@example.com";
const MEMBER_USERNAME = "SeriesMemberUser";
const PASSWORD = "SecureP4ss!";
const SLUG_PREFIX = "test-series";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: "Testing series routes.", password: PASSWORD },
  });
  const cookie = res.headers["set-cookie"] as string | string[];
  return ((Array.isArray(cookie) ? cookie[0] : cookie) ?? "").split(";")[0] ?? "";
}

async function setupAdmin(): Promise<string> {
  const cookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_USERNAME);
  await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
  return cookie;
}

async function setupMember(): Promise<string> {
  return registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/series", () => {
  it("returns 200 with no leftover test series before any are created", async () => {
    const res = await app.inject({ method: "GET", url: "/api/series" });
    expect(res.statusCode).toBe(200);
    const body = res.json<Array<{ slug: string }>>();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((s) => s.slug.startsWith(SLUG_PREFIX))).toBe(false);
  });

  it("returns 200 with array of series", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Alpha", description: "A test dictionary" },
    });

    const res = await app.inject({ method: "GET", url: "/api/series" });
    expect(res.statusCode).toBe(200);
    const body = res.json<Array<{ id: string; slug: string; title: string; description: string | null }>>();
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((s) => s.title === "Test Series Alpha");
    expect(found).toBeDefined();
    expect(found?.slug).toBe("test-series-alpha");
    expect(found?.description).toBe("A test dictionary");
  });
});

describe("POST /api/series", () => {
  it("returns 201 with correct shape for admin", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series One", description: "Description here" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      id: string;
      slug: string;
      title: string;
      description: string | null;
      inLanguage: string;
      outLanguage: string;
      createdAt: string;
      createdById: string | null;
    }>();
    expect(body.title).toBe("Test Series One");
    expect(body.slug).toBe("test-series-one");
    expect(body.description).toBe("Description here");
    expect(body.inLanguage).toBeDefined();
    expect(body.outLanguage).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(body.createdById).toBeDefined();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      payload: { title: "Test Series Unauth", description: "No auth" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated member", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: memberCookie },
      payload: { title: "Test Series Member", description: "Member attempt" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("auto-generates slug with suffix on duplicate title", async () => {
    const adminCookie = await setupAdmin();

    const res1 = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Dup", description: "First" },
    });
    expect(res1.statusCode).toBe(201);
    expect(res1.json<{ slug: string }>().slug).toBe("test-series-dup");

    const res2 = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Dup", description: "Second" },
    });
    expect(res2.statusCode).toBe(201);
    expect(res2.json<{ slug: string }>().slug).toBe("test-series-dup-2");
  });

  it("returns 400 for empty title", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "", description: "Some description" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for empty description", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Empty Desc", description: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for markup in title", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "<script>alert(1)</script>", description: "Some description" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for markup in description", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Markup Desc", description: "<img src=x onerror=alert(1)>" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for over-length title", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "a".repeat(201), description: "Some description" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for over-length description", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Over Length Desc", description: "a".repeat(5001) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts ordinary punctuation in title and description", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: {
        title: "Test Series & Co.",
        description: "A dictionary for \"quoted\" terms, 100% free.",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ title: string; description: string | null }>();
    expect(body.title).toBe("Test Series & Co.");
    expect(body.description).toBe("A dictionary for \"quoted\" terms, 100% free.");
  });
});

describe("DELETE /api/series/:slug", () => {
  it("returns 204 for admin deleting an existing series", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Delete Me", description: "To be deleted" },
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/series/test-series-delete-me",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(204);

    const check = await app.inject({ method: "GET", url: "/api/series/test-series-delete-me" });
    expect(check.statusCode).toBe(404);
  });

  it("returns 404 for unknown slug", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/series/nonexistent-slug",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/series/test-series-whatever",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated member", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Delete Auth", description: "Protected" },
    });

    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/series/test-series-delete-auth",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("PATCH /api/series/:slug", () => {
  it("returns 200 with updated series for admin", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Patch", description: "Original" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/series/test-series-patch",
      headers: { cookie: adminCookie },
      payload: { description: "Updated description" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ title: string; description: string | null }>();
    expect(body.title).toBe("Test Series Patch");
    expect(body.description).toBe("Updated description");
  });

  it("returns 404 for unknown slug", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/series/nonexistent-slug",
      headers: { cookie: adminCookie },
      payload: { description: "Whatever" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Patch Auth", description: "Original" },
    });

    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/series/test-series-patch-auth",
      headers: { cookie: memberCookie },
      payload: { description: "Sneaky update" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for markup in updated description", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "POST",
      url: "/api/series",
      headers: { cookie: adminCookie },
      payload: { title: "Test Series Patch Markup", description: "Original" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/series/test-series-patch-markup",
      headers: { cookie: adminCookie },
      payload: { description: "<script>alert(1)</script>" },
    });
    expect(res.statusCode).toBe(400);
  });
});
