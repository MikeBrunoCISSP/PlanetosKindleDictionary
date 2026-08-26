import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { normalizeWord } from "@planetos/shared";
import { buildApp, cleanSeries } from "./helpers.js";

const SLUG_PREFIX = "test-entry-detail-series";

let app: FastifyInstance;
let prisma: PrismaClient;

async function createTestSeries(slugSuffix: string): Promise<{ id: string; slug: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: `Test Entry Detail Series ${slugSuffix}` },
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
): Promise<{ id: string }> {
  const {
    headword,
    definitionHtml = "<p>A test definition.</p>",
    inflections = [],
    status = "PUBLISHED",
    approvalStatus = "APPROVED",
  } = options;

  const entry = await prisma.entry.create({
    data: { seriesId, headword, sortKey: normalizeWord(headword), definitionHtml, status, approvalStatus },
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

  return { id: entry.id };
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

describe("GET /api/entries/:id", () => {
  it("returns an Approved entry to an anonymous request", async () => {
    const series = await createTestSeries("approved");
    const { id } = await createTestEntry(series.id, {
      headword: "Aes Sedai",
      inflections: ["Aes Sedai's"],
    });

    const res = await app.inject({ method: "GET", url: `/api/entries/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: string;
      seriesId: string;
      seriesSlug: string;
      headword: string;
      approvalStatus: string;
      inflections: { value: string }[];
    }>();
    expect(body.id).toBe(id);
    expect(body.seriesId).toBe(series.id);
    expect(body.seriesSlug).toBe(series.slug);
    expect(body.headword).toBe("Aes Sedai");
    expect(body.approvalStatus).toBe("APPROVED");
    expect(body.inflections.map((i) => i.value)).toEqual(["Aes Sedai's"]);
  });

  it("returns a Pending entry to an anonymous request", async () => {
    const series = await createTestSeries("pending");
    const { id } = await createTestEntry(series.id, { headword: "Pendingword", approvalStatus: "PENDING" });

    const res = await app.inject({ method: "GET", url: `/api/entries/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ approvalStatus: string }>().approvalStatus).toBe("PENDING");
  });

  it("404s for a Rejected entry", async () => {
    const series = await createTestSeries("rejected");
    const { id } = await createTestEntry(series.id, { headword: "Rejectedword", approvalStatus: "REJECTED" });

    const res = await app.inject({ method: "GET", url: `/api/entries/${id}` });
    expect(res.statusCode).toBe(404);
  });

  it("404s for a soft-deleted entry", async () => {
    const series = await createTestSeries("deleted");
    const { id } = await createTestEntry(series.id, { headword: "Deletedword", status: "DELETED" });

    const res = await app.inject({ method: "GET", url: `/api/entries/${id}` });
    expect(res.statusCode).toBe(404);
  });

  it("404s for an unknown id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/entries/nonexistent-id" });
    expect(res.statusCode).toBe(404);
  });

  it("never includes review-internal fields", async () => {
    const series = await createTestSeries("no-internal-fields");
    const { id } = await createTestEntry(series.id, { headword: "Cleanword" });

    const res = await app.inject({ method: "GET", url: `/api/entries/${id}` });
    const text = JSON.stringify(res.json());
    expect(text).not.toMatch(/submittedById|reviewedById|reviewedAt|rejectionNote/);
  });
});
