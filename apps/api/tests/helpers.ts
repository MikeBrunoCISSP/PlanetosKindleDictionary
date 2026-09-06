import Fastify, { type FastifyServerOptions } from "fastify";
import { PrismaClient } from "@prisma/client";
import sessionPlugin from "../src/plugins/session.js";
import errorHandlerPlugin from "../src/plugins/errorHandler.js";
import rateLimitPlugin from "../src/plugins/rateLimit.js";
import authRoutes from "../src/routes/auth.js";
import adminRoutes from "../src/routes/admin.js";
import seriesRoutes from "../src/routes/series.js";
import entriesRoutes from "../src/routes/entries.js";
import turnstileRoutes from "../src/routes/turnstile.js";
import searchRoutes from "../src/routes/search.js";
import entryEditProposalRoutes from "../src/routes/entryEditProposals.js";
import downloadsRoutes from "../src/routes/downloads.js";

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
  await app.register(seriesRoutes, { prisma });
  await app.register(entriesRoutes, { prisma });
  await app.register(turnstileRoutes, { prisma });
  await app.register(searchRoutes, { prisma });
  await app.register(entryEditProposalRoutes, { prisma });
  await app.register(downloadsRoutes, { prisma });

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
