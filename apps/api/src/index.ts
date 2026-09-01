import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "node:fs";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { PrismaClient } from "@prisma/client";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import corsPlugin from "./plugins/cors.js";
import securityPlugin from "./plugins/security.js";
import sessionPlugin from "./plugins/session.js";
import rateLimitPlugin from "./plugins/rateLimit.js";
import errorHandlerPlugin from "./plugins/errorHandler.js";
import { makeRequireAdmin } from "./plugins/requireAdmin.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import seriesRoutes from "./routes/series.js";
import entriesRoutes from "./routes/entries.js";
import turnstileRoutes from "./routes/turnstile.js";
import searchRoutes from "./routes/search.js";
import entryEditProposalRoutes from "./routes/entryEditProposals.js";
import downloadsRoutes from "./routes/downloads.js";
import { ensureBucketExists } from "./lib/storage.js";
import { getDictionaryBuildQueue, getMaintenanceQueue } from "./lib/queues.js";
import { resolveWebDist } from "./lib/staticSite.js";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

await app.register(corsPlugin);
await app.register(securityPlugin);
await app.register(sessionPlugin);
await app.register(rateLimitPlugin);
await app.register(errorHandlerPlugin);

await app.register(authRoutes, { prisma });
await app.register(adminRoutes, { prisma });
await app.register(seriesRoutes, { prisma });
await app.register(entriesRoutes, { prisma });
await app.register(turnstileRoutes, { prisma });
await app.register(searchRoutes, { prisma });
await app.register(entryEditProposalRoutes, { prisma });
await app.register(downloadsRoutes, { prisma });

// Bull Board at /admin/jobs - the "Hangfire dashboard" equivalent (SPEC.md
// §7), admin-only. Registered inside its own encapsulated plugin so the
// requireAdmin preHandler hook applies to bull-board's own routes without
// leaking onto the rest of the app.
await app.register(async (adminJobsApp) => {
  adminJobsApp.addHook("preHandler", makeRequireAdmin(prisma));

  const serverAdapter = new FastifyAdapter();
  createBullBoard({
    queues: [new BullMQAdapter(getDictionaryBuildQueue()), new BullMQAdapter(getMaintenanceQueue())],
    serverAdapter,
  });
  serverAdapter.setBasePath("/admin/jobs");
  await adminJobsApp.register(serverAdapter.registerPlugin(), { prefix: "/admin/jobs" });
});

app.get("/health", async () => ({ status: "ok" }));

// Serve the built web SPA from the same origin as the API (see
// openspec deployment/railway). Registered last so every explicit API
// route, Bull Board, and /health win; the SPA only owns what's left.
// Absent in dev (`pnpm dev:api`) and in tests, which never build the web app.
const webDist = resolveWebDist();
if (webDist) {
  await app.register(fastifyStatic, { root: webDist.root, wildcard: false });
  const spaIndexHtml = readFileSync(webDist.indexHtml, "utf8");
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?", 1)[0] ?? "";
    const isServerPath =
      path === "/api" ||
      path.startsWith("/api/") ||
      path === "/admin" ||
      path.startsWith("/admin/") ||
      path === "/health";
    if (request.method === "GET" && !isServerPath) {
      // Client-side route (or a hard refresh of one): hand back the SPA shell.
      return reply.code(200).type("text/html").send(spaIndexHtml);
    }
    return reply
      .code(404)
      .header("content-type", "application/problem+json")
      .send({ type: "about:blank", title: "Not Found", status: 404 });
  });
} else {
  app.log.warn("apps/web/dist not found - the API will not serve the SPA (expected in dev/test)");
}

await ensureBucketExists();

const port = Number(process.env["PORT"] ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
