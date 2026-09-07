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

describe("WRITE_RATE_LIMIT-style keying: authenticated user identity over IP", () => {
  const REASON = "I'd like to contribute definitions.";
  const VALID_PASSWORD = "SecureP4ss!";

  // REGISTRATION_RATE_LIMIT/LOGIN_RATE_LIMIT are IP-keyed and share the real
  // Redis-backed store across test runs (1 hour / 15 min windows respectively)
  // - a unique simulated IP per test run (not just per test) avoids colliding
  // with that budget on repeated runs, matching this file's own established
  // convention above.
  const REGISTER_IP = `203.0.${(Date.now() >> 8) % 256}.${Date.now() % 256}`;

  async function registerAndLogin(built: Awaited<ReturnType<typeof buildApp>>, suffix: string) {
    const email = `writelimit-${suffix}-${Date.now()}@example.com`;
    const username = `WriteLimitUser${suffix}${Date.now()}`;
    await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      remoteAddress: EDGE_IP,
      headers: { "x-forwarded-for": REGISTER_IP },
      payload: { email, username, reasonForJoining: REASON, password: VALID_PASSWORD },
    });
    await built.prisma.user.update({ where: { email }, data: { emailVerified: true } });
    const loginRes = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: EDGE_IP,
      headers: { "x-forwarded-for": REGISTER_IP },
      payload: { identifier: email, password: VALID_PASSWORD },
    });
    const setCookie = loginRes.headers["set-cookie"] as string | string[];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? "";
    return { email, cookie: cookie.split(";")[0] ?? "" };
  }

  it("buckets by session user id, not IP: distinct users behind the same IP get independent budgets", async () => {
    const built = await buildApp({ trustProxy: TRUST_ONE_HOP, rateLimit: true });
    app = built.app;
    app.post(
      "/write-limited",
      {
        config: {
          rateLimit: {
            max: 2,
            timeWindow: "1 minute",
            keyGenerator: (request) => request.session.userId ?? request.ip,
          },
        },
      },
      async () => ({ ok: true })
    );
    await app.ready();

    const userA = await registerAndLogin(built, "a");
    const userB = await registerAndLogin(built, "b");

    const requestAs = (cookie: string) =>
      app.inject({ method: "POST", url: "/write-limited", remoteAddress: "203.0.113.50", headers: { cookie } });

    // User A exhausts their own budget (max: 2), from a shared IP.
    expect((await requestAs(userA.cookie)).statusCode).toBe(200);
    expect((await requestAs(userA.cookie)).statusCode).toBe(200);
    expect((await requestAs(userA.cookie)).statusCode).toBe(429);

    // User B, authenticated from the same IP, has an independent budget.
    expect((await requestAs(userB.cookie)).statusCode).toBe(200);

    // User A remains blocked even from a different IP - identity, not IP, governs.
    const res = await app.inject({
      method: "POST",
      url: "/write-limited",
      remoteAddress: "198.51.100.7",
      headers: { cookie: userA.cookie },
    });
    expect(res.statusCode).toBe(429);

    await built.prisma.$disconnect();
  });
});

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
