import { descobrirModulo } from "../config/modulos";
import { normalizeText } from "./normalizeText";

export type DocumentationRoleScope = "all" | "vendedor" | "gestor" | "master" | "admin";
export type DocumentationTone = "default" | "info" | "config" | "teal" | "green";

export type DocumentationSection = {
  id: string;
  slug: string;
  role_scope: DocumentationRoleScope;
  module_key: string;
  route_pattern: string | null;
  title: string;
  summary: string | null;
  content_markdown: string;
  tone: DocumentationTone;
  sort_order: number;
  is_active: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
  source?: "sections" | "legacy";
};

export type DocumentationTocItem = {
  level: number;
  title: string;
  id: string;
};

export type DocumentationModuleOption = {
  key: string;
  label: string;
  routePattern?: string;
};

const DOCUMENTATION_ROLE_LABELS: Record<DocumentationRoleScope, string> = {
  all: "Geral",
  vendedor: "Vendedor",
  gestor: "Gestor",
  master: "Master",
  admin: "Admin do Sistema",
};

const LEGACY_ROLE_LABELS: Record<string, DocumentationRoleScope> = {
  vendedor: "vendedor",
  gestor: "gestor",
  master: "master",
  "admin do sistema": "admin",
};

const ROLE_ORDER: DocumentationRoleScope[] = ["all", "vendedor", "gestor", "master", "admin"];

const KNOWN_ROUTE_MODULES: Array<{ label: string; routePattern: string }> = [
  { label: "Dashboard", routePattern: "/" },
  { label: "Dashboard", routePattern: "/dashboard" },
  { label: "Dashboard Admin", routePattern: "/dashboard/admin" },
  { label: "Logs", routePattern: "/dashboard/logs" },
  { label: "Permissões", routePattern: "/dashboard/permissoes" },
  { label: "Planos", routePattern: "/admin/planos" },
  { label: "Financeiro", routePattern: "/admin/financeiro" },
  { label: "Empresas", routePattern: "/admin/empresas" },
  { label: "Usuários", routePattern: "/admin/usuarios" },
  { label: "Tipos de usuário", routePattern: "/admin/tipos-usuario" },
  { label: "Avisos", routePattern: "/admin/avisos" },
  { label: "E-mail", routePattern: "/admin/email" },
  { label: "Permissões", routePattern: "/admin/permissoes" },
  { label: "Documentação", routePattern: "/documentacao" },
  { label: "Vendas", routePattern: "/vendas" },
  { label: "Importar Contratos", routePattern: "/vendas/importar" },
  { label: "Clientes", routePattern: "/clientes" },
  { label: "Orçamentos", routePattern: "/orcamentos" },
  { label: "Importar Orçamentos", routePattern: "/orcamentos/importar" },
  { label: "Consultoria Online", routePattern: "/consultoria-online" },
  { label: "Operação > Viagens", routePattern: "/operacao/viagens" },
  { label: "Operação > Controle SAC", routePattern: "/operacao/controle-sac" },
  { label: "Comissionamento", routePattern: "/operacao/comissionamento" },
  { label: "Agenda", routePattern: "/operacao/agenda" },
  { label: "Tarefas", routePattern: "/operacao/todo" },
  { label: "Mural de Recados", routePattern: "/operacao/recados" },
  { label: "Minhas Preferências", routePattern: "/operacao/minhas-preferencias" },
  { label: "Documentos Viagens", routePattern: "/operacao/documentos-viagens" },
  { label: "Conciliação", routePattern: "/operacao/conciliacao" },
  { label: "Campanhas", routePattern: "/operacao/campanhas" },
  { label: "Perfil", routePattern: "/perfil" },
  { label: "Importar Vendas", routePattern: "/gestor/importar-vendas" },
  { label: "Equipe", routePattern: "/parametros/equipe" },
  { label: "Metas", routePattern: "/parametros/metas" },
  { label: "Escalas", routePattern: "/parametros/escalas" },
  { label: "Câmbios", routePattern: "/parametros/cambios" },
  { label: "Orçamentos (PDF)", routePattern: "/parametros/orcamentos" },
  { label: "Formas de Pagamento", routePattern: "/parametros/formas-pagamento" },
  { label: "Regras de Comissão", routePattern: "/parametros/regras-comissao" },
  { label: "Tipo de Produtos", routePattern: "/parametros/tipo-produtos" },
  { label: "Parâmetros do Sistema", routePattern: "/parametros" },
  { label: "Cadastros", routePattern: "/cadastros" },
  { label: "Relatórios", routePattern: "/relatorios" },
  { label: "Relatórios > Vendas > Detalhado", routePattern: "/relatorios/vendas" },
  { label: "Relatórios > Vendas por Destino", routePattern: "/relatorios/vendas-por-destino" },
  { label: "Relatórios > Vendas por Produto", routePattern: "/relatorios/vendas-por-produto" },
  { label: "Relatórios > Vendas por Cliente", routePattern: "/relatorios/vendas-por-cliente" },
  { label: "Ranking de vendas", routePattern: "/relatorios/ranking-vendas" },
  { label: "Master > Empresas", routePattern: "/master/empresas" },
  { label: "Master > Usuários", routePattern: "/master/usuarios" },
  { label: "Master > Permissões", routePattern: "/master/permissoes" },
];

export const DOCUMENTATION_ROLE_OPTIONS = ROLE_ORDER.map((role) => ({
  value: role,
  label: DOCUMENTATION_ROLE_LABELS[role],
}));

export const DOCUMENTATION_TONE_OPTIONS: Array<{ value: DocumentationTone; label: string }> = [
  { value: "info", label: "Info" },
  { value: "config", label: "Config" },
  { value: "teal", label: "Teal" },
  { value: "green", label: "Green" },
  { value: "default", label: "Padrão" },
];

export function buildDocumentationAnchorId(text: string) {
  return normalizeText(text || "", { trim: true, collapseWhitespace: true })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildDocumentationModuleKey(text: string) {
  return normalizeText(text || "", { trim: true, collapseWhitespace: true })
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
}

export function suggestDocumentationModuleKey(title: string) {
  const raw = String(title || "").trim();
  const simplified = raw.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  return buildDocumentationModuleKey(simplified || raw);
}

function sortSections(a: DocumentationSection, b: DocumentationSection) {
  const roleDiff = ROLE_ORDER.indexOf(a.role_scope) - ROLE_ORDER.indexOf(b.role_scope);
  if (roleDiff !== 0) return roleDiff;
  const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
  if (orderDiff !== 0) return orderDiff;
  return String(a.title || "").localeCompare(String(b.title || ""), "pt-BR");
}

export function sortDocumentationSections(sections: DocumentationSection[]) {
  return [...(sections || [])].sort(sortSections);
}

export function getDocumentationRoleLabel(roleScope: DocumentationRoleScope) {
  return DOCUMENTATION_ROLE_LABELS[roleScope] || DOCUMENTATION_ROLE_LABELS.all;
}

export function resolveDocumentationRoleScope(userType: string, isSystemAdmin: boolean): DocumentationRoleScope {
  if (isSystemAdmin) return "admin";
  const normalized = String(userType || "").toUpperCase();
  if (normalized.includes("MASTER")) return "master";
  if (normalized.includes("GESTOR")) return "gestor";
  return "vendedor";
}

export function getKnownDocumentationModuleOptions(): DocumentationModuleOption[] {
  const map = new Map<string, DocumentationModuleOption>();

  for (const item of KNOWN_ROUTE_MODULES) {
    const key = buildDocumentationModuleKey(item.label);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      if (!existing.routePattern || item.routePattern.length > existing.routePattern.length) {
        existing.routePattern = item.routePattern;
      }
      continue;
    }
    map.set(key, { key, label: item.label, routePattern: item.routePattern });
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function resolveDocumentationModuleContext(pathname: string) {
  const cleanPath = String(pathname || "").trim();
  const known = [...KNOWN_ROUTE_MODULES].sort((a, b) => b.routePattern.length - a.routePattern.length);
  for (const item of known) {
    if (item.routePattern === "/" ? cleanPath === "/" : cleanPath.startsWith(item.routePattern)) {
      return {
        moduleKey: buildDocumentationModuleKey(item.label),
        moduleLabel: item.label,
      };
    }
  }

  const discovered = descobrirModulo(cleanPath);
  if (discovered) {
    return {
      moduleKey: buildDocumentationModuleKey(discovered),
      moduleLabel: discovered,
    };
  }

  if (!cleanPath) {
    return {
      moduleKey: null,
      moduleLabel: null,
    };
  }

  return {
    moduleKey: null,
    moduleLabel: null,
  };
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

export function escapeDocumentationRegex(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderInlineMarkdown(text: string) {
  let html = escapeHtml(text);

  html = html.replace(/\[(.*?)\]\((.*?)\)/gim, (_, label, href) => {
    return `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  });

  html = html.replace(/\*\*(.+?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/gim, "<em>$1</em>");

  return html;
}

function parseImageLine(line: string) {
  const match = line.match(/^!\[(.*?)\]\((.*?)\)$/);
  if (!match) return null;

  return {
    alt: match[1] || "Imagem",
    src: match[2] || "",
  };
}

function isBlockBoundary(line: string) {
  const trimmed = line.trim();
  return (
    !trimmed ||
    /^#{1,3}\s+/.test(trimmed) ||
    /^-\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^---+$/.test(trimmed) ||
    /^!\[(.*?)\]\((.*?)\)$/.test(trimmed)
  );
}

export function renderDocumentationMarkdownHtml(markdown: string) {
  const normalized = String(markdown || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return "<p>Documentacao indisponivel.</p>";
  }

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = String(lines[index] || "").trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      const title = trimmed.replace(/^###\s+/, "").trim();
      blocks.push(`<h3 id="${buildDocumentationAnchorId(title)}">${renderInlineMarkdown(title)}</h3>`);
      index += 1;
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      const title = trimmed.replace(/^##\s+/, "").trim();
      blocks.push(`<h2 id="${buildDocumentationAnchorId(title)}">${renderInlineMarkdown(title)}</h2>`);
      index += 1;
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      const title = trimmed.replace(/^#\s+/, "").trim();
      blocks.push(`<h1 id="${buildDocumentationAnchorId(title)}">${renderInlineMarkdown(title)}</h1>`);
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    const image = parseImageLine(trimmed);
    if (image?.src) {
      blocks.push(
        `<figure class="doc-content-figure"><img src="${escapeAttribute(image.src)}" alt="${escapeAttribute(image.alt)}" /></figure>`
      );
      index += 1;
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^-\s+/.test(String(lines[index] || "").trim())) {
        items.push(String(lines[index] || "").trim().replace(/^-\s+/, ""));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(String(lines[index] || "").trim())) {
        items.push(String(lines[index] || "").trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && !isBlockBoundary(String(lines[index] || ""))) {
      paragraphLines.push(String(lines[index] || "").trim());
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join("\n")).replace(/\n/g, "<br />")}</p>`);
  }

  return blocks.join("\n");
}

export function buildDocumentationToc(markdown: string): DocumentationTocItem[] {
  const lines = String(markdown || "").split("\n");
  const items: DocumentationTocItem[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      const title = line.replace("# ", "").trim();
      items.push({ level: 1, title, id: buildDocumentationAnchorId(title) });
      continue;
    }
    if (line.startsWith("## ")) {
      const title = line.replace("## ", "").trim();
      items.push({ level: 2, title, id: buildDocumentationAnchorId(title) });
      continue;
    }
    if (line.startsWith("### ")) {
      const title = line.replace("### ", "").trim();
      items.push({ level: 3, title, id: buildDocumentationAnchorId(title) });
    }
  }

  return items;
}

export function parseLegacyDocumentationSections(markdown: string, slug = "vtur"): DocumentationSection[] {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const sections: DocumentationSection[] = [];
  let currentRole: DocumentationRoleScope = "all";
  let currentTitle = "";
  let buffer: string[] = [];
  let introBuffer: string[] = [];
  let sawStructuredHeading = false;
  let currentOrder = 0;

  const flush = () => {
    const title = String(currentTitle || "").trim();
    const content = buffer.join("\n").trim();
    if (!title || !content) {
      currentTitle = "";
      buffer = [];
      return;
    }

    const moduleKey = suggestDocumentationModuleKey(title);
    currentOrder += 10;
    sections.push({
      id: `legacy-${currentRole}-${moduleKey}`,
      slug,
      role_scope: currentRole,
      module_key: moduleKey || `secao_${currentOrder}`,
      route_pattern: null,
      title,
      summary: null,
      content_markdown: content,
      tone: currentRole === "admin" ? "config" : "info",
      sort_order: currentOrder,
      is_active: true,
      source: "legacy",
    });
    currentTitle = "";
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const trimmed = line.trim();

    if (line.startsWith("# ")) {
      if (!sawStructuredHeading && !currentTitle) {
        continue;
      }
    }

    if (line.startsWith("## ")) {
      sawStructuredHeading = true;
      flush();
      const title = line.replace("## ", "").trim();
      const maybeRole = LEGACY_ROLE_LABELS[normalizeText(title, { trim: true, collapseWhitespace: true })];
      if (maybeRole) {
        currentRole = maybeRole;
        currentTitle = "";
        buffer = [];
        continue;
      }
      currentRole = "all";
      currentTitle = title;
      buffer = [];
      continue;
    }

    if (line.startsWith("### ")) {
      sawStructuredHeading = true;
      flush();
      currentTitle = line.replace("### ", "").trim();
      buffer = [];
      continue;
    }

    if (currentTitle) {
      buffer.push(trimmed === "" ? "" : line);
    } else if (!sawStructuredHeading) {
      introBuffer.push(trimmed === "" ? "" : line);
    }
  }

  flush();

  const introContent = introBuffer.join("\n").trim();
  if (introContent) {
    sections.unshift({
      id: "legacy-all-introducao",
      slug,
      role_scope: "all",
      module_key: "introducao",
      route_pattern: null,
      title: "Introdução",
      summary: null,
      content_markdown: introContent,
      tone: "info",
      sort_order: 0,
      is_active: true,
      source: "legacy",
    });
  }

  return sortDocumentationSections(sections);
}

export function normalizeDocumentationSectionInput(
  value: Partial<DocumentationSection>,
  index = 0,
): DocumentationSection {
  const roleScope = ROLE_ORDER.includes(value.role_scope as DocumentationRoleScope)
    ? (value.role_scope as DocumentationRoleScope)
    : "all";
  const title = String(value.title || "").trim();
  const moduleKey = buildDocumentationModuleKey(String(value.module_key || ""));
  const routePattern = String(value.route_pattern || "").trim() || null;
  const contentMarkdown = String(value.content_markdown || "").trim();
  const summary = String(value.summary || "").trim() || null;
  const tone = DOCUMENTATION_TONE_OPTIONS.some((item) => item.value === value.tone)
    ? (value.tone as DocumentationTone)
    : roleScope === "admin"
    ? "config"
    : "info";

  return {
    id: String(value.id || "").trim() || `draft-${roleScope}-${moduleKey || suggestDocumentationModuleKey(title) || index + 1}`,
    slug: String(value.slug || "vtur").trim() || "vtur",
    role_scope: roleScope,
    module_key: moduleKey || suggestDocumentationModuleKey(title),
    route_pattern: routePattern,
    title,
    summary,
    content_markdown: contentMarkdown,
    tone,
    sort_order: Number.isFinite(Number(value.sort_order)) ? Number(value.sort_order) : (index + 1) * 10,
    is_active: value.is_active !== false,
    updated_at: value.updated_at || null,
    updated_by: value.updated_by || null,
    source: value.source,
  };
}

export function buildDocumentationMarkdownFromSections(sections: DocumentationSection[]) {
  const activeSections = sortDocumentationSections(
    [...(sections || [])]
    .filter((item) => item && item.is_active !== false && item.title && item.content_markdown)
    .map((item, index) => normalizeDocumentationSectionInput(item, index))
  );

  if (activeSections.length === 0) {
    return "# Documentação do Sistema SGVTur\n\nConteúdo indisponível.\n";
  }

  const blocks: string[] = [
    "# Documentação do Sistema SGVTur",
    "",
    "Este conteúdo é atualizado dinamicamente pelo portal de documentação do sistema.",
    "",
  ];

  const globalSections = activeSections.filter((item) => item.role_scope === "all");
  for (const section of globalSections) {
    blocks.push(`## ${section.title}`);
    blocks.push("");
    if (section.summary) {
      blocks.push(section.summary);
      blocks.push("");
    }
    blocks.push(section.content_markdown.trim());
    blocks.push("");
  }

  for (const role of ROLE_ORDER.filter((item) => item !== "all")) {
    const roleSections = activeSections.filter((item) => item.role_scope === role);
    if (roleSections.length === 0) continue;
    blocks.push(`## ${getDocumentationRoleLabel(role)}`);
    blocks.push("");
    for (const section of roleSections) {
      blocks.push(`### ${section.title}`);
      blocks.push("");
      if (section.summary) {
        blocks.push(section.summary);
        blocks.push("");
      }
      blocks.push(section.content_markdown.trim());
      blocks.push("");
    }
  }

  return `${blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function findDocumentationHelpSection(
  sections: DocumentationSection[],
  params: {
    roleScope: DocumentationRoleScope;
    moduleKey: string | null;
    pathname: string;
  },
) {
  const roleScope = params.roleScope;
  const moduleKey = String(params.moduleKey || "").trim();
  const pathname = String(params.pathname || "").trim();
  const candidates = [...(sections || [])]
    .filter((section) => section && section.is_active !== false)
    .filter((section) => section.role_scope === roleScope || section.role_scope === "all");

  const byModule = candidates
    .filter((section) => section.module_key === moduleKey)
    .sort((a, b) => {
      const roleRankA = a.role_scope === roleScope ? 0 : 1;
      const roleRankB = b.role_scope === roleScope ? 0 : 1;
      if (roleRankA !== roleRankB) return roleRankA - roleRankB;
      return sortSections(a, b);
    });

  if (byModule[0]) return byModule[0];

  const byRoute = candidates
    .filter((section) => {
      const pattern = String(section.route_pattern || "").trim();
      if (!pattern || !pathname) return false;
      return pathname.startsWith(pattern);
    })
    .sort((a, b) => {
      const roleRankA = a.role_scope === roleScope ? 0 : 1;
      const roleRankB = b.role_scope === roleScope ? 0 : 1;
      if (roleRankA !== roleRankB) return roleRankA - roleRankB;
      const patternLengthDiff = String(b.route_pattern || "").length - String(a.route_pattern || "").length;
      if (patternLengthDiff !== 0) return patternLengthDiff;
      return sortSections(a, b);
    });

  return byRoute[0] || null;
}
