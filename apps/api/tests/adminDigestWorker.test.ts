import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

// Drives the worker's `send-admin-digest` job branch through a real BullMQ
// Worker against real Redis, following the Worker-driving pattern from
// tests/outboxWorker.test.ts and tests/sweepRebuild.test.ts. worker.ts itself
// is an executable entry point (preflight checks, real queues, process.exit
// on bad config) rather than an importable module, so this replicates its
// `send-admin-digest` branch's shape (`await runAdminDigest(prisma)`) the
// same way outboxWorker.test.ts replicates the `send-email` branch's.
vi.mock("../src/lib/mailer.js", () => ({
  sendAdminDigestEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendAdminDigestEmail } from "../src/lib/mailer.js";
import { runAdminDigest } from "../src/lib/adminDigest.js";

const QUEUE_NAME = "test-admin-digest-worker";

// A fake, pending-work Prisma client - the counting logic itself is already
// covered by tests/lib/adminDigest.test.ts; this file only needs a run that
// reliably sends, without depending on this shared database's real state.
const fakePrisma = {
  user: { count: vi.fn().mockResolvedValue(1) },
  entry: { count: vi.fn().mockResolvedValue(0) },
  entryEditProposal: { count: vi.fn().mockResolvedValue(0) },
} as unknown as PrismaClient;

let connection: Redis;
let queue: Queue;

async function waitFor(predicate: () => Promise<boolean>, description: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

beforeAll(() => {
  connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  queue = new Queue(QUEUE_NAME, { connection });
});

afterEach(async () => {
  vi.clearAllMocks();
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await queue.close();
  await connection.quit();
});

describe("worker: send-admin-digest job", () => {
  it("a send-admin-digest job invokes the digest logic", async () => {
    const worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name === "send-admin-digest") await runAdminDigest(fakePrisma);
      },
      { connection }
    );
    worker.on("error", () => {});

    try {
      const job = await queue.add("send-admin-digest", {});
      await waitFor(async () => (await job.isCompleted()) === true, "job to complete");

      expect(sendAdminDigestEmail).toHaveBeenCalledTimes(1);
    } finally {
      await worker.close();
    }
  });

  it("a failed digest send is logged via the worker's failed-job handler and does not stop later jobs", async () => {
    vi.mocked(sendAdminDigestEmail).mockRejectedValueOnce(new Error("Brevo API 503: transient"));
    const failedNames: string[] = [];

    const worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name === "send-admin-digest") await runAdminDigest(fakePrisma);
      },
      { connection }
    );
    // Mirrors worker.ts's real `emailWorker.on("failed", ...)`: logs and
    // does not rethrow or otherwise stop the worker from picking up more jobs.
    worker.on("failed", (job) => {
      if (job) failedNames.push(job.name);
    });

    try {
      const failingJob = await queue.add("send-admin-digest", {}, { attempts: 1 });
      await waitFor(async () => (await failingJob.isFailed()) === true, "first job to fail");
      expect(failedNames).toEqual(["send-admin-digest"]);

      const followUpJob = await queue.add("send-admin-digest", {});
      await waitFor(async () => (await followUpJob.isCompleted()) === true, "second job to still complete");

      expect(sendAdminDigestEmail).toHaveBeenCalledTimes(2);
    } finally {
      await worker.close();
    }
  });
});
