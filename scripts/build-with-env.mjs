#!/usr/bin/env node
/**
 * Build script that ensures required public env vars are available for `astro build`.
 * Priority (lowest -> highest):
 *   1) wrangler.toml [vars]
 *   2) .env
 *   3) .env.local
 *   4) existing process.env
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const REQUIRED_VARS = ["PUBLIC_SUPABASE_URL", "PUBLIC_SUPABASE_ANON_KEY"];

function parseEnvContent(content) {
  const vars = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separator = trimmed.indexOf("=");
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) vars[key] = value;
  });

  return vars;
}

function parseWranglerVars(content) {
  const vars = {};
  const lines = content.split(/\r?\n/);
  let inVarsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "[vars]") {
      inVarsSection = true;
      continue;
    }

    if (inVarsSection && trimmed.startsWith("[")) {
      break;
    }

    if (!inVarsSection || !trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
    if (match) vars[match[1]] = match[2];
  }

  return vars;
}

function readIfExists(filePath, parser) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return parser(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[build-with-env] Falha ao ler ${path.basename(filePath)}: ${error.message}`);
    return {};
  }
}

function setupBuildEnvironment() {
  const wranglerPath = path.resolve(projectRoot, "wrangler.toml");
  const envPath = path.resolve(projectRoot, ".env");
  const envLocalPath = path.resolve(projectRoot, ".env.local");

  const wranglerVars = readIfExists(wranglerPath, parseWranglerVars);
  const envVars = readIfExists(envPath, parseEnvContent);
  const envLocalVars = readIfExists(envLocalPath, parseEnvContent);

  const mergedVars = {
    ...wranglerVars,
    ...envVars,
    ...envLocalVars,
  };

  Object.entries(mergedVars).forEach(([key, value]) => {
    if (!process.env[key]) process.env[key] = value;
  });

  const missing = REQUIRED_VARS.filter((key) => {
    const value = process.env[key];
    return !value || !String(value).trim();
  });

  if (missing.length > 0) {
    console.error(`[build-with-env] Variáveis obrigatórias ausentes: ${missing.join(", ")}.`);
    console.error(
      "[build-with-env] Configure em .env/.env.local ou no bloco [vars] do wrangler.toml."
    );
    process.exit(1);
  }
}

function runAstroBuild() {
  const extraArgs = process.argv.slice(2);
  const child = spawn("astro", ["build", ...extraArgs], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

setupBuildEnvironment();
runAstroBuild();
