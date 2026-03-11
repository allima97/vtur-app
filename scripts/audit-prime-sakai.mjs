import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const PAGE_DIR = path.join(ROOT, "src", "pages");
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".astro"]);

const EMOJI_ALLOWLIST = [
  "src/components/islands/MenuIsland.tsx",
  "src/components/islands/DashboardAdminIsland.tsx",
  "src/components/islands/PerformanceDashboardIsland.tsx",
];

function walk(dir) {
  const files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(full))) files.push(full);
  }
  return files;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function countMatches(content, regex) {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

const sourceFiles = walk(SRC_DIR);
const pageFiles = walk(PAGE_DIR);
const uiFiles = Array.from(new Set([...sourceFiles, ...pageFiles]));

let primerImports = 0;
let emojiOutsideAllowlist = 0;
let legacyCompatImports = 0;
let formInputUsages = 0;
let formSelectUsages = 0;
let tableDefaultUsages = 0;
let btnClassUsages = 0;
let rawInputUsages = 0;
let rawSelectUsages = 0;
let rawTextareaUsages = 0;
let rawTableUsages = 0;
let rawButtonUsages = 0;

for (const file of uiFiles) {
  const relative = rel(file);
  const content = readFileSync(file, "utf8");

  primerImports += countMatches(content, /@primer\/react|@primer\/primitives|@primer\/octicons-react/g);
  legacyCompatImports += countMatches(content, /legacyCompat/g);

  formInputUsages += countMatches(content, /class(Name)?\s*=\s*["'`][^"'`]*form-input/g);
  formSelectUsages += countMatches(content, /class(Name)?\s*=\s*["'`][^"'`]*form-select/g);
  tableDefaultUsages += countMatches(content, /table-default/g);
  btnClassUsages += countMatches(content, /class(Name)?\s*=\s*["'`][^"'`]*\bbtn\b/g);

  rawInputUsages += countMatches(content, /<input\b/g);
  rawSelectUsages += countMatches(content, /<select\b/g);
  rawTextareaUsages += countMatches(content, /<textarea\b/g);
  rawTableUsages += countMatches(content, /<table\b/g);
  rawButtonUsages += countMatches(content, /<button\b/g);

  if (!EMOJI_ALLOWLIST.includes(relative)) {
    emojiOutsideAllowlist += countMatches(content, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  }
}

console.log("[audit:prime-sakai] resumo");
console.log(`- primer imports no src: ${primerImports}`);
console.log(`- emojis fora da allowlist: ${emojiOutsideAllowlist}`);
console.log(`- imports legacyCompat: ${legacyCompatImports}`);
console.log(`- form-input: ${formInputUsages}`);
console.log(`- form-select: ${formSelectUsages}`);
console.log(`- table-default: ${tableDefaultUsages}`);
console.log(`- classes btn*: ${btnClassUsages}`);
console.log(`- raw <input>: ${rawInputUsages}`);
console.log(`- raw <select>: ${rawSelectUsages}`);
console.log(`- raw <textarea>: ${rawTextareaUsages}`);
console.log(`- raw <table>: ${rawTableUsages}`);
console.log(`- raw <button>: ${rawButtonUsages}`);

if (primerImports > 0 || emojiOutsideAllowlist > 0) {
  console.error("[audit:prime-sakai] falhou: existem bloqueios de migração.");
  process.exit(1);
}

console.log("[audit:prime-sakai] OK");
