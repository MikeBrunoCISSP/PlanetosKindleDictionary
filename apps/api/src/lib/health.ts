import type { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { config } from "../config.js";
import { headBucket } from "./storage.js";

export interface CheckResult {
  ok: boolean;
  error?: string;
}

const PROBE_TIMEOUT_MS = 1500;

async function withTimeout(fn: () => Promise<unknown>, label: string): Promise<CheckResult> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS)
      ),
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Bounded connectivity check - a real round trip, since Prisma has no free "is connected" flag. */
export function checkPostgres(prisma: PrismaClient): Promise<CheckResult> {
  return withTimeout(() => prisma.$queryRaw`SELECT 1`, "postgres");
}

/** Bounded connectivity check against the given ioredis connection. */
export function checkRedis(connection: Redis): Promise<CheckResult> {
  return withTimeout(() => connection.ping(), "redis");
}

/**
 * Bounded, fail-loud storage check - unlike `ensureBucketExists()`, this
 * never attempts to create the bucket; a misconfigured/unreachable bucket
 * should be reported as broken, not silently tolerated.
 */
export function checkStorage(): Promise<CheckResult> {
  return withTimeout(() => headBucket(), "storage");
}

// Dedicated to readiness checks - deliberately not shared with the session,
// rate-limit, or queue Redis clients, so the readiness path never touches a
// connection that also carries production traffic (openspec: deployment/railway).
let readinessRedis: Redis | undefined;
function getReadinessRedis(): Redis {
  readinessRedis ??= new Redis(config.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: false });
  return readinessRedis;
}

export interface ReadinessResult {
  ok: boolean;
  checks: { postgres: CheckResult; redis: CheckResult };
}

const READINESS_CACHE_TTL_MS = 2000;
let cached: { result: ReadinessResult; expiresAt: number } | undefined;

/**
 * Combined API readiness: PostgreSQL + Redis only (storage is deliberately
 * excluded - see design.md Decision 2). Caches the combined result for
 * READINESS_CACHE_TTL_MS so rapid successive polls (e.g. Railway's deploy
 * healthcheck) don't repeatedly hit either dependency.
 */
export async function checkReadiness(prisma: PrismaClient): Promise<ReadinessResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.result;

  const [postgres, redis] = await Promise.all([checkPostgres(prisma), checkRedis(getReadinessRedis())]);
  const result: ReadinessResult = { ok: postgres.ok && redis.ok, checks: { postgres, redis } };
  cached = { result, expiresAt: now + READINESS_CACHE_TTL_MS };
  return result;
}

// Delay before each retry after a failed attempt - absorbs a Postgres/Redis
// service that's still coming up in the same deploy window, not a
// persistently broken dependency (see design.md Decision 4).
const PREFLIGHT_RETRY_DELAYS_MS = [500, 1000, 2000];

export interface PreflightResult {
  ok: boolean;
  failed: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker-only startup gate: Postgres, Redis (the exact connection BullMQ
 * will use), and storage must all be reachable before the worker registers
 * to process any job. Retries the whole set of checks on any failure, up to
 * PREFLIGHT_RETRY_DELAYS_MS.length additional times.
 */
export async function runPreflight(prisma: PrismaClient, redisConnection: Redis): Promise<PreflightResult> {
  const totalAttempts = PREFLIGHT_RETRY_DELAYS_MS.length + 1;
  let last: { postgres: CheckResult; redis: CheckResult; storage: CheckResult } | undefined;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const [postgres, redis, storage] = await Promise.all([
      checkPostgres(prisma),
      checkRedis(redisConnection),
      checkStorage(),
    ]);
    last = { postgres, redis, storage };
    if (postgres.ok && redis.ok && storage.ok) return { ok: true, failed: [] };

    const delay = PREFLIGHT_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) await sleep(delay);
  }

  const failed = Object.entries(last ?? {})
    .filter(([, result]) => !result.ok)
    .map(([name]) => name);
  return { ok: false, failed };
}
