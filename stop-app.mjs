#!/usr/bin/env node
// Stops the app dev servers (vite, tsx watch, tsc --watch, the pnpm/concurrently
// wrappers around them) no matter how they were started - a plain
// `pnpm run dev`, dev-up.mjs, or a background process from an editor/agent.
// It works by matching each running process's command line against this
// repo's path plus a known dev-tool marker, rather than relying on a PID
// file, so a stale or missing PID doesn't leave orphans behind.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const markers = ["vite", "tsx watch", "tsc --watch", "tsc.js", "concurrently", "pnpm"];

function matches(commandLine) {
  if (!commandLine) return false;
  const lower = commandLine.toLowerCase();
  if (!lower.includes(root.toLowerCase())) return false;
  return markers.some((m) => lower.includes(m));
}

function killWindows() {
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Depth 3",
    ],
    { encoding: "utf8" }
  );
  if (ps.status !== 0) {
    console.error("Failed to list processes via PowerShell.");
    process.exit(1);
  }
  let entries = JSON.parse(ps.stdout || "[]");
  if (!Array.isArray(entries)) entries = [entries];

  const targets = entries.filter((e) => matches(e.CommandLine) && e.ProcessId !== process.pid);
  if (targets.length === 0) {
    console.log("No matching dev processes found.");
    return;
  }
  for (const { ProcessId } of targets) {
    const kill = spawnSync("taskkill", ["/PID", String(ProcessId), "/F"]);
    console.log(kill.status === 0 ? `Stopped PID ${ProcessId}` : `Could not stop PID ${ProcessId} (already gone?)`);
  }
}

function killPosix() {
  const ps = spawnSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" });
  if (ps.status !== 0) {
    console.error("Failed to list processes via ps.");
    process.exit(1);
  }
  const lines = ps.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  let killedAny = false;
  for (const line of lines) {
    const spaceIdx = line.indexOf(" ");
    const pid = Number(line.slice(0, spaceIdx));
    const commandLine = line.slice(spaceIdx + 1);
    if (!matches(commandLine) || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Stopped PID ${pid}`);
      killedAny = true;
    } catch {
      // Already gone.
    }
  }
  if (!killedAny) console.log("No matching dev processes found.");
}

if (process.platform === "win32") killWindows();
else killPosix();
