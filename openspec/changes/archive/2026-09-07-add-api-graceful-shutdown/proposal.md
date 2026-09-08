## Why

The API process has no shutdown handling at all: it never listens for `SIGTERM`/`SIGINT`, never calls `app.close()`, and never disconnects Prisma or the queue/Redis connections it holds. The `session` and `rate-limit` plugins each open their own `ioredis` connection with no `onClose` hook to close it. A finding from an external review (PROD-008) flags this: Railway deploys and restarts can cut off in-flight requests abruptly and leave open handles that the platform eventually force-kills, and every fresh app instance (including in tests) leaks a Redis connection since nothing ever closes the ones the plugins open.

## What Changes

- `session.ts` and `rate-limit.ts` each register a Fastify `onClose` hook that quits the Redis client they own, so closing the Fastify instance closes the connection it created — including from every test that already calls `app.close()` in its own cleanup.
- `health.ts` gains a `closeReadinessRedis()` export for its own, separate readiness-check Redis connection — a fourth connection with the same unclosed problem, found during implementation and not in the finding's own list of locations.
- `index.ts` gains one idempotent shutdown handler shared by `SIGTERM` and `SIGINT`: stop accepting new connections and drain in-flight ones (`app.close()`, which also runs the two plugins' new `onClose` hooks), then close the queue/Redis connections (`closeQueues()`, already used by the worker), the readiness connection, and disconnect Prisma. A second signal received while already shutting down is a no-op. Each step is individually bounded by a timeout so a stuck dependency can't hang the process indefinitely.
- A new automated test exercises this in-process against the real Fastify server, real Postgres, and real Redis (see design.md for why this test triggers shutdown via `process.emit("SIGTERM")` rather than sending a real OS signal to a spawned child process — a real signal isn't reliably deliverable to a child process on this Windows development machine, whereas the in-process approach exercises the exact same listener and works identically here and on Railway's Linux containers).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `deployment/railway`: gains a new requirement that the API shuts down gracefully on `SIGTERM`/`SIGINT` — draining in-flight requests, closing every owned connection exactly once, and exiting within a bounded period.

## Impact

- `apps/api/src/plugins/session.ts` — register an `onClose` hook that quits its Redis client.
- `apps/api/src/plugins/rateLimit.ts` — register an `onClose` hook that quits its Redis client.
- `apps/api/src/lib/health.ts` — export `closeReadinessRedis()` for its own readiness-check Redis connection.
- `apps/api/src/index.ts` — add the idempotent `SIGTERM`/`SIGINT` shutdown handler.
- `apps/api/tests/apiShutdown.test.ts` (new) — in-process integration test against the real server.
