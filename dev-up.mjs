#!/usr/bin/env node
// Ensures the local infra containers (postgres/redis/minio/mailpit) are up
// and healthy, then runs `pnpm run dev`. Safe to run repeatedly - it detects
// containers that are already healthy and skips straight to `pnpm run dev`.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const composeFile = path.join(root, "infra", "docker-compose.yml");
const composeArgs = ["compose", "-f", composeFile];

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function checkDockerAvailable() {
  const result = run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (result.error || result.status !== 0) {
    console.error("Docker doesn't seem to be running. Start Docker Desktop and try again.");
    process.exit(1);
  }
}

function getServiceNames() {
  const result = run("docker", [...composeArgs, "config", "--services"]);
  if (result.status !== 0) {
    console.error(result.stderr || "Failed to read infra/docker-compose.yml");
    process.exit(1);
  }
  return result.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

function getStatuses() {
  const result = run("docker", [...composeArgs, "ps", "--format", "json"]);
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isReady(serviceNames, statuses) {
  return serviceNames.every((name) => {
    const entry = statuses.find((s) => s.Service === name);
    if (!entry || entry.State !== "running") return false;
    // Health is "" when a service defines no healthcheck - treat that as ready.
    return entry.Health === "" || entry.Health === "healthy";
  });
}

function describe(serviceNames, statuses) {
  return serviceNames
    .map((name) => {
      const entry = statuses.find((s) => s.Service === name);
      if (!entry) return `${name}: not started`;
      const health = entry.Health || entry.State;
      return `${name}: ${health}`;
    })
    .join(", ");
}

async function waitUntilReady(serviceNames, timeoutMs = 90_000) {
  const start = Date.now();
  for (;;) {
    const statuses = getStatuses();
    if (isReady(serviceNames, statuses)) return;
    if (Date.now() - start > timeoutMs) {
      console.error(`Timed out waiting for containers to become healthy: ${describe(serviceNames, statuses)}`);
      process.exit(1);
    }
    process.stdout.write(`Waiting for containers... (${describe(serviceNames, statuses)})\n`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

checkDockerAvailable();
const serviceNames = getServiceNames();
const initialStatuses = getStatuses();

if (isReady(serviceNames, initialStatuses)) {
  console.log("Infra containers already up and healthy.");
} else {
  console.log("Starting infra containers (postgres, redis, minio, mailpit)...");
  const up = run("docker", [...composeArgs, "up", "-d"], { stdio: "inherit" });
  if (up.status !== 0) {
    console.error("Failed to start infra containers.");
    process.exit(1);
  }
  await waitUntilReady(serviceNames);
  console.log("Infra containers are healthy.");
}

console.log("Starting app dev servers (pnpm run dev)...\n");
const child = spawn("pnpm", ["run", "dev"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code) => process.exit(code ?? 0));
