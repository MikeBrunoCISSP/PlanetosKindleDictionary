import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildApp } from "./helpers.js";
import { scheduleStorageCleanup, processStorageCleanup, runStorageCleanupSweep } from "../src/lib/storageCleanup.js";
import * as storage from "../src/lib/storage.js";

const PREFIX_MARKER = "test-storage-cleanup/";

let prisma: PrismaClient;

async function schedule(prefix: string, reason: "BUILD_FAILED" | "SERIES_DELETED") {
  return prisma.$transaction(async (tx) => {
    await scheduleStorageCleanup(tx, prefix, reason);
    return tx.pendingStorageCleanup.findFirstOrThrow({ where: { prefix }, orderBy: { createdAt: "desc" } });
  });
}

beforeAll(async () => {
  ({ prisma } = await buildApp());
  await storage.ensureBucketExists();
});

afterEach(async () => {
  await prisma.pendingStorageCleanup.deleteMany({ where: { prefix: { startsWith: PREFIX_MARKER } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("storageCleanup", () => {
  it("processStorageCleanup removes every object under its prefix and removes the row", async () => {
    const prefix = `${PREFIX_MARKER}normal/`;
    await storage.putObject(`${prefix}a.txt`, Buffer.from("a"), "text/plain");
    await storage.putObject(`${prefix}b.txt`, Buffer.from("b"), "text/plain");
    const row = await schedule(prefix, "BUILD_FAILED");

    await processStorageCleanup(prisma, storage, row.id);

    const remainingObjects = await storage.listObjects(prefix);
    expect(remainingObjects).toHaveLength(0);
    const remainingRow = await prisma.pendingStorageCleanup.findUnique({ where: { id: row.id } });
    expect(remainingRow).toBeNull();
  });

  it("processStorageCleanup for a prefix with nothing under it is a safe no-op that still removes the row", async () => {
    const prefix = `${PREFIX_MARKER}empty/`;
    const row = await schedule(prefix, "SERIES_DELETED");

    await expect(processStorageCleanup(prisma, storage, row.id)).resolves.not.toThrow();

    const remainingRow = await prisma.pendingStorageCleanup.findUnique({ where: { id: row.id } });
    expect(remainingRow).toBeNull();
  });

  it("processStorageCleanup for an id that no longer exists does not throw", async () => {
    await expect(processStorageCleanup(prisma, storage, "nonexistent-cleanup-id")).resolves.not.toThrow();
  });

  it("runStorageCleanupSweep processes multiple pending rows and isolates one row's failure from the others", async () => {
    const goodPrefixA = `${PREFIX_MARKER}sweep-good-a/`;
    const goodPrefixB = `${PREFIX_MARKER}sweep-good-b/`;
    const badPrefix = `${PREFIX_MARKER}sweep-bad/`;
    await storage.putObject(`${goodPrefixA}a.txt`, Buffer.from("a"), "text/plain");
    await storage.putObject(`${goodPrefixB}b.txt`, Buffer.from("b"), "text/plain");
    // A real object under badPrefix, so deleteObjects is actually invoked
    // (and can fail) rather than short-circuiting on an empty key list.
    await storage.putObject(`${badPrefix}c.txt`, Buffer.from("c"), "text/plain");
    const rowA = await schedule(goodPrefixA, "BUILD_FAILED");
    const rowB = await schedule(goodPrefixB, "BUILD_FAILED");
    const rowBad = await schedule(badPrefix, "SERIES_DELETED");

    const failingStorage = {
      listObjects: (prefix: string) => storage.listObjects(prefix),
      deleteObjects: (keys: string[]) => {
        if (keys.some((k) => k.startsWith(badPrefix))) throw new Error("simulated storage failure");
        return storage.deleteObjects(keys);
      },
    };

    await runStorageCleanupSweep(prisma, failingStorage);

    expect(await prisma.pendingStorageCleanup.findUnique({ where: { id: rowA.id } })).toBeNull();
    expect(await prisma.pendingStorageCleanup.findUnique({ where: { id: rowB.id } })).toBeNull();
    const badRowAfter = await prisma.pendingStorageCleanup.findUnique({ where: { id: rowBad.id } });
    expect(badRowAfter).not.toBeNull();
    expect(badRowAfter!.attempts).toBe(1);
    expect(badRowAfter!.error).toContain("simulated storage failure");

    // Clean up the object the bad-prefix path deliberately left behind.
    await storage.deleteObjects([`${badPrefix}c.txt`]);
  });
});
