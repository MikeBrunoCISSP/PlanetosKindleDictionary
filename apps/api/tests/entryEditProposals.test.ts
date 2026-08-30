import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { normalizeWord } from "@planetos/shared";
import { buildApp, cleanUsers, cleanSeries } from "./helpers.js";

const ADMIN_EMAIL = "editproposalsadmin@example.com";
const ADMIN_USERNAME = "EditProposalsAdmin";
const MEMBER_EMAIL = "editproposalsmember@example.com";
const MEMBER_USERNAME = "EditProposalsMember";
const PASSWORD = "SecureP4ss!";
const SLUG_PREFIX = "test-edit-proposals-series";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string): Promise<string> {
  await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: "Testing edit proposals.", password: PASSWORD },
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

async function createTestSeries(slugSuffix: string): Promise<{ id: string; slug: string }> {
  const slug = `${SLUG_PREFIX}-${slugSuffix}`;
  return prisma.series.create({
    data: { slug, title: `Test Edit Proposals Series ${slugSuffix}` },
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

describe("POST /api/entries/:id/edit-proposals", () => {
  it("creates a Pending proposal attributed to the submitter, entry unchanged", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("valid-submission");
    const { id } = await createTestEntry(series.id, { headword: "Wolf", inflections: ["Wolves"] });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>An updated definition.</p>", inflections: ["Wolves", "Wolfish"] },
    });
    expect(res.statusCode).toBe(201);

    const proposal = await prisma.entryEditProposal.findFirstOrThrow({ where: { entryId: id } });
    expect(proposal.status).toBe("PENDING");
    expect(proposal.proposedDefinitionHtml).toContain("updated definition");

    const entry = await prisma.entry.findUniqueOrThrow({ where: { id } });
    expect(entry.definitionHtml).toBe("<p>A test definition.</p>");
  });

  it("rejects an unauthenticated request and creates nothing", async () => {
    const series = await createTestSeries("unauth");
    const { id } = await createTestEntry(series.id, { headword: "Anonword" });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      payload: { definitionHtml: "<p>New.</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(401);
    const count = await prisma.entryEditProposal.count({ where: { entryId: id } });
    expect(count).toBe(0);
  });

  it("404s for a non-existent entry", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({
      method: "POST",
      url: "/api/entries/nonexistent-id/edit-proposals",
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>New.</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s for an entry that is still Pending its first review", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("still-pending");
    const { id } = await createTestEntry(series.id, { headword: "Pendingword", approvalStatus: "PENDING" });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>New.</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a whitespace-only definition", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("blank-def");
    const { id } = await createTestEntry(series.id, { headword: "Blankword" });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "   ", inflections: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a definition over 5,000 characters", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("long-def");
    const { id } = await createTestEntry(series.id, { headword: "Longword" });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: `<p>${"a".repeat(5001)}</p>`, inflections: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a proposed inflection that duplicates another entry's headword", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("conflict-headword");
    await createTestEntry(series.id, { headword: "Existingword" });
    const { id } = await createTestEntry(series.id, { headword: "Targetword" });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>New.</p>", inflections: ["Existingword"] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a proposed inflection identical to the entry's own headword", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("self-headword");
    const { id } = await createTestEntry(series.id, { headword: "Selfword" });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>New.</p>", inflections: ["selfword"] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects internally-duplicated proposed inflections", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("internal-dup");
    const { id } = await createTestEntry(series.id, { headword: "Dupword" });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>New.</p>", inflections: ["Foo", "foo"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("does not flag the entry's own retained inflections as self-conflicting", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("self-exclusion");
    const { id } = await createTestEntry(series.id, { headword: "Selfexword", inflections: ["Kept"] });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>New.</p>", inflections: ["Kept", "Added"] },
    });
    expect(res.statusCode).toBe(201);
  });

  it("rejects a second submission while one is already Pending, creating no second row", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("already-pending");
    const { id } = await createTestEntry(series.id, { headword: "Pendingtarget" });

    await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>First.</p>", inflections: [] },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>Second.</p>", inflections: [] },
    });
    expect(res.statusCode).toBe(409);

    const count = await prisma.entryEditProposal.count({ where: { entryId: id, status: "PENDING" } });
    expect(count).toBe(1);
  });

  it("applies an admin's own edit immediately, self-reviewed, with an UPDATE revision", async () => {
    const adminCookie = await setupAdmin();
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const series = await createTestSeries("admin-auto-approve");
    const { id } = await createTestEntry(series.id, { headword: "Adminediting", inflections: ["Old"] });

    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: adminCookie },
      payload: { definitionHtml: "<p>Admin-applied text.</p>", inflections: ["New"] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; status: string }>();
    expect(body.status).toBe("APPROVED");

    const entry = await prisma.entry.findUniqueOrThrow({ where: { id }, include: { inflections: true } });
    expect(entry.definitionHtml).toBe("<p>Admin-applied text.</p>");
    expect(entry.inflections.map((i) => i.value)).toEqual(["New"]);

    const proposal = await prisma.entryEditProposal.findUniqueOrThrow({ where: { id: body.id } });
    expect(proposal.status).toBe("APPROVED");
    expect(proposal.reviewedById).toBe(admin.id);
    expect(proposal.reviewedAt).not.toBeNull();

    const revisions = await prisma.revision.findMany({ where: { entryId: id }, orderBy: { createdAt: "asc" } });
    const updateRevision = revisions.find((r) => r.action === "UPDATE");
    expect(updateRevision).toBeDefined();
    expect(updateRevision?.authorId).toBe(admin.id);
    const snapshot = updateRevision?.snapshot as { definitionHtml?: string; inflections?: string[] } | null;
    expect(snapshot?.definitionHtml).toBe("<p>Admin-applied text.</p>");
    expect(snapshot?.inflections).toEqual(["New"]);
  });

  it("never queues an admin's self-approved edit in the review queue", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("admin-not-queued");
    const { id } = await createTestEntry(series.id, { headword: "Adminqueueword" });

    const submitRes = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: adminCookie },
      payload: { definitionHtml: "<p>Admin text.</p>", inflections: [] },
    });
    const proposalId = submitRes.json<{ id: string }>().id;

    const queueRes = await app.inject({ method: "GET", url: "/api/admin/review-queue", headers: { cookie: adminCookie } });
    const queueIds = queueRes.json<{ id: string }[]>().map((i) => i.id);
    expect(queueIds).not.toContain(proposalId);
  });

  it("still blocks an administrator's submission when the entry already has a Pending proposal from someone else", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("admin-blocked-by-pending");
    const { id } = await createTestEntry(series.id, { headword: "Blockedword" });

    const firstRes = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>Member's proposal.</p>", inflections: [] },
    });
    const memberProposalId = firstRes.json<{ id: string }>().id;

    const adminRes = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: adminCookie },
      payload: { definitionHtml: "<p>Admin's proposal.</p>", inflections: [] },
    });
    expect(adminRes.statusCode).toBe(409);

    const entry = await prisma.entry.findUniqueOrThrow({ where: { id } });
    expect(entry.definitionHtml).toBe("<p>A test definition.</p>");

    const memberProposal = await prisma.entryEditProposal.findUniqueOrThrow({ where: { id: memberProposalId } });
    expect(memberProposal.status).toBe("PENDING");
    expect(memberProposal.proposedDefinitionHtml).toBe("<p>Member's proposal.</p>");
  });

  it("allows exactly one success under concurrent submissions from two administrators for the same entry", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("admin-concurrent");
    const { id } = await createTestEntry(series.id, { headword: "Adminconcurrentword" });

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/entries/${id}/edit-proposals`,
        headers: { cookie: adminCookie },
        payload: { definitionHtml: "<p>First admin.</p>", inflections: [] },
      }),
      app.inject({
        method: "POST",
        url: `/api/entries/${id}/edit-proposals`,
        headers: { cookie: adminCookie },
        payload: { definitionHtml: "<p>Second admin.</p>", inflections: [] },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const proposals = await prisma.entryEditProposal.findMany({ where: { entryId: id } });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.status).toBe("APPROVED");
  });

  it("allows exactly one success under concurrent submissions for the same entry", async () => {
    const memberCookie = await setupMember();
    const series = await createTestSeries("concurrent");
    const { id } = await createTestEntry(series.id, { headword: "Concurrentword" });

    const payload = { definitionHtml: "<p>Race.</p>", inflections: [] };
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/entries/${id}/edit-proposals`,
        headers: { cookie: memberCookie },
        payload,
      }),
      app.inject({
        method: "POST",
        url: `/api/entries/${id}/edit-proposals`,
        headers: { cookie: memberCookie },
        payload,
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const count = await prisma.entryEditProposal.count({ where: { entryId: id, status: "PENDING" } });
    expect(count).toBe(1);
  });
});

describe("GET /api/admin/review-queue", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/review-queue" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    const memberCookie = await setupMember();
    const res = await app.inject({ method: "GET", url: "/api/admin/review-queue", headers: { cookie: memberCookie } });
    expect(res.statusCode).toBe(403);
  });

  it("lists a pending new entry and a pending edit proposal together, oldest-first, correctly typed", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("merged-queue");

    const newEntryRes = await app.inject({
      method: "POST",
      url: `/api/series/${series.slug}/entries`,
      headers: { cookie: memberCookie },
      payload: { headword: "Newwordone", definitionHtml: "<p>First.</p>", inflections: [] },
    });
    const newEntryId = newEntryRes.json<{ id: string }>().id;

    const { id: existingEntryId } = await createTestEntry(series.id, { headword: "Editablewordtwo" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await app.inject({
      method: "POST",
      url: `/api/entries/${existingEntryId}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>Proposed.</p>", inflections: [] },
    });

    const res = await app.inject({ method: "GET", url: "/api/admin/review-queue", headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ type: string; id: string; createdAt: string }[]>();

    const newEntryItem = items.find((i) => i.id === newEntryId);
    const editItem = items.find((i) => i.type === "EDIT" && "entryId" in i && (i as { entryId: string }).entryId === existingEntryId);
    expect(newEntryItem?.type).toBe("NEW_ENTRY");
    expect(editItem).toBeDefined();
    expect(items.indexOf(newEntryItem!)).toBeLessThan(items.indexOf(editItem!));
  });

  it("excludes non-pending items of either kind", async () => {
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("exclude-non-pending");
    await createTestEntry(series.id, { headword: "Alreadyapproved", approvalStatus: "APPROVED" });

    const res = await app.inject({ method: "GET", url: "/api/admin/review-queue", headers: { cookie: adminCookie } });
    const items = res.json<{ id: string }[]>();
    const headwords = items.map((i) => (i as { headword?: string }).headword);
    expect(headwords).not.toContain("Alreadyapproved");
  });
});

describe("GET /api/admin/entry-edit-proposals/:id", () => {
  it("returns live current values alongside the stored proposed values", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("review-detail");
    const { id } = await createTestEntry(series.id, { headword: "Detailword", inflections: ["Original"] });

    const submitRes = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>Proposed text.</p>", inflections: ["Original", "New"] },
    });
    const proposalId = submitRes.json<{ id: string }>().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/entry-edit-proposals/${proposalId}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      current: { headword: string; definitionHtml: string; inflections: { value: string }[] };
      proposed: { definitionHtml: string; inflections: string[] };
    }>();
    expect(body.current.headword).toBe("Detailword");
    expect(body.current.definitionHtml).toBe("<p>A test definition.</p>");
    expect(body.current.inflections.map((i) => i.value)).toEqual(["Original"]);
    expect(body.proposed.definitionHtml).toBe("<p>Proposed text.</p>");
    expect(body.proposed.inflections).toEqual(["Original", "New"]);
  });
});

describe("POST /api/admin/entry-edit-proposals/:id/approve", () => {
  async function submitProposal(
    memberCookie: string,
    entryId: string,
    payload: { definitionHtml: string; inflections: string[] }
  ): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: `/api/entries/${entryId}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload,
    });
    return res.json<{ id: string }>().id;
  }

  it("updates the entry atomically, marks the proposal Approved, and removes it from the queue", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("approve-happy");
    const { id } = await createTestEntry(series.id, { headword: "Approveword", inflections: ["Old"] });

    const proposalId = await submitProposal(memberCookie, id, {
      definitionHtml: "<p>Approved text.</p>",
      inflections: ["New"],
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);

    const entry = await prisma.entry.findUniqueOrThrow({ where: { id }, include: { inflections: true } });
    expect(entry.definitionHtml).toBe("<p>Approved text.</p>");
    expect(entry.inflections.map((i) => i.value)).toEqual(["New"]);

    const proposal = await prisma.entryEditProposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(proposal.status).toBe("APPROVED");

    const queueRes = await app.inject({ method: "GET", url: "/api/admin/review-queue", headers: { cookie: adminCookie } });
    const queueIds = queueRes.json<{ id: string }[]>().map((i) => i.id);
    expect(queueIds).not.toContain(proposalId);
  });

  it("refuses approval when the underlying entry changed since submission (stale)", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("approve-stale");
    const { id } = await createTestEntry(series.id, { headword: "Staleword" });

    const proposalId = await submitProposal(memberCookie, id, { definitionHtml: "<p>Stale proposal.</p>", inflections: [] });

    // Simulate the entry changing after submission (e.g. a different edit was approved first)
    await prisma.entry.update({ where: { id }, data: { definitionHtml: "<p>Changed elsewhere.</p>" } });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(409);

    const entry = await prisma.entry.findUniqueOrThrow({ where: { id } });
    expect(entry.definitionHtml).toBe("<p>Changed elsewhere.</p>");

    const proposal = await prisma.entryEditProposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(proposal.status).toBe("PENDING");
  });

  it("refuses approval when a proposed inflection now conflicts with another entry", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("approve-conflict");
    const { id } = await createTestEntry(series.id, { headword: "Conflictbase" });

    const proposalId = await submitProposal(memberCookie, id, {
      definitionHtml: "<p>New.</p>",
      inflections: ["Latecomer"],
    });

    // A different entry claims the word after submission but before approval
    await createTestEntry(series.id, { headword: "Latecomer" });

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(409);

    const entry = await prisma.entry.findUniqueOrThrow({ where: { id }, include: { inflections: true } });
    expect(entry.inflections).toHaveLength(0);

    const proposal = await prisma.entryEditProposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(proposal.status).toBe("PENDING");
  });

  it("returns 409 when approving an already-reviewed proposal", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("approve-twice");
    const { id } = await createTestEntry(series.id, { headword: "Twiceword" });

    const proposalId = await submitProposal(memberCookie, id, { definitionHtml: "<p>New.</p>", inflections: [] });
    await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/approve`,
      headers: { cookie: adminCookie },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 401/403 for unauthenticated/non-admin requests", async () => {
    const memberCookie = await setupMember();
    const res1 = await app.inject({ method: "POST", url: "/api/admin/entry-edit-proposals/nonexistent/approve" });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({
      method: "POST",
      url: "/api/admin/entry-edit-proposals/nonexistent/approve",
      headers: { cookie: memberCookie },
    });
    expect(res2.statusCode).toBe(403);
  });

  it("allows exactly one success under concurrent approval attempts", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("approve-concurrent");
    const { id } = await createTestEntry(series.id, { headword: "Concurrentapproveword" });
    const proposalId = await submitProposal(memberCookie, id, { definitionHtml: "<p>Race.</p>", inflections: [] });

    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/admin/entry-edit-proposals/${proposalId}/approve`,
        headers: { cookie: adminCookie },
      }),
      app.inject({
        method: "POST",
        url: `/api/admin/entry-edit-proposals/${proposalId}/approve`,
        headers: { cookie: adminCookie },
      }),
    ]);
    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
  });
});

describe("POST /api/admin/entry-edit-proposals/:id/reject", () => {
  it("persists an optional note and leaves the entry completely unchanged", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("reject-note");
    const { id } = await createTestEntry(series.id, { headword: "Rejectword" });

    const submitRes = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>Proposed.</p>", inflections: ["Nope"] },
    });
    const proposalId = submitRes.json<{ id: string }>().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/reject`,
      headers: { cookie: adminCookie },
      payload: { note: "Not accurate." },
    });
    expect(res.statusCode).toBe(200);

    const proposal = await prisma.entryEditProposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(proposal.status).toBe("REJECTED");
    expect(proposal.rejectionNote).toBe("Not accurate.");

    const entry = await prisma.entry.findUniqueOrThrow({ where: { id }, include: { inflections: true } });
    expect(entry.definitionHtml).toBe("<p>A test definition.</p>");
    expect(entry.inflections).toHaveLength(0);
  });

  it("returns 409 when rejecting an already-reviewed proposal", async () => {
    const memberCookie = await setupMember();
    const adminCookie = await setupAdmin();
    const series = await createTestSeries("reject-twice");
    const { id } = await createTestEntry(series.id, { headword: "Rejecttwiceword" });

    const submitRes = await app.inject({
      method: "POST",
      url: `/api/entries/${id}/edit-proposals`,
      headers: { cookie: memberCookie },
      payload: { definitionHtml: "<p>Proposed.</p>", inflections: [] },
    });
    const proposalId = submitRes.json<{ id: string }>().id;

    await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/reject`,
      headers: { cookie: adminCookie },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/entry-edit-proposals/${proposalId}/reject`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(409);
  });
});
