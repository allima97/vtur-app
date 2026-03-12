import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const PAGE_DIR = path.join(ROOT, "src", "pages");
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".astro"]);
const REPORT_FLAG = "--report";
const REPORT_PATH_ARG = "--report-path=";

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

function parseArgs(argv) {
  const options = {
    writeReport: false,
    reportPath: path.join(ROOT, "docs", "PRIME_SAKAI_FULL_AUDIT.md"),
  };

  for (const arg of argv) {
    if (arg === REPORT_FLAG) {
      options.writeReport = true;
      continue;
    }
    if (arg.startsWith(REPORT_PATH_ARG)) {
      options.writeReport = true;
      options.reportPath = path.resolve(ROOT, arg.slice(REPORT_PATH_ARG.length));
    }
  }

  return options;
}

function topBy(list, key, limit = 20) {
  return list
    .filter((item) => item[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.file.localeCompare(b.file))
    .slice(0, limit);
}

function renderTopSection(title, list, key) {
  if (list.length === 0) return `### ${title}\n\nNenhuma ocorrência.\n`;
  const rows = list.map((item) => `- ${item.file}: ${item[key]}`).join("\n");
  return `### ${title}\n\n${rows}\n`;
}

const sourceFiles = walk(SRC_DIR);
const pageFiles = walk(PAGE_DIR);
const uiFiles = Array.from(new Set([...sourceFiles, ...pageFiles]));
const options = parseArgs(process.argv.slice(2));

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
const fileStats = [];

for (const file of uiFiles) {
  const relative = rel(file);
  const content = readFileSync(file, "utf8");

  const filePrimerImports = countMatches(content, /@primer\/react|@primer\/primitives|@primer\/octicons-react/g);
  const fileLegacyCompatImports = countMatches(content, /legacyCompat/g);
  const fileFormInput = countMatches(content, /class(Name)?\s*=\s*["'`][^"'`]*form-input/g);
  const fileFormSelect = countMatches(content, /class(Name)?\s*=\s*["'`][^"'`]*form-select/g);
  const fileTableDefault = countMatches(content, /table-default/g);
  const fileBtnClass = countMatches(
    content,
    /class(Name)?\s*=\s*["'`](?:btn\b|[^"'`]*\sbtn\b)[^"'`]*["'`]/g
  );
  const fileRawInput = countMatches(content, /<input\b/g);
  const fileRawSelect = countMatches(content, /<select\b/g);
  const fileRawTextarea = countMatches(content, /<textarea\b/g);
  const fileRawTable = countMatches(content, /<table\b/g);
  const fileRawButton = countMatches(content, /<button\b/g);
  const fileEmojiOutsideAllowlist = !EMOJI_ALLOWLIST.includes(relative)
    ? countMatches(content, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)
    : 0;

  primerImports += filePrimerImports;
  legacyCompatImports += fileLegacyCompatImports;
  formInputUsages += fileFormInput;
  formSelectUsages += fileFormSelect;
  tableDefaultUsages += fileTableDefault;
  btnClassUsages += fileBtnClass;
  rawInputUsages += fileRawInput;
  rawSelectUsages += fileRawSelect;
  rawTextareaUsages += fileRawTextarea;
  rawTableUsages += fileRawTable;
  rawButtonUsages += fileRawButton;
  emojiOutsideAllowlist += fileEmojiOutsideAllowlist;

  fileStats.push({
    file: relative,
    primerImports: filePrimerImports,
    legacyCompatImports: fileLegacyCompatImports,
    formInput: fileFormInput,
    formSelect: fileFormSelect,
    tableDefault: fileTableDefault,
    btnClass: fileBtnClass,
    rawInput: fileRawInput,
    rawSelect: fileRawSelect,
    rawTextarea: fileRawTextarea,
    rawTable: fileRawTable,
    rawButton: fileRawButton,
    emojiOutsideAllowlist: fileEmojiOutsideAllowlist,
  });
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

if (options.writeReport) {
  const generatedAt = new Date().toISOString();
  const reportLines = [
    "# Prime/Sakai Full Audit",
    "",
    `Gerado em: ${generatedAt}`,
    "",
    "## Resumo",
    "",
    `- primer imports no src: ${primerImports}`,
    `- emojis fora da allowlist: ${emojiOutsideAllowlist}`,
    `- imports legacyCompat: ${legacyCompatImports}`,
    `- form-input: ${formInputUsages}`,
    `- form-select: ${formSelectUsages}`,
    `- table-default: ${tableDefaultUsages}`,
    `- classes btn*: ${btnClassUsages}`,
    `- raw <input>: ${rawInputUsages}`,
    `- raw <select>: ${rawSelectUsages}`,
    `- raw <textarea>: ${rawTextareaUsages}`,
    `- raw <table>: ${rawTableUsages}`,
    `- raw <button>: ${rawButtonUsages}`,
    "",
    "## Bloqueadores",
    "",
    `- Bloqueador @primer/*: ${primerImports === 0 ? "OK" : "PENDENTE"}`,
    `- Bloqueador emojis fora da allowlist: ${emojiOutsideAllowlist === 0 ? "OK" : "PENDENTE"}`,
    "",
    "## Detalhamento Por Arquivo (Top 20)",
    "",
    renderTopSection("legacyCompat", topBy(fileStats, "legacyCompatImports"), "legacyCompatImports"),
    renderTopSection("form-input", topBy(fileStats, "formInput"), "formInput"),
    renderTopSection("form-select", topBy(fileStats, "formSelect"), "formSelect"),
    renderTopSection("table-default", topBy(fileStats, "tableDefault"), "tableDefault"),
    renderTopSection("btn class", topBy(fileStats, "btnClass"), "btnClass"),
    renderTopSection("raw <input>", topBy(fileStats, "rawInput"), "rawInput"),
    renderTopSection("raw <select>", topBy(fileStats, "rawSelect"), "rawSelect"),
    renderTopSection("raw <textarea>", topBy(fileStats, "rawTextarea"), "rawTextarea"),
    renderTopSection("raw <table>", topBy(fileStats, "rawTable"), "rawTable"),
    renderTopSection("raw <button>", topBy(fileStats, "rawButton"), "rawButton"),
  ];
  writeFileSync(options.reportPath, reportLines.join("\n"), "utf8");
  console.log(`[audit:prime-sakai] relatório salvo em: ${path.relative(ROOT, options.reportPath)}`);
}

console.log("[audit:prime-sakai] OK");
