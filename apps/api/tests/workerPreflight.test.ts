import { describe, it, expect, vi, afterEach } from "vitest";

// Integration test for the preflight gate wired into apps/api/src/worker.ts
// (a top-level script, not exported functions - see design.md Decision 4).
// Mocks every dependency worker.ts touches so importing it is safe, then
// asserts that a failing preflight stops it before any Worker is
// constructed or job scheduler registered (acceptance criterion 2).

const WorkerMock = vi.fn(() => ({ on: vi.fn(), close: vi.fn() }));
const upsertJobSchedulerMock = vi.fn();
const runPreflightMock = vi.fn();

vi.mock("bullmq", () => ({
  Worker: WorkerMock,
}));

vi.mock("../src/lib/queues.js", () => ({
  getDictionaryBuildQueue: vi.fn(() => ({
    opts: { connection: {} },
    upsertJobScheduler: upsertJobSchedulerMock,
  })),
  getMaintenanceQueue: vi.fn(() => ({
    opts: { connection: {} },
    upsertJobScheduler: upsertJobSchedulerMock,
  })),
  getEmailQueue: vi.fn(() => ({
    opts: { connection: {} },
    upsertJobScheduler: upsertJobSchedulerMock,
    add: vi.fn(),
  })),
  getConnection: vi.fn(() => ({})),
  closeQueues: vi.fn(),
}));

vi.mock("../src/lib/storage.js", () => ({
  ensureBucketExists: vi.fn(),
  putObject: vi.fn(),
  deleteObjects: vi.fn(),
  listObjects: vi.fn(),
}));

vi.mock("../src/lib/health.js", () => ({
  runPreflight: runPreflightMock,
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({})),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("worker startup preflight", () => {
  it("exits without constructing a Worker or registering the scheduler when preflight fails", async () => {
    runPreflightMock.mockResolvedValue({ ok: false, failed: ["postgres"] });
    const exitError = new Error("process.exit called");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw exitError;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("../src/worker.js")).rejects.toThrow(exitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("postgres"));
    expect(WorkerMock).not.toHaveBeenCalled();
    expect(upsertJobSchedulerMock).not.toHaveBeenCalled();
  });

  it("proceeds to construct workers and register the scheduler when preflight succeeds", async () => {
    runPreflightMock.mockResolvedValue({ ok: true, failed: [] });

    await import("../src/worker.js");

    expect(WorkerMock).toHaveBeenCalled();
    expect(upsertJobSchedulerMock).toHaveBeenCalled();
  });
});
