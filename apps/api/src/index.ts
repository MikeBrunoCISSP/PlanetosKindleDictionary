import "./load-env.js";
import { readFileSync } from "node:fs";
import { config, assertConfigValid } from "./config.js";
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
import adminBlockedEmailsRoutes from "./routes/adminBlockedEmails.js";
import seriesRoutes from "./routes/series.js";
import entriesRoutes from "./routes/entries.js";
import turnstileRoutes from "./routes/turnstile.js";
import searchRoutes from "./routes/search.js";
import entryEditProposalRoutes from "./routes/entryEditProposals.js";
import downloadsRoutes from "./routes/downloads.js";
import contactRoutes from "./routes/contact.js";
import { ensureBucketExists } from "./lib/storage.js";
import { getDictionaryBuildQueue, getMaintenanceQueue, getEmailQueue, closeQueues } from "./lib/queues.js";
import { resolveWebDist } from "./lib/staticSite.js";
import { checkReadiness, closeReadinessRedis } from "./lib/health.js";

// Fail fast on missing/invalid production configuration before anything is
// constructed (finding PROD-002). No-op in NODE_ENV=development / test.
try {
  assertConfigValid();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const prisma = new PrismaClient();
// Trusts exactly `config.trustProxyHops` hops back from the raw socket peer
// (openspec: security/input-hardening) - resolves `request.ip` to the real
// client through Railway's edge rather than the edge's own address. Fastify's
// numeric `trustProxy` form is a no-op on this Fastify version, so this must
// be a function. Safety depends on the `app` container never being reachable
// except through that edge - see openspec/changes/add-trusted-proxy-config
// design.md for why a hop count alone can't verify that on its own.
const app = Fastify({
  logger: true,
  trustProxy: (_address, hop) => hop < config.trustProxyHops,
});

await app.register(corsPlugin);
await app.register(securityPlugin);
await app.register(sessionPlugin);
await app.register(rateLimitPlugin);
await app.register(errorHandlerPlugin);

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

// Bull Board at /admin/jobs - the "Hangfire dashboard" equivalent (SPEC.md
// §7), admin-only. Registered inside its own encapsulated plugin so the
// requireAdmin preHandler hook applies to bull-board's own routes without
// leaking onto the rest of the app.
await app.register(async (adminJobsApp) => {
  adminJobsApp.addHook("preHandler", makeRequireAdmin(prisma));

  const serverAdapter = new FastifyAdapter();
  createBullBoard({
    queues: [
      new BullMQAdapter(getDictionaryBuildQueue()),
      new BullMQAdapter(getMaintenanceQueue()),
      new BullMQAdapter(getEmailQueue()),
    ],
    serverAdapter,
  });
  serverAdapter.setBasePath("/admin/jobs");
  await adminJobsApp.register(serverAdapter.registerPlugin(), { prefix: "/admin/jobs" });
});

// Railway's deployment healthcheck (openspec: deployment/railway) - reports
// real dependency health so a deploy that can't reach Postgres/Redis is
// never promoted to serve traffic. Object storage is deliberately not
// checked here; see openspec/changes/add-readiness-checks/design.md.
app.get("/health", async (_request, reply) => {
  const readiness = await checkReadiness(prisma);
  return reply
    .code(readiness.ok ? 200 : 503)
    .send({ status: readiness.ok ? "ok" : "error", checks: readiness.checks });
});

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

await app.listen({ port: config.port, host: "0.0.0.0" });

// Graceful shutdown (PROD-008): stop accepting new connections and drain
// in-flight ones (app.close(), which also runs the session/rateLimit
// plugins' onClose hooks) before disconnecting the queues, the /health
// route's own readiness Redis connection, and Prisma - in that order,
// since a route may still be using prisma while draining. Each step is
// independently bounded so one stuck dependency can't hang the process
// indefinitely.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;
let shutdownHadError = false;

async function withBound(label: string, work: Promise<unknown>): Promise<void> {
  let settled = false;
  const bound = new Promise<void>((resolve) => {
    setTimeout(() => {
      if (settled) return;
      shutdownHadError = true;
      app.log.warn(`[api] ${label} did not complete within ${SHUTDOWN_TIMEOUT_MS}ms, continuing shutdown anyway`);
      resolve();
    }, SHUTDOWN_TIMEOUT_MS).unref();
  });
  try {
    await Promise.race([work.then(() => { settled = true; }), bound]);
  } catch (err) {
    settled = true;
    shutdownHadError = true;
    app.log.error(err, `[api] error during ${label}`);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`[api] received ${signal}, shutting down gracefully`);

  await withBound("Fastify close", app.close());
  await withBound("queue close", closeQueues());
  await withBound("readiness Redis close", closeReadinessRedis());
  await withBound("Prisma disconnect", prisma.$disconnect());

  process.exit(shutdownHadError ? 1 : 0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
