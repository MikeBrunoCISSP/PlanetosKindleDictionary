import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { normalizeWord } from "@planetos/shared";
import { buildApp, cleanSeries } from "./helpers.js";

const SLUG_PREFIX = "test-search-series";

let app: FastifyInstance;
let prisma: PrismaClient;

async function createTestSeries(slugSuffix: string, title?: string): Promise<{ id: string; slug: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: title ?? `Test Search Series ${slugSuffix}` },
    select: { id: true, slug: true },
  });
}

async function createTestEntry(
  seriesId: string,
  options: {
    headword: string;
    definitionHtml?: string;
    inflections?: string[];
    status?: "PUBLISHED" | "DELETED";
    approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  }
): Promise<{ id: string; headword: string }> {
  const {
    headword,
    definitionHtml = "<p>A test definition.</p>",
    inflections = [],
    status = "PUBLISHED",
    approvalStatus = "APPROVED",
  } = options;

  const entry = await prisma.entry.create({
    data: {
      seriesId,
      headword,
      sortKey: normalizeWord(headword),
      definitionHtml,
      status,
      approvalStatus,
    },
  });

  await prisma.seriesWord.create({
    data: { seriesId, entryId: entry.id, normalizedWord: normalizeWord(headword) },
  });

  for (const value of inflections) {
    const inflection = await prisma.inflection.create({ data: { entryId: entry.id, value } });
    await prisma.seriesWord.create({
      data: { seriesId, entryId: entry.id, inflectionId: inflection.id, normalizedWord: normalizeWord(value) },
    });
  }

  return { id: entry.id, headword: entry.headword };
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterEach(async () => {
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/search", () => {
  it("returns 400 when q is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search" });
    expect(res.statusCode).toBe(400);
  });

  it("matches a headword via a case-insensitive substring", async () => {
    const series = await createTestSeries("headword-match", "ASOIAF");
    await createTestEntry(series.id, { headword: "Valar Morghulis" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=MORGHU" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: { headword: string; headwordMatched: boolean; seriesTitle: string }[];
    }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.headword).toBe("Valar Morghulis");
    expect(body.items[0]?.headwordMatched).toBe(true);
    expect(body.items[0]?.seriesTitle).toBe("ASOIAF");
  });

  it("matches via an inflection, not the headword, and marks headwordMatched false", async () => {
    const series = await createTestSeries("inflection-match");
    await createTestEntry(series.id, { headword: "Run", inflections: ["Ran", "Running"] });

    const res = await app.inject({ method: "GET", url: "/api/search?q=ran" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: { headword: string; headwordMatched: boolean; inflections: { value: string; matched: boolean }[] }[];
    }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.headwordMatched).toBe(false);
    const inflections = body.items[0]?.inflections ?? [];
    expect(inflections.find((i) => i.value === "Ran")?.matched).toBe(true);
    expect(inflections.find((i) => i.value === "Running")?.matched).toBe(false);
  });

  it("lists all inflections even when only the headword matched", async () => {
    const series = await createTestSeries("headword-with-inflections");
    await createTestEntry(series.id, { headword: "Wolf", inflections: ["Wolves"] });

    const res = await app.inject({ method: "GET", url: "/api/search?q=wolf" });
    const body = res.json<{ items: { headwordMatched: boolean; inflections: { value: string; matched: boolean }[] }[] }>();
    expect(body.items[0]?.headwordMatched).toBe(true);
    expect(body.items[0]?.inflections).toEqual([{ value: "Wolves", matched: false }]);
  });

  it("does not match when the term only appears in the definition", async () => {
    const series = await createTestSeries("definition-only");
    await createTestEntry(series.id, {
      headword: "Aes Sedai",
      definitionHtml: "<p>A channeler bound to the White Tower.</p>",
    });

    const res = await app.inject({ method: "GET", url: "/api/search?q=channeler" });
    expect(res.json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it("returns a truncated plain-text definition excerpt", async () => {
    const series = await createTestSeries("excerpt");
    const longText = "a".repeat(300);
    await createTestEntry(series.id, { headword: "Longword", definitionHtml: `<p>${longText}</p>` });

    const res = await app.inject({ method: "GET", url: "/api/search?q=longword" });
    const body = res.json<{ items: { definitionExcerpt: string }[] }>();
    expect(body.items[0]?.definitionExcerpt).toBe("a".repeat(256) + "...");
  });

  it("returns entries matching either word in a multi-word query", async () => {
    const series = await createTestSeries("multi-word-or");
    await createTestEntry(series.id, { headword: "Dragonstone" });
    await createTestEntry(series.id, { headword: "Wildfire" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=dragon%20fire" });
    const headwords = res.json<{ items: { headword: string }[] }>().items.map((i) => i.headword);
    expect(headwords).toContain("Dragonstone");
    expect(headwords).toContain("Wildfire");
  });

  it("ranks entries matching the first word above entries matching only the second", async () => {
    const series = await createTestSeries("multi-word-rank");
    await createTestEntry(series.id, { headword: "Wildfire" });
    await createTestEntry(series.id, { headword: "Dragonstone" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=dragon%20fire" });
    const headwords = res.json<{ items: { headword: string }[] }>().items.map((i) => i.headword);
    expect(headwords.indexOf("Dragonstone")).toBeLessThan(headwords.indexOf("Wildfire"));
  });

  it("ranks an entry matching both words by its earliest match, and returns it once", async () => {
    const series = await createTestSeries("multi-word-both");
    await createTestEntry(series.id, { headword: "Dragonfire" });
    await createTestEntry(series.id, { headword: "Wildfire" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=dragon%20fire" });
    const headwords = res.json<{ items: { headword: string }[] }>().items.map((i) => i.headword);
    expect(headwords.filter((h) => h === "Dragonfire")).toHaveLength(1);
    expect(headwords.indexOf("Dragonfire")).toBeLessThan(headwords.indexOf("Wildfire"));
  });

  it("excludes Pending entries even on an exact substring match", async () => {
    const series = await createTestSeries("pending-excluded");
    await createTestEntry(series.id, { headword: "Pendingword", approvalStatus: "PENDING" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=pendingword" });
    expect(res.json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it("excludes Rejected entries even on an exact substring match", async () => {
    const series = await createTestSeries("rejected-excluded");
    await createTestEntry(series.id, { headword: "Rejectedword", approvalStatus: "REJECTED" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=rejectedword" });
    expect(res.json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it("excludes Deleted entries even on an exact substring match", async () => {
    const series = await createTestSeries("deleted-excluded");
    await createTestEntry(series.id, { headword: "Deletedword", status: "DELETED" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=deletedword" });
    expect(res.json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it("paginates results at 50 per page and reports correct totals", async () => {
    const series = await createTestSeries("pagination");
    for (let i = 0; i < 62; i++) {
      await createTestEntry(series.id, { headword: `Paginationword${String(i).padStart(3, "0")}` });
    }

    const page1 = await app.inject({ method: "GET", url: "/api/search?q=paginationword" });
    const body1 = page1.json<{ items: unknown[]; totalCount: number; totalPages: number; limit: number }>();
    expect(body1.items).toHaveLength(50);
    expect(body1.totalCount).toBe(62);
    expect(body1.totalPages).toBe(2);
    expect(body1.limit).toBe(50);

    const page2 = await app.inject({ method: "GET", url: "/api/search?q=paginationword&page=2" });
    const body2 = page2.json<{ items: unknown[] }>();
    expect(body2.items).toHaveLength(12);
  });

  it("treats a literal % in the query as a literal character, not a wildcard", async () => {
    const series = await createTestSeries("percent-literal");
    await createTestEntry(series.id, { headword: "50% Off" });
    await createTestEntry(series.id, { headword: "Something Else" });

    const res = await app.inject({ method: "GET", url: `/api/search?q=${encodeURIComponent("50%")}` });
    const headwords = res.json<{ items: { headword: string }[] }>().items.map((i) => i.headword);
    expect(headwords).toEqual(["50% Off"]);
  });

  it("treats a literal _ in the query as a literal character, not a single-char wildcard", async () => {
    const series = await createTestSeries("underscore-literal");
    await createTestEntry(series.id, { headword: "foo_bar" });
    await createTestEntry(series.id, { headword: "fooxbar" });

    const res = await app.inject({ method: "GET", url: "/api/search?q=foo_bar" });
    const headwords = res.json<{ items: { headword: string }[] }>().items.map((i) => i.headword);
    expect(headwords).toEqual(["foo_bar"]);
  });

  it("returns an empty items array with no error when nothing matches", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search?q=nonexistentxyz123" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: unknown[]; totalCount: number }>();
    expect(body.items).toEqual([]);
    expect(body.totalCount).toBe(0);
  });
});
