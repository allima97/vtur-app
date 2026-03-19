import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const viteCacheDir = path.join(repoRoot, "node_modules", ".vite");

function findRepoDevProcessPids() {
  try {
    const output = execFileSync("ps", ["-Ao", "pid=,command="], {
      encoding: "utf8",
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (!match) return null;
        return { pid: Number(match[1]), command: match[2] };
      })
      .filter((entry) => {
        if (!entry) return false;
        if (entry.pid === process.pid) return false;
        if (!entry.command.includes(repoRoot)) return false;
        return (
          entry.command.includes("node_modules/.bin/astro dev") ||
          entry.command.includes("scripts/dev-with-env.mjs")
        );
      })
      .map((entry) => entry.pid)
      .sort((a, b) => b - a);
  } catch (error) {
    console.warn("[dev-clean] Failed to inspect running dev processes.");
    console.warn(error);
    return [];
  }
}

function killRepoDevProcesses() {
  const pids = findRepoDevProcessPids();
  if (pids.length === 0) return;

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`[dev-clean] Stopped stale dev process: ${pid}`);
    } catch (error) {
      console.warn(`[dev-clean] Failed to stop stale dev process: ${pid}`);
      console.warn(error);
    }
  }
}

killRepoDevProcesses();

try {
  fs.rmSync(viteCacheDir, { recursive: true, force: true });
  console.log(`[dev-clean] Removed Vite cache: ${viteCacheDir}`);
} catch (error) {
  console.warn(`[dev-clean] Failed to remove Vite cache: ${viteCacheDir}`);
  console.warn(error);
}
