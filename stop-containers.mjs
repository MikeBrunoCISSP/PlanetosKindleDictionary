#!/usr/bin/env node
// Stops (without removing) the local infra containers: postgres, redis,
// minio, mailpit. Data in their named volumes is preserved; `dev-up.mjs`
// or `docker compose up -d` will start the same containers again.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const composeFile = path.join(root, "infra", "docker-compose.yml");

const result = spawnSync("docker", ["compose", "-f", composeFile, "stop"], { stdio: "inherit" });
process.exit(result.status ?? 1);
