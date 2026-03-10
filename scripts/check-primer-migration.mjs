import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".astro"]);
const RAW_BUTTON_ALLOWLIST = new Set([
  "src/components/ui/Button.astro",
]);

const checks = [
  { name: "legacy card class", regex: /\bcard-base\b/g },
  { name: "legacy icon button class", regex: /\bbtn-icon\b/g },
  { name: "legacy button className token", regex: /className\s*=\s*["'`]btn\s/g },
  { name: "legacy button class token", regex: /class\s*=\s*["'`]btn\s/g },
  { name: "legacy className starts with btn-", regex: /className\s*=\s*["'`]btn-/g },
  { name: "legacy class starts with btn-", regex: /class\s*=\s*["'`]btn-/g },
  { name: "legacy className contains btn- token", regex: /className\s*=\s*["'`][^"'`]*\sbtn-[^"'`]*/g },
  { name: "legacy class contains btn- token", regex: /class\s*=\s*["'`][^"'`]*\sbtn-[^"'`]*/g },
  { name: "legacy chained btn btn-", regex: /\bbtn\s+btn-/g },
];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

const files = walk(SRC_DIR);
const failures = [];

for (const file of files) {
  const relative = rel(file);
  const content = readFileSync(file, "utf8");

  for (const check of checks) {
    check.regex.lastIndex = 0;
    if (check.regex.test(content)) {
      failures.push(`${relative}: ${check.name}`);
    }
  }

  const hasRawButton = /<button\b/g.test(content);
  if (hasRawButton && !RAW_BUTTON_ALLOWLIST.has(relative)) {
    failures.push(`${relative}: raw <button> is not allowed`);
  }
}

if (failures.length > 0) {
  console.error("Primer migration check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Primer migration check passed.");
