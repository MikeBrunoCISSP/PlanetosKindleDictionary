## Why

`/health` always returns 200 and checks nothing — not PostgreSQL, not Redis,
not object storage — so Railway's deployment healthcheck can promote a
deployment that can't actually authenticate, query data, enqueue builds, or
serve downloads. Separately, `ensureBucketExists()` is deliberately fail-soft
by design, so the worker calls it at startup and proceeds regardless of the
result, meaning a genuinely misconfigured/unreachable bucket never stops the
worker from accepting jobs that will fail the moment they try to write
output (finding PROD-005, medium severity).

## What Changes

- **BREAKING**: `/health` becomes a real readiness check instead of an
  unconditional 200. It now checks PostgreSQL (a bounded `SELECT 1`) and
  Redis (a bounded `PING`), replying 200 with a `checks` breakdown when both
  are reachable, or 503 with the same breakdown when either is not. Object
  storage is deliberately not part of this check (see design.md).
- Each dependency probe is individually timeout-bounded, and the combined
  result is cached for a short TTL so rapid successive polls (e.g. during a
  Railway deploy) don't repeatedly hit Postgres/Redis.
- The worker runs a startup preflight (Postgres, Redis, and object storage,
  with bounded retry/backoff to absorb a dependency that's still starting up)
  before registering any BullMQ worker or job scheduler. On exhausted
  retries it logs which dependency failed and exits non-zero, so it never
  accepts jobs against an unusable dependency.
- `.railway/railway.ts` sets an explicit `healthcheckTimeout` on the `app`
  service, since `/health` is no longer a trivial instant-200 handler.
- `lib/storage.ts`'s bucket-existence check is refactored to share its
  `HeadBucketCommand` call with the new health-check code; `ensureBucketExists()`'s
  existing fail-soft behavior is unchanged.
- `lib/queues.ts` exports its Redis connection getter so the worker's
  preflight can probe the exact connection BullMQ uses.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `deployment/railway`: adds requirements that the API's readiness reports
  real dependency health (not an unconditional 200), and that the worker
  fails startup rather than accepting jobs when a required dependency is
  unusable.

## Impact

- `apps/api/src/lib/health.ts` (new) — dependency probes, cached readiness
  check, and the worker's preflight helper.
- `apps/api/src/lib/storage.ts` — extracted `HeadBucketCommand` primitive.
- `apps/api/src/lib/queues.ts` — exported connection getter.
- `apps/api/src/index.ts` — `/health` route behavior.
- `apps/api/src/worker.ts` — startup preflight before accepting jobs.
- `.railway/railway.ts` — `healthcheckTimeout` on `app`.
- `infra/railway/README.md` — updated `/health` verification step and
  worker-gate documentation.
- `apps/api/tests/health.test.ts` (new), plus a unit test for the worker's
  preflight helper.
- No changes to continuous monitoring/alerting — explicitly out of scope,
  since Railway's deployment healthcheck is a one-time promotion gate, not
  an ongoing monitor.
