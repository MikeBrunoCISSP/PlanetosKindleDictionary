import Fastify, { type FastifyServerOptions } from "fastify";
import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import { getEmailQueue } from "../src/lib/queues.js";
import { processEmailOutbox } from "../src/lib/outbox.js";
import { processContactMessage } from "../src/lib/contactMessages.js";
import sessionPlugin from "../src/plugins/session.js";
import errorHandlerPlugin from "../src/plugins/errorHandler.js";
import rateLimitPlugin from "../src/plugins/rateLimit.js";
import authRoutes from "../src/routes/auth.js";
import adminRoutes from "../src/routes/admin.js";
import adminBlockedEmailsRoutes from "../src/routes/adminBlockedEmails.js";
import seriesRoutes from "../src/routes/series.js";
import entriesRoutes from "../src/routes/entries.js";
import turnstileRoutes from "../src/routes/turnstile.js";
import searchRoutes from "../src/routes/search.js";
import entryEditProposalRoutes from "../src/routes/entryEditProposals.js";
import downloadsRoutes from "../src/routes/downloads.js";
import contactRoutes from "../src/routes/contact.js";

export interface BuildAppOptions {
  /** Opt in to trusting a proxy hop, e.g. `(_address, hop) => hop < 1`. Unset preserves today's no-trustProxy behavior. */
  trustProxy?: FastifyServerOptions["trustProxy"];
  /** Opt in to registering the real rate-limit plugin (off by default, as today). */
  rateLimit?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}) {
  const prisma = new PrismaClient();
  const app = Fastify({
    logger: false,
    ...(opts.trustProxy !== undefined ? { trustProxy: opts.trustProxy } : {}),
  });

  await app.register(sessionPlugin);
  await app.register(errorHandlerPlugin);
  if (opts.rateLimit) await app.register(rateLimitPlugin);
  await app.register(authRoutes, { prisma });
  await app.register(adminRoutes, { prisma });
  await app.register(adminBlockedEmailsRoutes, { prisma });
  await app.register(seriesRoutes, { prisma });
  await app.register(entriesRoutes, { prisma });
  await app.register(turnstileRoutes, { prisma });
  await app.register(searchRoutes, { prisma });
  await app.register(entryEditProposalRoutes, { prisma });
  await app.register(downloadsRoutes, { prisma });
  await app.register(contactRoutes, { prisma });

  return { app, prisma };
}

export async function cleanUsers(prisma: PrismaClient, emails: string[]) {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

export async function cleanSeries(prisma: PrismaClient, slugPrefix: string) {
  await prisma.series.deleteMany({ where: { slug: { startsWith: slugPrefix } } });
}

export async function resetTurnstileSettings(prisma: PrismaClient) {
  await prisma.turnstileSettings.deleteMany({});
}

/**
 * PROD-006: account routes now only enqueue an email job on the real
 * `email` queue rather than sending synchronously. Integration tests that
 * need an actual email to land (e.g. in Mailpit) must drive a Worker that
 * processes that queue, the same way apps/api/src/worker.ts does in
 * production - otherwise nothing ever consumes the job.
 */
export function startEmailWorker(prisma: PrismaClient): Worker {
  const emailQueue = getEmailQueue();
  const worker = new Worker(
    "email",
    async (job) => {
      if (job.name === "reconcile-pending-emails") return;
      if (job.name === "send-contact-message") {
        const { contactMessageId } = job.data as { contactMessageId: string };
        await processContactMessage(prisma, contactMessageId);
        return;
      }
      const { outboxId } = job.data as { outboxId: string };
      await processEmailOutbox(prisma, outboxId);
    },
    { connection: emailQueue.opts.connection }
  );
  worker.on("error", () => {});
  return worker;
}
