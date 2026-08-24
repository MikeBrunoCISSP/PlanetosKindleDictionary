import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import sessionPlugin from "../src/plugins/session.js";
import errorHandlerPlugin from "../src/plugins/errorHandler.js";
import authRoutes from "../src/routes/auth.js";
import adminRoutes from "../src/routes/admin.js";
import seriesRoutes from "../src/routes/series.js";

export async function buildApp() {
  const prisma = new PrismaClient();
  const app = Fastify({ logger: false });

  await app.register(sessionPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authRoutes, { prisma });
  await app.register(adminRoutes, { prisma });
  await app.register(seriesRoutes, { prisma });

  return { app, prisma };
}

export async function cleanUsers(prisma: PrismaClient, emails: string[]) {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

export async function cleanSeries(prisma: PrismaClient, slugPrefix: string) {
  await prisma.series.deleteMany({ where: { slug: { startsWith: slugPrefix } } });
}
