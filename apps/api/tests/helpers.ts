import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import sessionPlugin from "../src/plugins/session.js";
import errorHandlerPlugin from "../src/plugins/errorHandler.js";
import authRoutes from "../src/routes/auth.js";
import adminRoutes from "../src/routes/admin.js";
import seriesRoutes from "../src/routes/series.js";
import entriesRoutes from "../src/routes/entries.js";
import turnstileRoutes from "../src/routes/turnstile.js";
import searchRoutes from "../src/routes/search.js";
import entryEditProposalRoutes from "../src/routes/entryEditProposals.js";

export async function buildApp() {
  const prisma = new PrismaClient();
  const app = Fastify({ logger: false });

  await app.register(sessionPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authRoutes, { prisma });
  await app.register(adminRoutes, { prisma });
  await app.register(seriesRoutes, { prisma });
  await app.register(entriesRoutes, { prisma });
  await app.register(turnstileRoutes, { prisma });
  await app.register(searchRoutes, { prisma });
  await app.register(entryEditProposalRoutes, { prisma });

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
