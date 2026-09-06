import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

// Mirrors the handler wired in apps/api/src/index.ts - that route lives on
// the top-level app script (not a registerable plugin), so it isn't reachable
// through tests/helpers.ts's buildApp(). Building the same handler here
// against the real checkReadiness (happy path) or a mocked one (failure
// paths) exercises the identical logic without needing to restructure index.ts.
async function buildHealthApp(checkReadiness: typeof import("../src/lib/health.js").checkReadiness) {
  const prisma = new PrismaClient();
  const app = Fastify({ logger: false });
  app.get("/health", async (_request, reply) => {
    const readiness = await checkReadiness(prisma);
    return reply
      .code(readiness.ok ? 200 : 503)
      .send({ status: readiness.ok ? "ok" : "error", checks: readiness.checks });
  });
  await app.ready();
  return { app, prisma };
}

let app: FastifyInstance | undefined;
let prisma: PrismaClient | undefined;

afterEach(async () => {
  await app?.close();
  await prisma?.$disconnect();
  app = undefined;
  prisma = undefined;
  vi.restoreAllMocks();
});

describe("GET /health (against real local Postgres/Redis)", () => {
  it("returns 200 with both checks healthy", async () => {
    const { checkReadiness } = await import("../src/lib/health.js");
    ({ app, prisma } = await buildHealthApp(checkReadiness));

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; checks: { postgres: { ok: boolean }; redis: { ok: boolean } } }>();
    expect(body.status).toBe("ok");
    expect(body.checks.postgres.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(true);
  });
});

describe("GET /health (mocked dependency failures)", () => {
  it("returns 503 and identifies PostgreSQL as unhealthy", async () => {
    vi.doMock("../src/lib/health.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/lib/health.js")>();
      return {
        ...actual,
        checkReadiness: vi.fn().mockResolvedValue({
          ok: false,
          checks: { postgres: { ok: false, error: "connection refused" }, redis: { ok: true } },
        }),
      };
    });
    const { checkReadiness } = await import("../src/lib/health.js");
    ({ app, prisma } = await buildHealthApp(checkReadiness));

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    const body = res.json<{ status: string; checks: { postgres: { ok: boolean }; redis: { ok: boolean } } }>();
    expect(body.status).toBe("error");
    expect(body.checks.postgres.ok).toBe(false);
    expect(body.checks.redis.ok).toBe(true);
    vi.doUnmock("../src/lib/health.js");
  });

  it("returns 503 and identifies Redis as unhealthy", async () => {
    vi.doMock("../src/lib/health.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/lib/health.js")>();
      return {
        ...actual,
        checkReadiness: vi.fn().mockResolvedValue({
          ok: false,
          checks: { postgres: { ok: true }, redis: { ok: false, error: "ECONNREFUSED" } },
        }),
      };
    });
    const { checkReadiness } = await import("../src/lib/health.js");
    ({ app, prisma } = await buildHealthApp(checkReadiness));

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    const body = res.json<{ status: string; checks: { postgres: { ok: boolean }; redis: { ok: boolean } } }>();
    expect(body.status).toBe("error");
    expect(body.checks.redis.ok).toBe(false);
    vi.doUnmock("../src/lib/health.js");
  });
});
