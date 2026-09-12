import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers, cleanSeries } from "./helpers.js";

const ADMIN_EMAIL = "importadmin@example.com";
const ADMIN_USERNAME = "ImportAdminUser";
const MEMBER_EMAIL = "importmember@example.com";
const MEMBER_USERNAME = "ImportMemberUser";
const PASSWORD = "SecureP4ss!";
const SLUG_PREFIX = "test-entry-import-series";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string): Promise<string> {
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: "Testing bulk import.", password: PASSWORD },
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
  await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { role: "ADMIN" } });
  return cookie;
}

async function setupMember(): Promise<string> {
  const cookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
  await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { approvalStatus: "APPROVED" } });
  return cookie;
}

async function createTestSeries(slugSuffix: string): Promise<{ id: string; slug: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: `Test Entry Import Series ${slugSuffix}` },
    select: { id: true, slug: true },
  });
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

describe("POST /api/series/:slug/entries/import", () => {
  it("returns 401 for an unauthenticated request", async () => {
    const series = await createTestSeries("unauth");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries/import`,
      payload: { entries: { Wolf: "A wild canine." } },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for an authenticated non-admin", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("nonadmin");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries/import`,
      headers: { cookie: memberCookie },
      payload: { entries: { Wolf: "A wild canine." } },
    });
    expect(res.statusCode).toBe(403);

    const entry = await prisma.entry.findFirst({ where: { seriesId: series.id, headword: "Wolf" } });
    expect(entry).toBeNull();
  });

  it("returns 404 for an unknown series slug", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/series/does-not-exist-series/entries/import",
      headers: { cookie: adminCookie },
      payload: { entries: { Wolf: "A wild canine." } },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when entries is a top-level array, string, or number", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("badshape");

    for (const badEntries of [["Wolf"], "Wolf", 42]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: badEntries },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("returns 400 when the file has more entries than MAX_IMPORT_ENTRIES", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("toobig");

    const entries: Record<string, string> = {};
    for (let i = 0; i < 5001; i++) entries[`Word${i}`] = "A definition.";

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries/import`,
      headers: { cookie: adminCookie },
      payload: { entries },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates new headwords, skips existing/duplicate/invalid rows individually, and reports exact counts", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("mixed");

    // Pre-existing entry that the import file will also try to create,
    // in different casing, to prove the existing-in-DB duplicate path.
    const existingEntry = await prisma.entry.create({
      data: {
        seriesId: series.id,
        headword: "Existing",
        sortKey: "existing",
        definitionHtml: "<p>Already here.</p>",
        approvalStatus: "APPROVED",
      },
    });
    await prisma.seriesWord.create({
      data: { seriesId: series.id, entryId: existingEntry.id, normalizedWord: "existing" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries/import`,
      headers: { cookie: adminCookie },
      payload: {
        entries: {
          Wolf: "A wild canine.",
          existing: "Should be skipped as an existing duplicate.",
          Dragon: "A large, fire-breathing reptile.",
          dragon: "Should be skipped as an in-file duplicate.",
          "Two Words": "Should be skipped for a multi-word headword.",
          Empty: "",
          TooLong: "a".repeat(5001),
          NotString: 12345,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      totalInFile: number;
      createdCount: number;
      skippedDuplicateCount: number;
      skippedInvalidCount: number;
      createdHeadwords: string[];
      skippedDuplicateHeadwords: string[];
      skippedInvalid: { headword: string; reason: string }[];
      truncated: boolean;
    }>();

    expect(body.totalInFile).toBe(8);
    expect(body.createdCount).toBe(2); // Wolf, Dragon
    expect(body.skippedDuplicateCount).toBe(2); // existing, dragon
    expect(body.skippedInvalidCount).toBe(4); // Two Words, Empty, TooLong, NotString
    expect(body.truncated).toBe(false);

    expect(body.createdHeadwords.sort()).toEqual(["Dragon", "Wolf"]);
    expect(body.skippedDuplicateHeadwords.sort()).toEqual(["dragon", "existing"]);

    const reasonFor = (headword: string) => body.skippedInvalid.find((i) => i.headword === headword)?.reason;
    expect(reasonFor("Two Words")).toMatch(/space/i);
    expect(reasonFor("Empty")).toMatch(/required/i);
    expect(reasonFor("TooLong")).toMatch(/5,000/);
    expect(reasonFor("NotString")).toMatch(/not a string/i);

    const wolf = await prisma.entry.findFirstOrThrow({ where: { seriesId: series.id, headword: "Wolf" } });
    expect(wolf.approvalStatus).toBe("APPROVED");
    const revision = await prisma.revision.findFirstOrThrow({ where: { entryId: wolf.id } });
    expect(revision.action).toBe("CREATE");

    const seriesAfter = await prisma.series.findUniqueOrThrow({ where: { id: series.id } });
    expect(seriesAfter.dirtySince).not.toBeNull();
  });

  it("converts newline characters in a definition into <br> line breaks", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("newlines");

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries/import`,
      headers: { cookie: adminCookie },
      payload: { entries: { Braavos: "First paragraph.\n\nSecond paragraph." } },
    });

    expect(res.statusCode).toBe(200);
    const entry = await prisma.entry.findFirstOrThrow({ where: { seriesId: series.id, headword: "Braavos" } });
    // sanitizeDefinitionHtml (sanitize-html) re-serializes void elements as
    // self-closing - "<br />" renders identically to "<br>" in the browser.
    expect(entry.definitionHtml).toBe("First paragraph.<br /><br />Second paragraph.");
  });
});
