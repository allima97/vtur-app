#!/usr/bin/env node
/**
 * Build script that ensures environment variables are available from wrangler.toml
 * This is needed for CI/CD environments (like Netlify) where .env files aren't available
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Parse TOML (simple parser for our specific use case)
function parseTOML(content) {
  const vars = {};
  const lines = content.split("\n");
  let inVarsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if we're entering the [vars] section
    if (trimmed === "[vars]") {
      inVarsSection = true;
      continue;
    }

    // Stop if we hit another section
    if (trimmed.startsWith("[") && inVarsSection) {
      break;
    }

    // Parse variable lines in [vars] section
    if (inVarsSection && trimmed && !trimmed.startsWith("#")) {
      const match = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"/);
      if (match) {
        vars[match[1]] = match[2];
      }
    }
  }

  return vars;
}

// Load environment variables
function setupEnvironment() {
  const envPath = path.resolve(projectRoot, ".env");
  const wranglerPath = path.resolve(projectRoot, "wrangler.toml");

  let envVars = {};

  // Try loading from .env first (local development)
  if (fs.existsSync(envPath)) {
    console.log("[build-with-env] Loading variables from .env");
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...rest] = trimmed.split("=");
        let value = rest.join("=").trim();
        // Remove quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        envVars[key.trim()] = value;
      }
    });
  } else if (fs.existsSync(wranglerPath)) {
    // Fallback to wrangler.toml for CI/CD environments
    console.log("[build-with-env] .env not found, loading from wrangler.toml");
    const wranglerContent = fs.readFileSync(wranglerPath, "utf8");
    envVars = parseTOML(wranglerContent);
  }

  // Required variables for build-time
  const requiredVars = ["PUBLIC_SUPABASE_URL", "PUBLIC_SUPABASE_ANON_KEY"];

  // Check for missing variables
  const missing = requiredVars.filter(
    (key) => !process.env[key] && !envVars[key]
  );

  if (missing.length > 0) {
    console.error(
      `[build-with-env] ERROR: Missing environment variables: ${missing.join(", ")}`
    );
    console.error(`[build-with-env] Please set these in .env or wrangler.toml`);
    process.exit(1);
  }

  // Set environment variables for the build process
  Object.entries(envVars).forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });

  console.log(
    `[build-with-env] Environment variables set: ${requiredVars.join(", ")}`
  );
}

// Run the build
try {
  setupEnvironment();
  console.log("[build-with-env] Running: npm run build");
  execSync("npm run build", {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  console.log("[build-with-env] Build completed successfully");
} catch (error) {
  console.error("[build-with-env] Build failed");
  process.exit(1);
}
