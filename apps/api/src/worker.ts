import "./load-env.js";
import { config, assertConfigValid } from "./config.js";

import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { getDictionaryBuildQueue, getMaintenanceQueue, getEmailQueue, getConnection, closeQueues } from "./lib/queues.js";
import { ensureBucketExists, putObject, deleteObjects, listObjects } from "./lib/storage.js";
import { runPreflight } from "./lib/health.js";
import { processDictionaryBuild } from "./jobs/build.js";
import { pruneOldBuilds } from "./jobs/prune.js";
import { runSweep, runReconciliation } from "./jobs/sweep.js";
import { processEmailOutbox, EMAIL_JOB_RETRY_OPTIONS } from "./lib/outbox.js";
import { processContactMessage } from "./lib/contactMessages.js";
import { runAdminDigest } from "./lib/adminDigest.js";
import { runStorageCleanupSweep } from "./lib/storageCleanup.js";

// Fail fast on missing/invalid production configuration before the worker
// registers with any queue (finding PROD-002). Validates only what the
// worker uses (queues + storage + Prisma). No-op in development / test.
try {
  assertConfigValid("worker");
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const prisma = new PrismaClient();

// Refuse to register for jobs against a dependency that isn't actually
// usable (finding PROD-005) - retries briefly to tolerate a Postgres/Redis
// service still starting up in the same deploy window (see
// openspec/changes/add-readiness-checks/design.md Decision 4).
const preflight = await runPreflight(prisma, getConnection());
if (!preflight.ok) {
  console.error(`[worker] preflight failed, not starting: ${preflight.failed.join(", ")} unreachable`);
  process.exit(1);
}

await ensureBucketExists();

const dictionaryBuildQueue = getDictionaryBuildQueue();
const maintenanceQueue = getMaintenanceQueue();
const emailQueue = getEmailQueue();

// The dictionary-build queue carries three distinct job types, told apart
// by job name: the repeatable "sweep-changed-series" scheduler job (checks
// only dirty/new series - PERF-001), the repeatable "reconcile-all-series"
// scheduler job (the full-corpus safety net, PERF-001), and individual
// per-series build jobs (named "dictionary-build", data: { seriesId })
// enqueued by either of those or by an admin's manual rebuild request.
async function processDictionaryBuildQueueJob(job: Job): Promise<void> {
  if (job.name === "sweep-changed-series") {
    await runSweep(prisma, dictionaryBuildQueue);
    return;
  }
  if (job.name === "reconcile-all-series") {
    await runReconciliation(prisma, dictionaryBuildQueue);
    return;
  }

  const { seriesId } = job.data as { seriesId: string };
  await processDictionaryBuild(prisma, { putObject }, seriesId);
  // Reclaim storage for any builds beyond the retention limit now that this
  // series has a new successful build.
  await maintenanceQueue.add("prune-series", { seriesId });
}

const dictionaryBuildWorker = new Worker("dictionary-build", processDictionaryBuildQueueJob, {
  connection: dictionaryBuildQueue.opts.connection,
  concurrency: 2,
  // Retry/backoff for a failing per-series build (SPEC.md §7's "3 retries,
  // exponential backoff") is a job option, set wherever a "dictionary-build"
  // job is enqueued (sweep.ts's BUILD_JOB_RETRY_OPTIONS, reused by the
  // manual-rebuild route) - not something the Worker itself configures.
});

const maintenanceWorker = new Worker(
  "maintenance",
  async (job: Job) => {
    if (job.name === "cleanup-storage") {
      await runStorageCleanupSweep(prisma, { listObjects, deleteObjects });
      return;
    }
    const { seriesId } = job.data as { seriesId: string };
    await pruneOldBuilds(prisma, { deleteObjects }, seriesId);
  },
  { connection: maintenanceQueue.opts.connection, concurrency: 2 }
);

// Reconciliation for the case where the enqueue call right after an
// outbox row's transaction commit itself failed (e.g. Redis was briefly
// unreachable) - finds rows nothing ever queued a job for and re-enqueues
// them (PROD-006). deduplication means this is safe to run even if a job
// IS still in flight for a given row: the re-add either finds no dedup key
// (creates a genuine new job, exactly the recovery case this exists for)
// or finds one already held by a waiting/active job (no-ops/stashes,
// per the same semantics sweep.ts's own dedup relies on).
const PENDING_RECONCILE_AGE_MS = 5 * 60 * 1000;

async function reconcilePendingEmails(): Promise<void> {
  const stale = await prisma.emailOutbox.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - PENDING_RECONCILE_AGE_MS) } },
    select: { id: true },
  });
  for (const { id } of stale) {
    await emailQueue.add(
      "send-email",
      { outboxId: id },
      { ...EMAIL_JOB_RETRY_OPTIONS, deduplication: { id, keepLastIfActive: true } }
    );
  }

  const staleContactMessages = await prisma.contactMessage.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - PENDING_RECONCILE_AGE_MS) } },
    select: { id: true },
  });
  for (const { id } of staleContactMessages) {
    await emailQueue.add(
      "send-contact-message",
      { contactMessageId: id },
      { ...EMAIL_JOB_RETRY_OPTIONS, deduplication: { id, keepLastIfActive: true } }
    );
  }
}

async function processEmailQueueJob(job: Job): Promise<void> {
  if (job.name === "reconcile-pending-emails") {
    await reconcilePendingEmails();
    return;
  }
  if (job.name === "send-admin-digest") {
    await runAdminDigest(prisma);
    return;
  }
  if (job.name === "send-contact-message") {
    const { contactMessageId } = job.data as { contactMessageId: string };
    await processContactMessage(prisma, contactMessageId);
    return;
  }
  const { outboxId } = job.data as { outboxId: string };
  await processEmailOutbox(prisma, outboxId);
}

const emailWorker = new Worker("email", processEmailQueueJob, {
  connection: emailQueue.opts.connection,
  concurrency: 2,
});

// Idempotent by scheduler id, same as sweep-changed-series below. Its own
// fixed hourly cadence, independent of config.buildCron (that value tunes
// the dictionary-build sweep specifically, not this).
await emailQueue.upsertJobScheduler(
  "reconcile-pending-emails",
  { pattern: "0 * * * *" },
  { name: "reconcile-pending-emails", data: {} }
);

// Idempotent by scheduler id, same as reconcile-pending-emails above.
// Schedule is configurable (openspec: notifications/admin-digest) rather
// than fixed like the hourly reconciliation above.
await emailQueue.upsertJobScheduler(
  "send-admin-digest",
  { pattern: config.adminDigestCron },
  { name: "send-admin-digest", data: {} }
);

// Idempotent by scheduler id - redeploying the worker never registers a
// duplicate repeatable job (SPEC.md §7 "The hourly sweep").
await dictionaryBuildQueue.upsertJobScheduler(
  "sweep-changed-series",
  { pattern: config.buildCron },
  { name: "sweep-changed-series", data: {} }
);

// PERF-001's safety net: runs far less often than the hourly sweep, on its
// own fixed daily cadence, independent of config.buildCron (that value
// tunes the dirty/new-only sweep specifically, not this) - same reasoning
// as reconcile-pending-emails above.
await dictionaryBuildQueue.upsertJobScheduler(
  "reconcile-all-series",
  { pattern: "0 3 * * *" },
  { name: "reconcile-all-series", data: {} }
);

// PROD-007: periodic sweep of pending object-storage cleanups (failed
// builds' partial uploads, deleted series' orphaned artifacts). No latency
// requirement - "try again next hour" is a complete retry strategy since
// runStorageCleanupSweep leaves any failed row pending for the next run.
await maintenanceQueue.upsertJobScheduler(
  "cleanup-storage",
  { pattern: "0 * * * *" },
  { name: "cleanup-storage", data: {} }
);

dictionaryBuildWorker.on("failed", (job, err) => {
  console.error(`[worker] dictionary-build job ${job?.id} (${job?.name}) failed:`, err);
});
maintenanceWorker.on("failed", (job, err) => {
  console.error(`[worker] maintenance job ${job?.id} failed:`, err);
});
emailWorker.on("failed", (job, err) => {
  console.error(`[worker] email job ${job?.id} (${job?.name}) failed:`, err);
});

async function shutdown(): Promise<void> {
  await dictionaryBuildWorker.close();
  await maintenanceWorker.close();
  await emailWorker.close();
  await closeQueues();
  await prisma.$disconnect();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

console.log("[worker] dictionary-build, maintenance, and email workers started");
