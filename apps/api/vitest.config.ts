import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./tests/setup.ts"],
    // Tests share one real Postgres/Redis instance with no per-file
    // isolation (no transactions, no per-file schema). Running files in
    // parallel lets them race on shared state - e.g. one file's admin
    // user counts toward another file's "last active admin" checks.
    fileParallelism: false,
  },
});
