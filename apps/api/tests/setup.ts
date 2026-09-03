import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Belt-and-suspenders: vitest sets NODE_ENV=test itself, but pin it here so
// src/config.ts always runs in non-strict mode during the suite even if a
// runner doesn't.
process.env["NODE_ENV"] ??= "test";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../.env") });
