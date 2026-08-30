import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { normalizeWord } from "@planetos/shared";
import { buildApp, cleanUsers, cleanSeries } from "./helpers.js";
import * as storage from "../src/lib/storage.js";
import { getDictionaryBuildQueue } from "../src/lib/queues.js";
import { buildDictionaryFilename } from "../src/lib/filename.js";

const ADMIN_EMAIL = "downloadsadmin@example.com";
const ADMIN_USERNAME = "DownloadsAdminUser";
const MEMBER_EMAIL = "downloadsmember@example.com";
const MEMBER_USERNAME = "DownloadsMemberUser";
const PASSWORD = "SecureP4ss!";
const SLUG_PREFIX = "test-downloads-series";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string): Promise<string> {
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: "Testing downloads.", password: PASSWORD },
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
  await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
  return cookie;
}

async function setupMember(): Promise<string> {
  const cookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
  await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { approvalStatus: "APPROVED" } });
  return cookie;
}

async function createTestSeries(slugSuffix: string): Promise<{ id: string; slug: string; title: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: `Test Downloads Series ${slugSuffix}` },
    select: { id: true, slug: true, title: true },
  });
}

async function createSuccessBuild(seriesId: string, suffix: string, createdAt: Date) {
  const epubKey = `builds/${seriesId}/${suffix}/dictionary.epub`;
  const sourceKey = `builds/${seriesId}/${suffix}/sources.zip`;
  await storage.putObject(epubKey, Buffer.from(`epub-${suffix}`), "application/epub+zip");
  await storage.putObject(sourceKey, Buffer.from(`sources-${suffix}`), "application/zip");
  return prisma.build.create({
    data: {
      seriesId,
      status: "SUCCESS",
      contentHash: `hash-${suffix}`,
      entryCount: 1,
      epubKey,
      sourceKey,
      epubBytes: 10,
      createdAt,
      finishedAt: createdAt,
    },
  });
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await storage.ensureBucketExists();
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterAll(async () => {
  await getDictionaryBuildQueue().obliterate({ force: true });
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/series/:slug/rebuild", () => {
  it("returns 202 and enqueues a build for an admin regardless of unchanged content", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("rebuild-happy");
    await createSuccessBuild(series.id, "existing", new Date());
    // Set Series.contentHash to something so an unrelated sweep wouldn't fire - manual rebuild should still work.
    await prisma.series.update({ where: { id: series.id }, data: { contentHash: "unrelated-hash" } });

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/rebuild`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json<{ jobId: string }>();
    expect(body.jobId).toBeTruthy();

    const job = await getDictionaryBuildQueue().getJob(body.jobId);
    expect(job).toBeDefined();
    expect(job?.data).toEqual({ seriesId: series.id });
  });

  it("returns 403 for a non-admin", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("rebuild-forbidden");

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/rebuild`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 for an unauthenticated request", async () => {
    const series = await createTestSeries("rebuild-unauth");
    const res = await app.inject({ method: "POST", url: `/api/series/${series.slug}/rebuild` });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for an unknown slug", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${SLUG_PREFIX}-nonexistent/rebuild`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/series/:slug/download and /download/source", () => {
  it("302s to a presigned URL that returns the latest successful build's actual content, no auth required", async () => {
    const series = await createTestSeries("download-happy");
    await createSuccessBuild(series.id, "old", new Date(Date.now() - 10_000));
    const newest = await createSuccessBuild(series.id, "new", new Date());

    const res = await app.inject({ method: "GET", url: `/api/series/${series.slug}/download` });
    expect(res.statusCode).toBe(302);
    const location = res.headers["location"] as string;
    expect(location).toBeTruthy();

    const fetched = await fetch(location);
    expect(fetched.status).toBe(200);
    const body = await fetched.text();
    expect(body).toBe(`epub-new`);

    const expectedFilename = buildDictionaryFilename(series.title, newest.createdAt);
    expect(fetched.headers.get("content-disposition")).toBe(`attachment; filename="${expectedFilename}"`);
  });

  it("sources download 302s to a presigned URL for the latest build's sources archive", async () => {
    const series = await createTestSeries("download-source");
    await createSuccessBuild(series.id, "only", new Date());

    const res = await app.inject({ method: "GET", url: `/api/series/${series.slug}/download/source` });
    expect(res.statusCode).toBe(302);
    const fetched = await fetch(res.headers["location"] as string);
    expect(await fetched.text()).toBe("sources-only");
  });

  it("returns 404 (NO_BUILD_AVAILABLE) when the series has no successful build yet", async () => {
    const series = await createTestSeries("download-no-build");
    const res = await app.inject({ method: "GET", url: `/api/series/${series.slug}/download` });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ type?: string; detail?: string }>();
    expect(body.type).toBe("urn:planetos:error:no-build-available");
    expect(body.detail).toContain("No dictionary build is available");
  });

  it("returns 404 (NO_BUILD_AVAILABLE) when the series only has a FAILED build", async () => {
    const series = await createTestSeries("download-only-failed");
    await prisma.build.create({
      data: { seriesId: series.id, status: "FAILED", contentHash: "x", entryCount: 0, error: "boom" },
    });
    const res = await app.inject({ method: "GET", url: `/api/series/${series.slug}/download` });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for an unknown series slug", async () => {
    const res = await app.inject({ method: "GET", url: `/api/series/${SLUG_PREFIX}-nonexistent/download` });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/downloads", () => {
  it("includes a series with a SUCCESS build, ordered by title, and omits series with no successful build", async () => {
    const zebra = await createTestSeries("zebra");
    await createSuccessBuild(zebra.id, "only", new Date());

    const noBuild = await createTestSeries("no-build-yet");
    void noBuild;

    const onlyFailed = await createTestSeries("only-failed");
    await prisma.build.create({
      data: { seriesId: onlyFailed.id, status: "FAILED", contentHash: "x", entryCount: 0, error: "boom" },
    });

    const aardvark = await createTestSeries("aardvark");
    await createSuccessBuild(aardvark.id, "only", new Date());

    const res = await app.inject({ method: "GET", url: "/api/downloads" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ slug: string; title: string }[]>();

    const slugs = body.map((s) => s.slug);
    expect(slugs).toContain(zebra.slug);
    expect(slugs).toContain(aardvark.slug);
    expect(slugs).not.toContain(noBuild.slug);
    expect(slugs).not.toContain(onlyFailed.slug);

    const aardvarkIndex = body.findIndex((s) => s.slug === aardvark.slug);
    const zebraIndex = body.findIndex((s) => s.slug === zebra.slug);
    expect(aardvarkIndex).toBeLessThan(zebraIndex);

    for (const item of body) {
      expect(item).toHaveProperty("slug");
      expect(item).toHaveProperty("title");
      expect(Object.keys(item).sort()).toEqual(["slug", "title"]);
    }
  });

  it("requires no authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/api/downloads" });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /api/series/:slug/builds", () => {
  it("returns build history without requiring auth, omitting error/log entirely", async () => {
    const series = await createTestSeries("builds-list");
    await createSuccessBuild(series.id, "s1", new Date(Date.now() - 5000));
    await prisma.build.create({
      data: { seriesId: series.id, status: "FAILED", contentHash: "x", entryCount: 0, error: "diagnostic detail" },
    });

    const res = await app.inject({ method: "GET", url: `/api/series/${series.slug}/builds` });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>[]>();
    expect(body).toHaveLength(2);
    for (const item of body) {
      expect(item).not.toHaveProperty("error");
      expect(item).not.toHaveProperty("log");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("createdAt");
      expect(item).toHaveProperty("entryCount");
    }
  });

  it("returns 404 for an unknown series slug", async () => {
    const res = await app.inject({ method: "GET", url: `/api/series/${SLUG_PREFIX}-nonexistent/builds` });
    expect(res.statusCode).toBe(404);
  });
});
