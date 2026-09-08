## 1. Plugin-owned Redis connections close on `app.close()`

- [x] 1.1 In `apps/api/src/plugins/session.ts`, register `fastify.addHook("onClose", async () => { await redis.quit(); })` right after constructing `redis`, per design.md Decision 1. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 1.2 In `apps/api/src/plugins/rateLimit.ts`, register the equivalent `onClose` hook for its own `redis` client. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 1.3 (Added during apply, confirmed with user) In `apps/api/src/lib/health.ts`, export `closeReadinessRedis()` that quits `readinessRedis` if it was ever created and resets it to `undefined`, per design.md Decision 2 — a fourth API-owned Redis connection found during the read-through, not in the finding's own `locations`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.

## 2. Idempotent, bounded shutdown handler in `index.ts`

- [x] 2.1 In `apps/api/src/index.ts`, add `closeQueues` to the existing `./lib/queues.js` import and `closeReadinessRedis` to the existing `./lib/health.js` import, then add the `SHUTDOWN_TIMEOUT_MS` constant, the `shuttingDown`/`shutdownHadError` flags, the `withBound` helper, and the `shutdown(signal)` function per design.md Decision 3, calling `app.close()`, then `closeQueues()`, then `closeReadinessRedis()`, then `prisma.$disconnect()` in that order, each wrapped in `withBound`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.
- [x] 2.2 Register `process.on("SIGTERM", () => void shutdown("SIGTERM"))` and `process.on("SIGINT", () => void shutdown("SIGINT"))` at the end of `index.ts`. Verify `pnpm --filter @planetos/api exec tsc --noEmit` passes.

## 3. Automated process-level test

- [x] 3.1 Create `apps/api/tests/apiShutdown.test.ts` per design.md Decision 4: import the real `../src/index.js` in-process against a dedicated test `PORT`, with `process.exit` spied (not implemented as a no-op that actually exits) and `Redis.prototype.quit`, `PrismaClient.prototype.$disconnect`, the real `queues.closeQueues`, and the real `health.closeReadinessRedis` spied-but-not-replaced. Trigger shutdown via `process.emit("SIGTERM")`. Verify the test passes against the real running Postgres/Redis dev services and covers, in one test: (a) a post-shutdown request to `/health` is refused (drained/stopped accepting), (b) each dependency-close spy was called the expected number of times exactly once (`quit` exactly 4 times: session, rate-limit, queues, readiness), (c) the wait-for-exit loop resolves before its own deadline (bounded), and (d) a second `process.emit("SIGTERM")` does not increase the `exit`/`$disconnect` call counts (idempotent).
- [x] 3.2 Run the new test in isolation (`pnpm --filter @planetos/api exec vitest run tests/apiShutdown.test.ts`) at least twice in a row to confirm it isn't flaky/order-dependent (e.g. from the random test port or leftover module state), then run it as part of the full suite.

## 4. Final verification

- [x] 4.1 `pnpm --filter @planetos/api exec tsc --noEmit` passes with all changes in place.
- [x] 4.2 `pnpm --filter @planetos/api test` passes in full against real Postgres/Redis/MinIO — no regressions to any existing suite (in particular, no existing test file's `afterAll` now double-quits a Redis connection in a way that throws).
- [x] 4.3 `openspec validate add-api-graceful-shutdown --type change --strict` passes.
- [x] 4.4 Read-through: confirm `shutdown()` is only reachable via the two `process.on` registrations (no other caller), confirm the `shuttingDown` guard is checked before any async work begins, confirm `app.close()` is awaited (directly or via `withBound`) before `closeQueues()`/`closeReadinessRedis()`/`prisma.$disconnect()` are attempted, and confirm no existing route or plugin still assumes a Redis connection it opened will outlive `app.close()` (all four: session, rate-limit, queues, readiness).
