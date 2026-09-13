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

function entryValue(Definition: string, Inflections: string[] = []) {
  return { Definition, Inflections };
}

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

type ImportResponseBody = {
  totalInFile: number;
  createdCount: number;
  skippedDuplicateCount: number;
  skippedInvalidCount: number;
  createdHeadwords: string[];
  skippedDuplicateHeadwords: string[];
  skippedInvalid: { headword: string; reason: string }[];
  truncated: boolean;
  droppedInflectionCount: number;
};

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
      payload: { entries: { Wolf: entryValue("A wild canine.") } },
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
      payload: { entries: { Wolf: entryValue("A wild canine.") } },
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
      payload: { entries: { Wolf: entryValue("A wild canine.") } },
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

    const entries: Record<string, ReturnType<typeof entryValue>> = {};
    for (let i = 0; i < 5001; i++) entries[`Word${i}`] = entryValue("A definition.");

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
          Wolf: entryValue("A wild canine."),
          existing: entryValue("Should be skipped as an existing duplicate."),
          Dragon: entryValue("A large, fire-breathing reptile."),
          dragon: entryValue("Should be skipped as an in-file duplicate."),
          "Two Words": entryValue("Should be skipped for a multi-word headword."),
          Empty: entryValue(""),
          TooLong: entryValue("a".repeat(5001)),
          NotAnObject: 12345,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ImportResponseBody>();

    expect(body.totalInFile).toBe(8);
    expect(body.createdCount).toBe(2); // Wolf, Dragon
    expect(body.skippedDuplicateCount).toBe(2); // existing, dragon
    expect(body.skippedInvalidCount).toBe(4); // Two Words, Empty, TooLong, NotAnObject
    expect(body.truncated).toBe(false);
    expect(body.droppedInflectionCount).toBe(0);

    expect(body.createdHeadwords.sort()).toEqual(["Dragon", "Wolf"]);
    expect(body.skippedDuplicateHeadwords.sort()).toEqual(["dragon", "existing"]);

    const reasonFor = (headword: string) => body.skippedInvalid.find((i) => i.headword === headword)?.reason;
    expect(reasonFor("Two Words")).toMatch(/space/i);
    expect(reasonFor("Empty")).toMatch(/required/i);
    expect(reasonFor("TooLong")).toMatch(/5,000/);
    expect(reasonFor("NotAnObject")).toMatch(/not an object/i);

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
      payload: { entries: { Braavos: entryValue("First paragraph.\n\nSecond paragraph.") } },
    });

    expect(res.statusCode).toBe(200);
    const entry = await prisma.entry.findFirstOrThrow({ where: { seriesId: series.id, headword: "Braavos" } });
    // sanitizeDefinitionHtml (sanitize-html) re-serializes void elements as
    // self-closing - "<br />" renders identically to "<br>" in the browser.
    expect(entry.definitionHtml).toBe("First paragraph.<br /><br />Second paragraph.");
  });

  describe("Inflections", () => {
    it("creates an entry with its inflections, which appear on the resulting entry", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("with-inflections");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Run: entryValue("To move fast on foot.", ["Ran", "Running"]) } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(1);
      expect(body.droppedInflectionCount).toBe(0);

      const entry = await prisma.entry.findFirstOrThrow({
        where: { seriesId: series.id, headword: "Run" },
        include: { inflections: true },
      });
      expect(entry.inflections.map((i) => i.value).sort()).toEqual(["Ran", "Running"]);
    });

    it("drops a multi-word inflection but still creates the entry with its other inflections", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("infl-space");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Run: entryValue("To move fast on foot.", ["Ran", "Two Words"]) } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(1);
      expect(body.skippedInvalidCount).toBe(0);
      expect(body.droppedInflectionCount).toBe(1);

      const entry = await prisma.entry.findFirstOrThrow({
        where: { seriesId: series.id, headword: "Run" },
        include: { inflections: true },
      });
      expect(entry.inflections.map((i) => i.value)).toEqual(["Ran"]);
    });

    it("drops an inflection that duplicates its own headword but still creates the entry", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("infl-self-dup");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Run: entryValue("To move fast on foot.", ["run", "Ran"]) } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(1);
      expect(body.droppedInflectionCount).toBe(1);

      const entry = await prisma.entry.findFirstOrThrow({
        where: { seriesId: series.id, headword: "Run" },
        include: { inflections: true },
      });
      expect(entry.inflections.map((i) => i.value)).toEqual(["Ran"]);
    });

    it("collapses a case-insensitive duplicate inflection within the same row, keeping the first occurrence", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("infl-row-dup");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Run: entryValue("To move fast on foot.", ["Ran", "RAN", "Running"]) } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(1);
      expect(body.droppedInflectionCount).toBe(1);

      const entry = await prisma.entry.findFirstOrThrow({
        where: { seriesId: series.id, headword: "Run" },
        include: { inflections: true },
      });
      expect(entry.inflections.map((i) => i.value).sort()).toEqual(["Ran", "Running"]);
    });

    it("drops an empty/whitespace-only or oversized inflection but still creates the entry", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("infl-empty-oversized");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: {
          entries: {
            Run: entryValue("To move fast on foot.", ["Ran", "   ", "a".repeat(201)]),
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(1);
      expect(body.droppedInflectionCount).toBe(2);

      const entry = await prisma.entry.findFirstOrThrow({
        where: { seriesId: series.id, headword: "Run" },
        include: { inflections: true },
      });
      expect(entry.inflections.map((i) => i.value)).toEqual(["Ran"]);
    });

    it("skips the whole row when it still has too many inflections after cleanup", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("infl-too-many");

      const tooMany = Array.from({ length: 60 }, (_, i) => `Infl${i}`);
      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Run: entryValue("To move fast on foot.", tooMany) } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(0);
      expect(body.skippedInvalidCount).toBe(1);
      expect(body.skippedInvalid[0]?.reason).toMatch(/at most 50 inflections/i);
      // The row was never created, so cleanup on it must not count toward
      // the response's dropped-inflection total (openspec: entries/bulk-import).
      expect(body.droppedInflectionCount).toBe(0);

      const entry = await prisma.entry.findFirst({ where: { seriesId: series.id, headword: "Run" } });
      expect(entry).toBeNull();
    });

    it("is not skipped for exceeding the inflection limit before cleanup, once duplicates are removed", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("infl-dedup-under-limit");

      // 45 unique inflections plus 15 case-variant repeats of the first one:
      // 60 raw items, but only 45 unique after cleanup - under the 50 cap.
      const unique = Array.from({ length: 45 }, (_, i) => `Infl${i}`);
      const repeats = Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? "infl0" : "INFL0"));
      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Run: entryValue("To move fast on foot.", [...unique, ...repeats]) } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(1);
      expect(body.droppedInflectionCount).toBe(15);

      const entry = await prisma.entry.findFirstOrThrow({
        where: { seriesId: series.id, headword: "Run" },
        include: { inflections: true },
      });
      expect(entry.inflections).toHaveLength(45);
    });

    it("skips the whole row (cross-entry case, unchanged) when an inflection collides with existing content elsewhere in the dictionary", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("infl-cross-entry-dup");

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
        payload: { entries: { Newword: entryValue("A brand new headword.", ["existing"]) } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(0);
      expect(body.skippedDuplicateCount).toBe(1);
      expect(body.skippedDuplicateHeadwords).toEqual(["Newword"]);
      expect(body.droppedInflectionCount).toBe(0);

      const entry = await prisma.entry.findFirst({ where: { seriesId: series.id, headword: "Newword" } });
      expect(entry).toBeNull();
    });

    it("skips a value that is a plain string (old flat-shape) with a clear reason", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("old-shape-value");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Wolf: "A wild canine." } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(0);
      expect(body.skippedInvalid[0]?.reason).toMatch(/not an object/i);
    });

    it("skips a value missing Definition", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("missing-definition");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Wolf: { Inflections: ["Wolves"] } } },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(0);
      expect(body.skippedInvalid[0]?.reason).toMatch(/definition is not a string/i);
    });

    it("skips a value whose Inflections is not an array of strings", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("bad-inflections-shape");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: {
          entries: {
            Wolf: entryValue("A wild canine.", ["Wolves"]),
            NotAnArray: { Definition: "x", Inflections: "not-an-array" },
            MixedArray: { Definition: "y", Inflections: ["Ok", 5] },
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(1);
      expect(body.skippedInvalidCount).toBe(2);
      const reasonFor = (headword: string) => body.skippedInvalid.find((i) => i.headword === headword)?.reason;
      expect(reasonFor("NotAnArray")).toMatch(/inflections is not an array/i);
      expect(reasonFor("MixedArray")).toMatch(/inflections is not an array/i);
    });

    it("records the entry's cleaned inflections in the CREATE revision snapshot", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("revision-snapshot");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: { entries: { Run: entryValue("To move fast on foot.", ["Ran", "Ran", "Running"]) } },
      });

      expect(res.statusCode).toBe(200);
      const entry = await prisma.entry.findFirstOrThrow({ where: { seriesId: series.id, headword: "Run" } });
      const revision = await prisma.revision.findFirstOrThrow({ where: { entryId: entry.id } });
      const snapshot = revision.snapshot as { inflections: string[] };
      expect(snapshot.inflections.sort()).toEqual(["Ran", "Running"]);
    });
  });

  describe("droppedInflectionCount", () => {
    it("is 0 when nothing was dropped anywhere in the file", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("dropped-none");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: {
          entries: {
            Wolf: entryValue("A wild canine.", ["Wolves"]),
            Dragon: entryValue("A large, fire-breathing reptile."),
          },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<ImportResponseBody>().droppedInflectionCount).toBe(0);
    });

    it("totals dropped values across multiple rows, not the number of affected rows", async () => {
      const adminCookie = await setupAdmin();
      const series = await createTestSeries("dropped-multi-row");

      const res = await app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries/import`,
        headers: { cookie: adminCookie },
        payload: {
          entries: {
            // Drops 1 (the self-duplicate).
            Run: entryValue("To move fast on foot.", ["run", "Ran"]),
            // Drops 2 (both a same-row duplicate and a multi-word value).
            Wolf: entryValue("A wild canine.", ["Wolves", "wolves", "Two Words"]),
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<ImportResponseBody>();
      expect(body.createdCount).toBe(2);
      expect(body.droppedInflectionCount).toBe(3);
    });
  });
});
