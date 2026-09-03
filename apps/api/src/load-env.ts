import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Side-effect-only: import this first (before any module that reads
// `process.env`) so the repo-root `.env` is applied before `config.ts`
// parses. In an ESM entry point the static `import` graph is evaluated
// before the importing module's own body runs, so a plain
// `dotenv.config()` in index.ts/worker.ts runs *after* its imports - this
// module fixes that ordering for the whole graph.
//
// `.env` is absent in production (Railway injects real env vars); dotenv
// silently does nothing in that case.
config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
