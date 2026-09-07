import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import type { PrismaClient, EmailOutbox } from "@prisma/client";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { buildApp } from "./helpers.js";
import { encrypt } from "../src/lib/crypto.js";

// PROD-006: drives processEmailOutbox through a real BullMQ Worker against
// real Postgres/Redis - the unit tests in tests/lib/outbox.test.ts already
// cover the function's logic in isolation with a fake Prisma client; this
// file proves the retry/backoff and idempotency guarantees actually hold
// once BullMQ's own attempts mechanism is driving repeated calls, following
// the Worker-driving pattern from tests/sweepRebuild.test.ts.
vi.mock("../src/lib/mailer.js", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import { sendVerificationEmail, sendPasswordResetEmail } from "../src/lib/mailer.js";
import { processEmailOutbox } from "../src/lib/outbox.js";

const QUEUE_NAME = "test-outbox-worker";
const EMAIL_PREFIX = "outbox-worker-test-";
const FAST_RETRY = { attempts: 3, backoff: { type: "fixed" as const, delay: 50 } };

let prisma: PrismaClient;
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

async function createOutboxRow(opts: {
  type?: "VERIFICATION" | "PASSWORD_RESET";
  status?: "PENDING" | "SENT" | "FAILED";
}): Promise<EmailOutbox> {
  return prisma.emailOutbox.create({
    data: {
      type: opts.type ?? "VERIFICATION",
      recipientEmail: `${EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      payloadEncrypted: opts.status === "SENT" ? null : encrypt("https://example.com/verify-email?token=abc"),
      status: opts.status ?? "PENDING",
    },
  });
}

beforeAll(async () => {
  ({ prisma } = await buildApp());
  connection = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  queue = new Queue(QUEUE_NAME, { connection });
});

afterEach(async () => {
  vi.clearAllMocks();
  await queue.obliterate({ force: true });
  await prisma.emailOutbox.deleteMany({ where: { recipientEmail: { startsWith: EMAIL_PREFIX } } });
});

afterAll(async () => {
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
});

describe("email outbox Worker: retry and idempotency", () => {
  it("a transient failure followed by a successful retry ends SENT, having failed exactly once", async () => {
    const row = await createOutboxRow({ type: "VERIFICATION" });
    vi.mocked(sendVerificationEmail)
      .mockRejectedValueOnce(new Error("Brevo API 503: transient"))
      .mockResolvedValue(undefined);

    const worker = new Worker(QUEUE_NAME, async (job: Job) => processEmailOutbox(prisma, job.data.outboxId), {
      connection,
    });
    worker.on("error", () => {});

    try {
      await queue.add("send-email", { outboxId: row.id }, FAST_RETRY);
      await waitFor(async () => {
        const current = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
        return current.status === "SENT";
      }, "row to reach SENT after one retry");

      const final = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
      expect(final.status).toBe("SENT");
      expect(final.attempts).toBe(1);
      expect(final.payloadEncrypted).toBeNull();
      expect(final.sentAt).not.toBeNull();
      expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
    } finally {
      await worker.close();
    }
  });

  it("exhausted retries leave the row FAILED with the last error recorded", async () => {
    const row = await createOutboxRow({ type: "PASSWORD_RESET" });
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(new Error("Brevo API 503: persistent outage"));

    const worker = new Worker(QUEUE_NAME, async (job: Job) => processEmailOutbox(prisma, job.data.outboxId), {
      connection,
    });
    worker.on("error", () => {});

    try {
      await queue.add("send-email", { outboxId: row.id }, FAST_RETRY);
      await waitFor(async () => {
        const current = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
        return current.attempts >= FAST_RETRY.attempts;
      }, "row to exhaust all retries");

      const final = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
      expect(final.status).toBe("FAILED");
      expect(final.attempts).toBe(FAST_RETRY.attempts);
      expect(final.error).toContain("persistent outage");
      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(FAST_RETRY.attempts);
    } finally {
      await worker.close();
    }
  });

  it("a row already SENT is never re-sent even if its job is reprocessed", async () => {
    const row = await createOutboxRow({ type: "VERIFICATION", status: "SENT" });

    const worker = new Worker(QUEUE_NAME, async (job: Job) => processEmailOutbox(prisma, job.data.outboxId), {
      connection,
    });
    worker.on("error", () => {});

    try {
      const job = await queue.add("send-email", { outboxId: row.id }, FAST_RETRY);
      await waitFor(async () => (await job.isCompleted()) === true, "reprocessed job to complete as a no-op");

      expect(sendVerificationEmail).not.toHaveBeenCalled();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();

      const unchanged = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
      expect(unchanged.status).toBe("SENT");
      expect(unchanged.attempts).toBe(0);
    } finally {
      await worker.close();
    }
  });
});
