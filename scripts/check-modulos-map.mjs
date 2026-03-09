import fs from "node:fs";
import { execFileSync } from "node:child_process";

const MODULOS_PATH = "src/config/modulos.ts";

function collectMapKeys() {
  const text = fs.readFileSync(MODULOS_PATH, "utf8");
  const mapaBlock = text.split("export const MAPA_MODULOS")[1]?.split("export const MODULO_ALIASES")[0] || "";
  const keyRegex = /^\s*(?:"([^"]+)"|([A-Za-zÀ-ÿ0-9_ ]+))\s*:\s*"[a-z0-9_]+",?/gm;
  const keys = new Set();
  let match;
  while ((match = keyRegex.exec(mapaBlock))) {
    const key = String(match[1] || match[2] || "").trim();
    if (key) keys.add(key);
  }
  return keys;
}

function collectUsedLabels() {
  const output = execFileSync(
    "rg",
    ["-n", "--no-heading", "module=\\\"[^\\\"]+\\\"|can\\(\\\"[^\\\"]+\\\"", "src/pages", "src/components"],
    { encoding: "utf8" }
  );
  const labels = new Set();
  const byFile = new Map();

  output
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [file, lineno, ...rest] = line.split(":");
      const snippet = rest.join(":");
      const match =
        snippet.match(/module=\"([^\"]+)\"/) ||
        snippet.match(/can\(\"([^\"]+)\"/);
      if (!match) return;
      const label = match[1].trim();
      if (!label) return;
      labels.add(label);
      if (!byFile.has(label)) byFile.set(label, []);
      byFile.get(label).push(`${file}:${lineno}`);
    });

  return { labels, byFile };
}

function main() {
  const mapKeys = collectMapKeys();
  const { labels, byFile } = collectUsedLabels();

  const missing = [...labels].filter((label) => !mapKeys.has(label)).sort((a, b) => a.localeCompare(b));

  if (!missing.length) {
    console.log("[check:modulos] OK - todos os módulos usados estão mapeados em src/config/modulos.ts");
    return;
  }

  console.error("[check:modulos] Módulos usados no código e ausentes no MAPA_MODULOS:");
  missing.forEach((label) => {
    const refs = byFile.get(label) || [];
    console.error(`- ${label}`);
    refs.slice(0, 5).forEach((ref) => console.error(`  • ${ref}`));
  });
  process.exit(1);
}

main();
