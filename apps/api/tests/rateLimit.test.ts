import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./helpers.js";

const EDGE_IP = "10.0.0.1"; // simulated Railway edge - the raw socket peer
// Distinct per test (not just per assertion) - @fastify/rate-limit's Redis
// store persists across app instances within a run, so reusing an IP across
// tests would leak budget from one test into the next.
const CLIENT_A = "203.0.113.1";
const CLIENT_B = "203.0.113.2";
const CLIENT_C = "203.0.113.3";

const TRUST_ONE_HOP = (_address: string, hop: number) => hop < 1;

let app: FastifyInstance;

afterEach(async () => {
  await app?.close();
});

async function buildLimitedApp() {
  const built = await buildApp({ trustProxy: TRUST_ONE_HOP, rateLimit: true });
  app = built.app;
  app.get(
    "/limited",
    { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } },
    async () => ({ ok: true })
  );
  await app.ready();
  return built;
}

function requestFrom(clientIp: string) {
  return app.inject({
    method: "GET",
    url: "/limited",
    remoteAddress: EDGE_IP,
    headers: { "x-forwarded-for": clientIp },
  });
}

describe("rate limiting on the resolved client IP", () => {
  it("rate-limits distinct resolved clients independently", async () => {
    await buildLimitedApp();

    // Client A uses its whole budget (max: 2).
    expect((await requestFrom(CLIENT_A)).statusCode).toBe(200);
    expect((await requestFrom(CLIENT_A)).statusCode).toBe(200);
    expect((await requestFrom(CLIENT_A)).statusCode).toBe(429);

    // Client B, sharing the same trusted proxy hop, has its own budget.
    expect((await requestFrom(CLIENT_B)).statusCode).toBe(200);
  });

  it("returns 429 once the same resolved client exceeds its limit", async () => {
    await buildLimitedApp();

    await requestFrom(CLIENT_C);
    await requestFrom(CLIENT_C);
    const res = await requestFrom(CLIENT_C);

    expect(res.statusCode).toBe(429);
  });
});
