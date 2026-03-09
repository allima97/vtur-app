import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const viteCacheDir = path.join(repoRoot, "node_modules", ".vite");

try {
  fs.rmSync(viteCacheDir, { recursive: true, force: true });
  console.log(`[dev-clean] Removed Vite cache: ${viteCacheDir}`);
} catch (error) {
  console.warn(`[dev-clean] Failed to remove Vite cache: ${viteCacheDir}`);
  console.warn(error);
}

