import { describe, it, expect, vi, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";

vi.mock("../../src/lib/storage.js", () => ({
  headBucket: vi.fn(),
}));

vi.mock("ioredis", () => {
  const Redis = vi.fn().mockImplementation(() => ({ ping: vi.fn().mockResolvedValue("PONG") }));
  return { Redis, default: Redis };
});

import { headBucket } from "../../src/lib/storage.js";
import { checkPostgres, checkRedis, checkStorage, checkReadiness, runPreflight } from "../../src/lib/health.js";

function fakePrisma(impl: () => Promise<unknown>): PrismaClient {
  return { $queryRaw: impl } as unknown as PrismaClient;
}

function fakeRedis(impl: () => Promise<unknown>): Redis {
  return { ping: impl } as unknown as Redis;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("checkPostgres", () => {
  it("resolves ok against a reachable database", async () => {
    const prisma = fakePrisma(() => Promise.resolve([{ "?column?": 1 }]));
    expect(await checkPostgres(prisma)).toEqual({ ok: true });
  });

  it("resolves not-ok when the query rejects", async () => {
    const prisma = fakePrisma(() => Promise.reject(new Error("connection refused")));
    const result = await checkPostgres(prisma);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection refused");
  });

  it("resolves not-ok when the query never settles (timeout)", async () => {
    const prisma = fakePrisma(() => new Promise(() => {}));
    const result = await checkPostgres(prisma);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  }, 3000);
});

describe("checkRedis", () => {
  it("resolves ok against a reachable connection", async () => {
    const redis = fakeRedis(() => Promise.resolve("PONG"));
    expect(await checkRedis(redis)).toEqual({ ok: true });
  });

  it("resolves not-ok when PING rejects", async () => {
    const redis = fakeRedis(() => Promise.reject(new Error("ECONNREFUSED")));
    const result = await checkRedis(redis);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("resolves not-ok when PING never settles (timeout)", async () => {
    const redis = fakeRedis(() => new Promise(() => {}));
    const result = await checkRedis(redis);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  }, 3000);
});

describe("checkReadiness", () => {
  it("caches the combined result within the TTL window, then re-probes after it expires", async () => {
    vi.useFakeTimers();
    const queryRaw = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
    const prisma = fakePrisma(queryRaw);

    const first = await checkReadiness(prisma);
    expect(first.ok).toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    // Still within the 2000ms TTL - cached, no new probe.
    vi.advanceTimersByTime(1000);
    const second = await checkReadiness(prisma);
    expect(second).toBe(first);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    // Past the TTL - probes again.
    vi.advanceTimersByTime(1500);
    await checkReadiness(prisma);
    expect(queryRaw).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe("runPreflight", () => {
  it("resolves ok immediately when everything is healthy", async () => {
    vi.mocked(headBucket).mockResolvedValue({});
    const prisma = fakePrisma(() => Promise.resolve([{ "?column?": 1 }]));
    const redis = fakeRedis(() => Promise.resolve("PONG"));

    const result = await runPreflight(prisma, redis);

    expect(result).toEqual({ ok: true, failed: [] });
  });

  it("recovers after one retry when a check fails once then succeeds", async () => {
    vi.useFakeTimers();
    vi.mocked(headBucket).mockResolvedValue({});
    let redisCalls = 0;
    const prisma = fakePrisma(() => Promise.resolve([{ "?column?": 1 }]));
    const redis = fakeRedis(() => {
      redisCalls++;
      return redisCalls === 1 ? Promise.reject(new Error("ECONNREFUSED")) : Promise.resolve("PONG");
    });

    const pending = runPreflight(prisma, redis);
    await vi.advanceTimersByTimeAsync(500);
    const result = await pending;

    expect(result).toEqual({ ok: true, failed: [] });
    expect(redisCalls).toBe(2);
    vi.useRealTimers();
  });

  it("fails after exhausting all retries, naming the still-failing dependency", async () => {
    vi.useFakeTimers();
    vi.mocked(headBucket).mockRejectedValue(new Error("Forbidden"));
    const prisma = fakePrisma(() => Promise.resolve([{ "?column?": 1 }]));
    const redis = fakeRedis(() => Promise.resolve("PONG"));

    const pending = runPreflight(prisma, redis);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(["storage"]);
    vi.useRealTimers();
  });
});

describe("checkStorage", () => {
  it("resolves ok when the bucket is reachable", async () => {
    vi.mocked(headBucket).mockResolvedValue({});
    expect(await checkStorage()).toEqual({ ok: true });
  });

  it("resolves not-ok when the bucket is unreachable, with no create-bucket fallback", async () => {
    vi.mocked(headBucket).mockRejectedValue(new Error("Forbidden"));
    const result = await checkStorage();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Forbidden");
  });
});
