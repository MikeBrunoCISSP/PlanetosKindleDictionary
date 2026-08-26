import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers, cleanSeries } from "./helpers.js";

const ADMIN_EMAIL = "entriesadmin@example.com";
const ADMIN_USERNAME = "EntriesAdminUser";
const MEMBER_EMAIL = "entriesmember@example.com";
const MEMBER_USERNAME = "EntriesMemberUser";
const MEMBER2_EMAIL = "entriesmember2@example.com";
const MEMBER2_USERNAME = "EntriesMemberUser2";
const PASSWORD = "SecureP4ss!";
const SLUG_PREFIX = "test-entries-series";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: "Testing the dictionary.", password: PASSWORD },
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
  const cookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
  await prisma.user.update({ where: { email: MEMBER_EMAIL }, data: { approvalStatus: "APPROVED" } });
  return cookie;
}

async function setupPendingMember(): Promise<string> {
  return registerAndGetCookie(MEMBER2_EMAIL, MEMBER2_USERNAME);
}

async function createTestSeries(slugSuffix: string): Promise<{ id: string; slug: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: `Test Entries Series ${slugSuffix}` },
    select: { id: true, slug: true },
  });
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER2_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL, MEMBER2_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/series/:slug/entries", () => {
  it("returns 201 for an authenticated member with correct shape, Pending status, and a CREATE revision", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("happy");

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: {
        headword: "Aes Sedai",
        definitionHtml: "<p>A channeler bound to the White Tower.</p>",
        inflections: ["Aes Sedai's", "Aes-Sedai"],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{
      id: string;
      seriesId: string;
      headword: string;
      definitionHtml: string;
      inflections: { id: string; value: string }[];
      approvalStatus: string;
      submittedById: string | null;
      createdAt: string;
    }>();
    expect(body.headword).toBe("Aes Sedai");
    expect(body.seriesId).toBe(series.id);
    expect(body.approvalStatus).toBe("PENDING");
    expect(body.submittedById).toBeTruthy();
    expect(body.inflections.map((i) => i.value).sort()).toEqual(["Aes Sedai's", "Aes-Sedai"].sort());

    const revisions = await prisma.revision.findMany({ where: { entryId: body.id } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.action).toBe("CREATE");
  });

  it("returns 401 for unauthenticated request", async () => {
    const series = await createTestSeries("unauth");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      payload: { headword: "Unauth Word", definitionHtml: "<p>Definition</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for a Pending (not yet approved) member", async () => {
    const pendingCookie = await setupPendingMember();
    const series = await createTestSeries("pending-member");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: pendingCookie },
      payload: { headword: "Pending Word", definitionHtml: "<p>Definition</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 201 for an admin regardless of the admin's own approval status", async () => {
    const adminCookie = await setupAdmin();
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    expect(admin.approvalStatus).toBe("PENDING");

    const series = await createTestSeries("admin-bypass");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: adminCookie },
      payload: { headword: "Admin Word", definitionHtml: "<p>Definition</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 404 for an unknown series slug", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${SLUG_PREFIX}-nonexistent/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Ghost Word", definitionHtml: "<p>Definition</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for a missing headword", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("missing-headword");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "", definitionHtml: "<p>Definition</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a missing definition", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("missing-def");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Some Word", definitionHtml: "", inflections: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for markup in the headword", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("markup-headword");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: {
        headword: "<script>alert(1)</script>",
        definitionHtml: "<p>Definition</p>",
        inflections: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("sanitizes disallowed markup out of the definition instead of rejecting it", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("sanitize-def");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: {
        headword: "Sanitized Word",
        definitionHtml: '<p>Safe</p><script>alert(1)</script><img src="x">',
        inflections: [],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ definitionHtml: string }>();
    expect(body.definitionHtml).not.toContain("<script>");
    expect(body.definitionHtml).not.toContain("<img");
    expect(body.definitionHtml).toContain("Safe");
  });

  it("returns 409 when the headword duplicates an existing headword (case-insensitive, trimmed)", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("dup-headword");
    await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Mat Cauthon", definitionHtml: "<p>Definition</p>", inflections: [] },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "  mat cauthon  ", definitionHtml: "<p>Another</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 when the headword duplicates another entry's inflection", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("dup-headword-vs-inflection");
    await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Perrin", definitionHtml: "<p>Definition</p>", inflections: ["Perrin's"] },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Perrin's", definitionHtml: "<p>Another</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 when an inflection duplicates an existing headword", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("dup-inflection-vs-headword");
    await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Rand", definitionHtml: "<p>Definition</p>", inflections: [] },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Someone Else", definitionHtml: "<p>Another</p>", inflections: ["Rand"] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 when an inflection duplicates another entry's inflection", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("dup-inflection-vs-inflection");
    await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Egwene", definitionHtml: "<p>Definition</p>", inflections: ["Egwene's"] },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Nynaeve", definitionHtml: "<p>Another</p>", inflections: ["egwene's"] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 400 when an inflection is identical to the headword", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("inflection-eq-headword");
    const res = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Moiraine", definitionHtml: "<p>Definition</p>", inflections: ["moiraine"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts the same word in a different dictionary", async () => {
    const memberCookie = await setupMember();
    const seriesA = await createTestSeries("scope-a");
    const seriesB = await createTestSeries("scope-b");

    const resA = await app.inject({
      method: "POST",
      url: `/api/series/${seriesA.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Shared Word", definitionHtml: "<p>A</p>", inflections: [] },
    });
    expect(resA.statusCode).toBe(201);

    const resB = await app.inject({
      method: "POST",
      url: `/api/series/${seriesB.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Shared Word", definitionHtml: "<p>B</p>", inflections: [] },
    });
    expect(resB.statusCode).toBe(201);
  });

  it("does not create duplicate entries under concurrent submissions of the same headword", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("race");

    const payload = { headword: "Concurrent Word", definitionHtml: "<p>Definition</p>", inflections: [] };
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries`,
        headers: { cookie: memberCookie },
        payload,
      }),
      app.inject({
        method: "POST",
        url: `/api/series/${series.slug}/entries`,
        headers: { cookie: memberCookie },
        payload,
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const entries = await prisma.entry.findMany({ where: { seriesId: series.id } });
    expect(entries).toHaveLength(1);
    const words = await prisma.seriesWord.findMany({ where: { seriesId: series.id } });
    expect(words).toHaveLength(1);
  });
});

describe("GET /api/series/:slug/entries/words", () => {
  it("returns 401 for unauthenticated request", async () => {
    const series = await createTestSeries("words-unauth");
    const res = await app.inject({ method: "GET", url: `/api/series/${series.slug}/entries/words` });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for an unknown series slug", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "GET",
      url: `/api/series/${SLUG_PREFIX}-nonexistent/entries/words`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns headwords and inflections across all entries in the series", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("words-list");
    await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Words Word", definitionHtml: "<p>Detail</p>", inflections: ["Words Words"] },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/series/${series.slug}/entries/words`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<string[]>().sort()).toEqual(["Words Word", "Words Words"].sort());
  });
});

describe("GET /api/admin/entries/pending", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/entries/pending" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/entries/pending",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists pending entries oldest-first and excludes approved/rejected entries", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("queue-order");

    const first = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "First Word", definitionHtml: "<p>1</p>", inflections: [] },
    });
    const second = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Second Word", definitionHtml: "<p>2</p>", inflections: [] },
    });
    const third = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Third Word", definitionHtml: "<p>3</p>", inflections: [] },
    });
    const thirdId = third.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/admin/entries/${thirdId}/approve`,
      headers: { cookie: adminCookie },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/entries/pending",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; headword: string }[]>();
    const ids = body.map((e) => e.id);
    expect(ids).toContain(first.json<{ id: string }>().id);
    expect(ids).toContain(second.json<{ id: string }>().id);
    expect(ids).not.toContain(thirdId);
    expect(ids.indexOf(first.json<{ id: string }>().id)).toBeLessThan(
      ids.indexOf(second.json<{ id: string }>().id)
    );
  });
});

describe("GET /api/admin/entries/:id", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/entries/nonexistent" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/entries/nonexistent",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns full detail including inflections", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("detail-with-inflections");
    const created = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: {
        headword: "Detail Word",
        definitionHtml: "<p>Detail</p>",
        inflections: ["Detail Words"],
      },
    });
    const id = created.json<{ id: string }>().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/entries/${id}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ headword: string; definitionHtml: string; inflections: { value: string }[] }>();
    expect(body.headword).toBe("Detail Word");
    expect(body.inflections.map((i) => i.value)).toEqual(["Detail Words"]);
  });

  it("returns an empty inflections array when there are none", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("detail-no-inflections");
    const created = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "No Inflections Word", definitionHtml: "<p>Detail</p>", inflections: [] },
    });
    const id = created.json<{ id: string }>().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/entries/${id}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ inflections: unknown[] }>().inflections).toEqual([]);
  });
});

describe("POST /api/admin/entries/:id/approve", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/entries/nonexistent/approve" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/entries/nonexistent/approve",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("transitions Pending to Approved and creates an UPDATE revision", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("approve-happy");
    const created = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Approve Me", definitionHtml: "<p>Detail</p>", inflections: [] },
    });
    const id = created.json<{ id: string }>().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entries/${id}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ approvalStatus: string }>().approvalStatus).toBe("APPROVED");

    const revisions = await prisma.revision.findMany({ where: { entryId: id }, orderBy: { createdAt: "asc" } });
    expect(revisions).toHaveLength(2);
    expect(revisions[1]?.action).toBe("UPDATE");
  });

  it("returns 409 when approving an already-reviewed entry", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("approve-twice");
    const created = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Approve Twice", definitionHtml: "<p>Detail</p>", inflections: [] },
    });
    const id = created.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/admin/entries/${id}/approve`,
      headers: { cookie: adminCookie },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entries/${id}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 for an unknown entry id", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/entries/nonexistent-id/approve",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/admin/entries/:id/reject", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/entries/nonexistent/reject" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/entries/nonexistent/reject",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("transitions Pending to Rejected and persists a note", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("reject-with-note");
    const created = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Reject Me", definitionHtml: "<p>Detail</p>", inflections: [] },
    });
    const id = created.json<{ id: string }>().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entries/${id}/reject`,
      headers: { cookie: adminCookie },
      payload: { note: "Not a real word." },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ approvalStatus: string; rejectionNote: string | null }>();
    expect(body.approvalStatus).toBe("REJECTED");
    expect(body.rejectionNote).toBe("Not a real word.");
  });

  it("transitions Pending to Rejected without a note", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("reject-no-note");
    const created = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Reject Me Silently", definitionHtml: "<p>Detail</p>", inflections: [] },
    });
    const id = created.json<{ id: string }>().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entries/${id}/reject`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ approvalStatus: string; rejectionNote: string | null }>();
    expect(body.approvalStatus).toBe("REJECTED");
    expect(body.rejectionNote).toBeNull();
  });

  it("removes the entry from the pending queue after rejection", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("reject-queue-removal");
    const created = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Reject Queue Word", definitionHtml: "<p>Detail</p>", inflections: [] },
    });
    const id = created.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/admin/entries/${id}/reject`,
      headers: { cookie: adminCookie },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/entries/pending",
      headers: { cookie: adminCookie },
    });
    const ids = res.json<{ id: string }[]>().map((e) => e.id);
    expect(ids).not.toContain(id);
  });
});
