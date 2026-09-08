import { describe, it, expect, vi, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";

// Integration test for the graceful-shutdown handler wired into
// apps/api/src/index.ts (a top-level script, not exported functions - see
// design.md Decision 3). Imports the real entry point in-process (real
// Fastify server, real Postgres, real Redis) rather than spawning a child
// process and sending it a real OS signal: on this project's only current
// test environment (Windows, no CI), a parent process cannot deliver a
// catchable SIGTERM/SIGINT to a spawned Node child - Windows force-kills it
// instead, matching Node's own documented limitation for
// ChildProcess.kill(). process.emit("SIGTERM") fires the exact same
// EventEmitter listener a real signal would, so this exercises the real
// code path, not a simulation of it.

const TEST_PORT = 41000 + Math.floor(Math.random() * 5000);

async function waitForListening(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("server did not start listening in time");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env["PORT"];
});

describe("API graceful shutdown", () => {
  it("PROD-008: SIGTERM drains, closes every dependency exactly once, and exits within a bounded time", async () => {
    process.env["PORT"] = String(TEST_PORT);

    // Dynamically imported only after PORT is set above: a static import of
    // either module would transitively load ../src/config.js (both queues.ts
    // and health.ts import it), freezing config.port from the process's
    // original environment before this test gets a chance to override it.
    const queues = await import("../src/lib/queues.js");
    const health = await import("../src/lib/health.js");

    const quitSpy = vi.spyOn(Redis.prototype, "quit");
    const disconnectSpy = vi.spyOn(PrismaClient.prototype, "$disconnect");
    const closeQueuesSpy = vi.spyOn(queues, "closeQueues");
    const closeReadinessRedisSpy = vi.spyOn(health, "closeReadinessRedis");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await import("../src/index.js");
    await waitForListening(TEST_PORT);

    const start = Date.now();
    process.emit("SIGTERM", "SIGTERM");

    const deadline = Date.now() + 10_000;
    while (exitSpy.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const elapsedMs = Date.now() - start;

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(elapsedMs).toBeLessThan(10_000);

    // Fastify actually stopped accepting connections.
    await expect(fetch(`http://127.0.0.1:${TEST_PORT}/health`)).rejects.toThrow();

    // Every Redis connection the API opened: session's, rate-limit's,
    // queues.ts's shared connection (quit inside closeQueues()), and
    // health.ts's readiness connection (created above by the /health probe
    // in waitForListening, quit inside closeReadinessRedis()).
    expect(quitSpy).toHaveBeenCalledTimes(4);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(closeQueuesSpy).toHaveBeenCalledTimes(1);
    expect(closeReadinessRedisSpy).toHaveBeenCalledTimes(1);

    // A second signal must not re-run shutdown (idempotency).
    process.emit("SIGTERM", "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(closeQueuesSpy).toHaveBeenCalledTimes(1);
    expect(closeReadinessRedisSpy).toHaveBeenCalledTimes(1);
  }, 20_000);
});
