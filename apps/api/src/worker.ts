import "./load-env.js";
import { config, assertConfigValid } from "./config.js";

import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { getDictionaryBuildQueue, getMaintenanceQueue, closeQueues } from "./lib/queues.js";
import { ensureBucketExists, putObject, deleteObjects } from "./lib/storage.js";
import { processDictionaryBuild } from "./jobs/build.js";
import { pruneOldBuilds } from "./jobs/prune.js";
import { runSweep } from "./jobs/sweep.js";

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

await ensureBucketExists();

const dictionaryBuildQueue = getDictionaryBuildQueue();
const maintenanceQueue = getMaintenanceQueue();

// The dictionary-build queue carries two distinct job types, told apart by
// job name: the repeatable "sweep-changed-series" scheduler job (no
// per-series data - it enqueues the real per-series build jobs itself) and
// individual per-series build jobs (named "dictionary-build", data:
// { seriesId }) enqueued either by the sweep or by an admin's manual
// rebuild request.
async function processDictionaryBuildQueueJob(job: Job): Promise<void> {
  if (job.name === "sweep-changed-series") {
    await runSweep(prisma, dictionaryBuildQueue);
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
    const { seriesId } = job.data as { seriesId: string };
    await pruneOldBuilds(prisma, { deleteObjects }, seriesId);
  },
  { connection: maintenanceQueue.opts.connection, concurrency: 2 }
);

// Idempotent by scheduler id - redeploying the worker never registers a
// duplicate repeatable job (SPEC.md §7 "The hourly sweep").
await dictionaryBuildQueue.upsertJobScheduler(
  "sweep-changed-series",
  { pattern: config.buildCron },
  { name: "sweep-changed-series", data: {} }
);

dictionaryBuildWorker.on("failed", (job, err) => {
  console.error(`[worker] dictionary-build job ${job?.id} (${job?.name}) failed:`, err);
});
maintenanceWorker.on("failed", (job, err) => {
  console.error(`[worker] maintenance job ${job?.id} failed:`, err);
});

async function shutdown(): Promise<void> {
  await dictionaryBuildWorker.close();
  await maintenanceWorker.close();
  await closeQueues();
  await prisma.$disconnect();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

console.log("[worker] dictionary-build and maintenance workers started");
