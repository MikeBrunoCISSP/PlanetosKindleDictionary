## Context

See proposal.md - Why. Confirmed by reading the current code:

- `apps/api/src/index.ts` constructs Fastify, Prisma, and (via Bull Board) the three BullMQ queues, then calls `app.listen(...)` — and never registers a `SIGTERM`/`SIGINT` listener, never calls `app.close()`, never disconnects Prisma, and never calls `closeQueues()` (which already exists in `apps/api/src/lib/queues.ts` and is already used by `apps/api/src/worker.ts`'s own shutdown handler).
- `apps/api/src/plugins/session.ts` and `apps/api/src/plugins/rateLimit.ts` each do `const redis = new Redis(config.redisUrl)` and never close it — no `onClose` hook, no reference kept anywhere the app could reach later.
- `apps/api/src/lib/queues.ts` already exports `closeQueues()`, which closes all three `Queue` instances and quits the shared connection. It needs no changes; the API just needs to call it, exactly as the worker already does.
- **Discovered during the apply read-through, not in the finding's own `locations`**: `apps/api/src/lib/health.ts` opens a fourth, independent Redis connection (`readinessRedis`, lazily created by `getReadinessRedis()` and used only by `checkReadiness()`, which the API's `GET /health` route calls) — deliberately separate from the session/rate-limit/queue connections so the readiness probe never shares a connection with production traffic. It has exactly the same unclosed-connection problem as the other three, just not called out by the external reviewer. Confirmed with the user before fixing it in the same change, since acceptance criterion 2 ("All Redis... connections close exactly once") is general, not scoped to only the four named locations.
- The worker's own shutdown handler (`apps/api/src/worker.ts`) is not itself idempotent-guarded and is out of scope here — this finding's locations are entirely API-side (`index.ts`, the two plugins, `queues.ts`). Nothing here touches `worker.ts`.

**A significant testing constraint discovered during investigation**: this project has no CI configuration, so the only environment tests run in today is the local Windows development machine. Empirically verified (via a throwaway script, not committed): on Windows, `ChildProcess.kill('SIGTERM')`, `.kill('SIGINT')`, and even `process.kill(pid, 'SIGBREAK')` from a parent Node process do not deliver a catchable signal to a spawned Node child process — Windows just force-terminates it, matching Node's own documented Windows limitation for `subprocess.kill()`. A test that spawns a real child process and sends it a real OS signal would therefore never actually exercise the shutdown handler on this machine (and would either hang or falsely report success/failure based on an unconditional kill, not graceful behavior). Production (Railway, Linux containers) delivers genuine `SIGTERM` normally and is unaffected — this constraint is purely about how to *test* the behavior here, not about the shutdown code itself.

## Goals / Non-Goals

**Goals:**
- The API stops accepting new connections and drains in-flight ones before closing its dependencies, on both `SIGTERM` and `SIGINT`.
- Every connection the API itself opened (Prisma, the queues' shared Redis connection, the session plugin's Redis connection, the rate-limit plugin's Redis connection, and `health.ts`'s readiness-check Redis connection) closes exactly once, even if a second termination signal arrives mid-shutdown.
- No single slow-to-close dependency can hang the process indefinitely — shutdown is bounded.
- The behavior has a real, automated test that exercises the actual runtime (real Fastify server, real Postgres, real Redis), not just a pure-logic unit test.

**Non-Goals:**
- Making `worker.ts`'s existing shutdown handler idempotent or bounded — out of scope for this finding's locations; a reasonable future follow-up but not required here.
- A literal spawned-child-process, real-OS-signal test — infeasible to make meaningful on this project's only test environment (see Context); the in-process approach below exercises the identical code path.
- Any change to `closeQueues()` itself — it already does the right thing and is reused as-is.

## Decisions

### 1. `session.ts` and `rateLimit.ts` each close their own Redis client via `onClose`

```ts
// session.ts
const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(config.redisUrl);
  const store = new RedisStore({ client: redis as never });

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });

  await fastify.register(fastifyCookie);
  await fastify.register(fastifySession, { ... });
};
```

Same pattern in `rateLimit.ts`. Both plugins are registered with `fastify-plugin` (`fp(...)`, not encapsulated), so `fastify` inside the plugin function is the app's root instance — the `onClose` hook fires when the root Fastify instance closes, i.e. exactly when `app.close()` is called. This is also what already fixes the test-leak half of the finding's impact: every test file's `afterAll` that already calls `app.close()` (e.g. `series.test.ts`, `prune.test.ts`) will now also quit these Redis clients, with no test-file changes needed for that part.

Alternative considered and rejected: keeping the connections and closing them centrally from `index.ts` by importing the plugins' internals. Rejected — it would require exporting each plugin's Redis instance just for shutdown, breaking the plugins' encapsulation for no benefit; `onClose` is exactly Fastify's built-in mechanism for a plugin to close what it opened, and is themselves visible to `app.close()` regardless of where `app.close()` is called from.

### 2. `health.ts` exports a `closeReadinessRedis()` for its own connection

```ts
let readinessRedis: Redis | undefined;
function getReadinessRedis(): Redis {
  readinessRedis ??= new Redis(config.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: false });
  return readinessRedis;
}

export async function closeReadinessRedis(): Promise<void> {
  await readinessRedis?.quit();
  readinessRedis = undefined;
}
```

Unlike the session/rate-limit plugins, `health.ts` isn't a Fastify plugin and has no `onClose` hook to hang this off of — it's a plain lib module whose connection is lazily created the first time `/health` is hit. `index.ts` calls this explicitly from its own shutdown sequence (Decision 3). The `readinessRedis = undefined` reset afterward makes a second call harmless (mirrors why the `shuttingDown` guard in Decision 3 already prevents that in practice, but costs nothing extra to be locally correct too).

### 3. `index.ts` gets one idempotent, bounded shutdown handler for both signals

```ts
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

  // Stops accepting new connections, drains in-flight ones, and runs every
  // plugin's onClose hook (including the two Redis clients from Decision 1)
  // - all before this resolves.
  await withBound("Fastify close", app.close());
  await withBound("queue close", closeQueues());
  await withBound("readiness Redis close", closeReadinessRedis());
  await withBound("Prisma disconnect", prisma.$disconnect());

  process.exit(shutdownHadError ? 1 : 0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```

`closeQueues` is added to the existing `import { getDictionaryBuildQueue, getMaintenanceQueue, getEmailQueue } from "./lib/queues.js"` line; `closeReadinessRedis` is added to the existing `import { checkReadiness } from "./lib/health.js"` line (Decision 2).

Ordering matters: `app.close()` first, since routes may still be using `prisma` while draining in-flight requests — disconnecting Prisma or the queues before Fastify has finished draining could break a request that's still being served. Each step is independently bounded and error-isolated in `withBound`, so a hang or throw in one step (e.g. Fastify's close hanging on a stuck connection) doesn't prevent the later steps from being attempted — shutdown always proceeds to `process.exit`, satisfying "bounded period" even in a partial-failure case. The `shuttingDown` guard makes a second signal (received mid-shutdown) a no-op, satisfying "closes exactly once". `SHUTDOWN_TIMEOUT_MS = 10_000` is a conservative internal bound, not tied to any specific documented Railway grace-period value (not confirmed in this repo) — comfortably short enough to finish well inside typical platform termination windows.

Alternative considered and rejected: registering two separate handler functions for `SIGTERM` and `SIGINT`. Rejected — they should behave identically here (there's no reason to drain differently for one vs. the other), and a single shared function is what makes the `shuttingDown` guard meaningful across both.

### 4. Testing: in-process real-server test, triggered via `process.emit`, not a spawned child process

Per the Context section's empirical finding, a spawned-child-process test sending a real OS signal cannot be made to work on this project's only current test environment. Instead, `apps/api/tests/apiShutdown.test.ts` imports the real `../src/index.js` directly into the test process (real Fastify, real Postgres, real Redis, real queues — nothing mocked except `process.exit`, which is spied so it doesn't kill the test runner), then triggers the exact same listener a real signal would via `process.emit("SIGTERM")` — this is a plain Node `EventEmitter` event, identical to what actually fires inside the process when the OS delivers a real signal, so it exercises the true code path, not a simulation of it:

```ts
import { describe, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";

const TEST_PORT = 41000 + Math.floor(Math.random() * 5000);

async function waitForListening(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server did not start listening in time");
}

describe("API graceful shutdown", () => {
  it("PROD-008: SIGTERM drains, closes every dependency exactly once, and exits within a bounded time", async () => {
    process.env.PORT = String(TEST_PORT);

    // Dynamically imported only after PORT is set above: a static import of
    // either module would transitively load ../src/config.js, freezing
    // config.port before this test gets a chance to override it.
    const queues = await import("../src/lib/queues.js");
    const health = await import("../src/lib/health.js");

    const quitSpy = vi.spyOn(Redis.prototype, "quit");
    const disconnectSpy = vi.spyOn(PrismaClient.prototype, "$disconnect");
    const closeQueuesSpy = vi.spyOn(queues, "closeQueues");
    const closeReadinessRedisSpy = vi.spyOn(health, "closeReadinessRedis");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await import("../src/index.js");
    await waitForListening(TEST_PORT); // also creates health.ts's readinessRedis, via the /health probe

    const start = Date.now();
    process.emit("SIGTERM");

    const deadline = Date.now() + 10_000;
    while (exitSpy.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(Date.now() - start).toBeLessThan(10_000);

    // Fastify actually stopped accepting connections.
    await expect(fetch(`http://127.0.0.1:${TEST_PORT}/health`)).rejects.toThrow();

    // session's Redis, rate-limit's Redis, queues.ts's shared connection, and health.ts's readiness connection.
    expect(quitSpy).toHaveBeenCalledTimes(4);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(closeQueuesSpy).toHaveBeenCalledTimes(1);
    expect(closeReadinessRedisSpy).toHaveBeenCalledTimes(1);

    // A second signal must not re-run shutdown.
    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  }, 20_000);
});
```

`vi.spyOn` on `Redis.prototype.quit`, `PrismaClient.prototype.$disconnect`, and the real `queues`/`health` modules' `closeQueues`/`closeReadinessRedis` (without `mockImplementation`) records calls while still letting the real close/disconnect happen — the same spy-on-a-real-module pattern this codebase already uses in `prune.test.ts` (`vi.spyOn(storage, "deleteObjects")`). This single test covers all three acceptance criteria: draining/stopping new connections (the post-shutdown `fetch` rejection), every dependency closing exactly once (the spy counts, now including `health.ts`'s connection from Decision 2), and bounded completion (the wait-loop's own deadline plus the elapsed-time assertion) — plus idempotency via the second `process.emit`.

Alternative considered and rejected: skip a spawned-child-process test on `win32` and let it only really run in CI. Rejected — there is no CI in this repo today, so that test would never actually execute here, providing zero real verification versus the in-process approach's genuine (if not OS-boundary-literal) coverage.

## Risks / Trade-offs

- **[Risk] The in-process test's `process.emit("SIGTERM")` is not byte-for-byte identical to an OS-delivered signal.** → Accepted: `process.on("SIGTERM", fn)` and `process.emit("SIGTERM")` operate on the exact same `EventEmitter` listener list Node's own signal-delivery machinery uses internally; the handler function that runs is identical either way. What differs is only how the event got enqueued, not what code executes.
- **[Risk] `SHUTDOWN_TIMEOUT_MS = 10_000` is a local guess, not a value derived from a documented Railway termination grace period.** → Accepted: it's a local constant, trivially adjustable, and conservative enough to complete well before typical platform grace windows; there's no confirmed number in this repository to derive it from more precisely.
- **[Risk] `worker.ts`'s own shutdown handler remains non-idempotent.** → Accepted as explicitly out of scope: this finding's locations are all API-side; a double-SIGTERM race in the worker is a separate, un-reported concern.

## Migration Plan

Pure code change — no schema, no new dependency, no data migration. Deploys and rolls back exactly like any other code-only release.
