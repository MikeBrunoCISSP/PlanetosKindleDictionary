import { describe, it, expect, vi, beforeEach, afterEach, afterAll, type MockInstance } from "vitest";
import { PrismaClient } from "@prisma/client";
import { normalizeWord } from "@planetos/shared";
import { runAdminDigest } from "../../src/lib/adminDigest.js";
import * as mailer from "../../src/lib/mailer.js";
import { cleanUsers, cleanSeries } from "../helpers.js";

const USER_EMAIL = "admindigest-pendinguser@example.com";
const USER_USERNAME = "AdminDigestPendingUser";
const PASSWORD_HASH = "not-a-real-hash";
const SLUG_PREFIX = "test-admin-digest-series";

const prisma = new PrismaClient();
let sendSpy: MockInstance<typeof mailer.sendAdminDigestEmail>;

async function pendingBaseline(): Promise<{ pendingUsers: number; pendingEdits: number }> {
  const [pendingUsers, pendingEntries, pendingEditProposals] = await Promise.all([
    prisma.user.count({ where: { approvalStatus: "PENDING" } }),
    prisma.entry.count({ where: { approvalStatus: "PENDING" } }),
    prisma.entryEditProposal.count({ where: { status: "PENDING" } }),
  ]);
  return { pendingUsers, pendingEdits: pendingEntries + pendingEditProposals };
}

async function createPendingUser(): Promise<void> {
  await prisma.user.create({
    data: {
      email: USER_EMAIL,
      username: USER_USERNAME,
      usernameNormalized: normalizeWord(USER_USERNAME),
      passwordHash: PASSWORD_HASH,
      approvalStatus: "PENDING",
    },
  });
}

async function createTestSeries(slugSuffix: string): Promise<{ id: string }> {
  return prisma.series.create({
    data: { slug: `${SLUG_PREFIX}-${slugSuffix}`, title: `Admin Digest Test Series ${slugSuffix}` },
    select: { id: true },
  });
}

async function createPendingEntry(seriesId: string, headword: string): Promise<void> {
  await prisma.entry.create({
    data: {
      seriesId,
      headword,
      sortKey: normalizeWord(headword),
      definitionHtml: "<p>A test definition.</p>",
      approvalStatus: "PENDING",
    },
  });
}

async function createPendingEditProposal(seriesId: string, headword: string): Promise<void> {
  const entry = await prisma.entry.create({
    data: {
      seriesId,
      headword,
      sortKey: normalizeWord(headword),
      definitionHtml: "<p>A test definition.</p>",
      approvalStatus: "APPROVED",
    },
  });
  await prisma.entryEditProposal.create({
    data: {
      entryId: entry.id,
      proposedDefinitionHtml: "<p>A proposed edit.</p>",
      baseEntryUpdatedAt: entry.updatedAt,
    },
  });
}

beforeEach(async () => {
  await cleanUsers(prisma, [USER_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
  sendSpy = vi.spyOn(mailer, "sendAdminDigestEmail").mockResolvedValue(undefined);
});

afterEach(async () => {
  sendSpy.mockRestore();
  await cleanUsers(prisma, [USER_EMAIL]);
  await cleanSeries(prisma, SLUG_PREFIX);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("runAdminDigest", () => {
  it("sends no email when there is nothing pending", async () => {
    // This local/dev database accumulates leftover PENDING fixtures from
    // other test suites over time, so "nothing pending" can't be asserted
    // against real global state - a lightweight fake client (rather than
    // spying on the real, proxy-based Prisma client's methods) stubs the
    // counts directly instead.
    const fakePrisma = {
      user: { count: vi.fn().mockResolvedValue(0) },
      entry: { count: vi.fn().mockResolvedValue(0) },
      entryEditProposal: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;

    await runAdminDigest(fakePrisma);

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("sends one email reporting pending users when only users are pending", async () => {
    const baseline = await pendingBaseline();
    await createPendingUser();

    await runAdminDigest(prisma);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({
      pendingUsers: baseline.pendingUsers + 1,
      pendingEdits: baseline.pendingEdits,
    });
  });

  it("sends one email reporting pending edits (new entry + edit proposal) when only edits are pending", async () => {
    const baseline = await pendingBaseline();
    const series = await createTestSeries("edits-only");
    await createPendingEntry(series.id, "Digestword");
    await createPendingEditProposal(series.id, "Editword");

    await runAdminDigest(prisma);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({
      pendingUsers: baseline.pendingUsers,
      pendingEdits: baseline.pendingEdits + 2,
    });
  });

  it("sends one email reporting both counts when users and edits are both pending", async () => {
    const baseline = await pendingBaseline();
    await createPendingUser();
    const series = await createTestSeries("both");
    await createPendingEntry(series.id, "Digestwordboth");

    await runAdminDigest(prisma);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({
      pendingUsers: baseline.pendingUsers + 1,
      pendingEdits: baseline.pendingEdits + 1,
    });
  });
});
