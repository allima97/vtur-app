import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOTS = ["src/components", "src/pages"];
const OUTPUT_PATH = "docs/TABELAS_PADRONIZACAO_CHECKLIST.md";
const FILE_EXTENSIONS = new Set([".astro", ".tsx", ".ts", ".jsx", ".js"]);

function walkFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (FILE_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function detectModule(filePath) {
  const value = filePath.toLowerCase();

  if (
    value.includes("/admin/") ||
    value.includes("adminisland") ||
    value.includes("adminpermissoes") ||
    value.includes("permissoesadmin") ||
    value.includes("usuariosadmin") ||
    value.includes("planosadmin") ||
    value.includes("avisosadmin") ||
    value.includes("adminusertypes") ||
    value.includes("masterpermissoes") ||
    value.includes("masterusuarios") ||
    value.includes("masterempresas")
  ) {
    return "Admin";
  }

  if (
    value.includes("relatorio") ||
    value.includes("/relatorios/") ||
    value.includes("rankingvendas")
  ) {
    return "Relatorios";
  }

  if (
    value.includes("vendas") ||
    value.includes("/vendas/") ||
    value.includes("comission") ||
    value.includes("fechamentocomissao") ||
    value.includes("metasvendedor")
  ) {
    return "Vendas";
  }

  if (
    value.includes("clientes") ||
    value.includes("fornecedores") ||
    value.includes("circuitos") ||
    value.includes("cidades") ||
    value.includes("estados") ||
    value.includes("paises") ||
    value.includes("produtos") ||
    value.includes("tipopacotes") ||
    value.includes("tipoprodutos") ||
    value.includes("destinos") ||
    value.includes("formaspagamento")
  ) {
    return "Cadastros";
  }

  return "Outros";
}

function classifyFile(filePath, source) {
  const dataTableCount = countMatches(source, /<DataTable\b/g);
  const nativeTableCount = countMatches(source, /<table\b/g);
  const hasTable = dataTableCount > 0 || nativeTableCount > 0;

  if (!hasTable) return null;

  const hasAppCardComponent = /<AppCard\b/.test(source);
  const hasLegacyAppCardClass = /class(?:Name)?=["'`][^"'`]*\bvtur-app-card\b[^"'`]*["'`]/.test(source);
  const hasLegacySplitClass = /\bvtur-card-table-split\b|\bvtur-app-card-has-table\b|\bvtur-app-card-has-datatable\b/.test(
    source
  );

  let compliant = true;
  let mode = "";

  if (filePath === "src/components/ui/DataTable.tsx") {
    mode = "Componente base da grade (DataTable)";
  } else if (hasAppCardComponent) {
    mode = "Padrao global automatico (AppCard com separacao por tabela)";
  } else if (hasLegacyAppCardClass && hasLegacySplitClass) {
    mode = "Padrao legado com classe de separacao";
  } else if (hasLegacyAppCardClass) {
    compliant = false;
    mode = "REVISAR: card legado com tabela sem separacao";
  } else {
    mode = "Tabela sem card agrupador extra";
  }

  return {
    filePath,
    dataTableCount,
    nativeTableCount,
    compliant,
    mode,
    module: detectModule(filePath),
  };
}

const allFiles = ROOTS.flatMap((root) => walkFiles(root)).sort((a, b) => a.localeCompare(b));
const reportItems = [];

for (const filePath of allFiles) {
  const source = readFileSync(filePath, "utf8");
  const item = classifyFile(filePath, source);
  if (item) reportItems.push(item);
}

const totals = reportItems.reduce(
  (acc, item) => {
    acc.files += 1;
    acc.dataTable += item.dataTableCount;
    acc.nativeTable += item.nativeTableCount;
    if (item.compliant) acc.compliant += 1;
    else acc.pending += 1;
    return acc;
  },
  { files: 0, dataTable: 0, nativeTable: 0, compliant: 0, pending: 0 }
);

const moduleOrder = ["Cadastros", "Vendas", "Relatorios", "Admin", "Outros"];
const moduleTotals = reportItems.reduce((acc, item) => {
  if (!acc[item.module]) {
    acc[item.module] = { files: 0, compliant: 0, pending: 0 };
  }
  acc[item.module].files += 1;
  if (item.compliant) acc[item.module].compliant += 1;
  else acc[item.module].pending += 1;
  return acc;
}, {});

const moduleSummaryLines = moduleOrder
  .filter((moduleName) => moduleTotals[moduleName])
  .map((moduleName) => {
    const item = moduleTotals[moduleName];
    return `- ${moduleName}: ${item.compliant}/${item.files} conformes (pendentes: ${item.pending})`;
  });

const generatedAt = new Date().toISOString();
const checklistLines = reportItems.map((item) => {
  const mark = item.compliant ? "x" : " ";
  return `- [${mark}] \`${item.filePath}\` - [${item.module}] ${item.mode} (DataTable: ${item.dataTableCount}, table: ${item.nativeTableCount})`;
});

const output = [
  "# Checklist de Padronizacao de Tabelas",
  "",
  `Gerado em: ${generatedAt}`,
  "",
  "## Resumo",
  `- Arquivos com tabelas: ${totals.files}`,
  `- Ocorrencias DataTable: ${totals.dataTable}`,
  `- Ocorrencias table nativa: ${totals.nativeTable}`,
  `- Arquivos conformes: ${totals.compliant}`,
  `- Arquivos pendentes: ${totals.pending}`,
  "",
  "## Pente-fino visual por modulo",
  ...moduleSummaryLines,
  "",
  "Microajustes aplicados no padrao visual de tabelas:",
  "- Cabecalho da secao de tabela com espaco vertical padronizado.",
  "- Titulo/subtitulo da secao de tabela com tipografia e line-height uniformes.",
  "- Box da tabela com borda, raio e sombra padronizados para tabelas nativas.",
  "- Box DataTable com raio e sombra alinhados ao mesmo padrao.",
  "",
  "## Checklist",
  ...checklistLines,
  "",
  "## Regra aplicada",
  "- Tabelas em `AppCard` usam separacao automatica de cabecalho e grade por classes `vtur-app-card-has-table`/`vtur-app-card-has-datatable`.",
  "- Tabelas em cards legados (Astro sem `AppCard`) devem usar `vtur-card-table-split`.",
  "",
].join("\n");

writeFileSync(OUTPUT_PATH, output, "utf8");

const relativeOutput = relative(process.cwd(), OUTPUT_PATH) || OUTPUT_PATH;
console.log(`Checklist gerado em ${relativeOutput}`);

if (totals.pending > 0) {
  console.error(`Foram encontrados ${totals.pending} arquivo(s) pendente(s) de padronizacao.`);
  process.exit(2);
}
