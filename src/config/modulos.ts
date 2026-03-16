export const MAPA_MODULOS: Record<string, string> = {
  Dashboard: "dashboard",
  Vendas: "vendas_consulta",
  Orcamentos: "orcamentos",
  Clientes: "clientes",
  Consultoria: "consultoria_online",
  "Consultoria Online": "consultoria_online",

  Cadastros: "cadastros",
  Paises: "cadastros_paises",
  Subdivisoes: "cadastros_estados",
  Cidades: "cadastros_cidades",
  Destinos: "cadastros_destinos",
  Produtos: "cadastros_produtos",
  Circuitos: "circuitos",
  ProdutosLote: "cadastros_lote",
  Fornecedores: "cadastros_fornecedores",

  Relatorios: "relatorios",
  RelatorioVendas: "relatorios_vendas",
  RelatorioDestinos: "relatorios_destinos",
  RelatorioProdutos: "relatorios_produtos",
  RelatorioClientes: "relatorios_clientes",

  Parametros: "parametros",
  TipoProdutos: "parametros_tipo_produtos",
  TipoPacotes: "parametros_tipo_pacotes",
  Metas: "parametros_metas",
  RegrasComissao: "parametros_regras_comissao",
  ParametrosAvisos: "parametros_avisos",
  Avisos: "parametros_avisos",
  Equipe: "parametros_equipe",
  Escalas: "parametros_escalas",
  Cambios: "parametros_cambios",
  "Orcamentos (PDF)": "parametros_orcamentos",
  "Formas de Pagamento": "parametros_formas_pagamento",

  Admin: "admin",
  AdminDashboard: "admin_dashboard",
  AdminUsers: "admin_users",
  AdminLogs: "admin_logs",
  AdminEmpresas: "admin_empresas",
  AdminFinanceiro: "admin_financeiro",
  AdminPlanos: "admin_planos",
  AdminUserTypes: "admin_user_types",

  MasterEmpresas: "master_empresas",
  MasterUsuarios: "master_usuarios",
  MasterPermissoes: "master_permissoes",

  Operacao: "operacao",
  Agenda: "operacao_agenda",
  Todo: "operacao_todo",
  Tarefas: "operacao_todo",
  "Mural de Recados": "operacao_recados",
  "Minhas Preferências": "operacao_preferencias",
  "Documentos Viagens": "operacao_documentos_viagens",
  "Conciliação": "operacao_conciliacao",
  Campanhas: "operacao_campanhas",
  Viagens: "operacao_viagens",
  "Controle de SAC": "operacao_controle_sac",
  Comissionamento: "comissionamento",

  "Ranking de vendas": "relatorios_ranking_vendas",
  "Importar Contratos": "vendas_importar",
  Perfil: "perfil",
};

export const MODULO_ALIASES: Record<string, string> = Object.keys(MAPA_MODULOS).reduce(
  (acc, key) => {
    acc[key.toLowerCase()] = MAPA_MODULOS[key];
    return acc;
  },
  {} as Record<string, string>,
);

export const ROTAS_MODULOS: Record<string, string> = {
  "/dashboard/logs": "Admin",
  "/dashboard/admin": "Admin",
  "/dashboard/permissoes": "Admin",
  "/dashboard/master": "Dashboard",
  "/admin/permissoes": "Admin",
  "/admin/empresas": "AdminEmpresas",
  "/admin/usuarios": "AdminUsers",
  "/admin/tipos-usuario": "AdminUserTypes",
  "/admin/financeiro": "AdminFinanceiro",
  "/admin/planos": "AdminPlanos",
  "/master/empresas": "MasterEmpresas",
  "/master/usuarios": "MasterUsuarios",
  "/master/permissoes": "MasterPermissoes",
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/vendas": "Vendas",
  "/orcamentos": "Vendas",
  "/clientes": "Clientes",
  "/cadastros/produtos": "Produtos",
  "/cadastros/circuitos": "Circuitos",
  "/cadastros/lote": "ProdutosLote",
  "/cadastros": "Cadastros",
  "/relatorios": "Relatorios",
  "/relatorios/vendas": "RelatorioVendas",
  "/relatorios/vendas-por-destino": "RelatorioDestinos",
  "/relatorios/vendas-por-produto": "RelatorioProdutos",
  "/relatorios/vendas-por-cliente": "RelatorioClientes",
  "/relatorios/ranking-vendas": "Ranking de vendas",
  "/parametros": "Parametros",
  "/parametros/tipo-pacotes": "TipoPacotes",
  "/parametros/equipe": "Equipe",
  "/parametros/escalas": "Escalas",
  "/parametros/cambios": "Cambios",
  "/parametros/avisos": "Avisos",
  "/parametros/orcamentos": "Orcamentos (PDF)",
  "/parametros/formas-pagamento": "Formas de Pagamento",
  "/admin": "Admin",
  "/documentacao": "Admin",
  "/consultoria-online": "Consultoria Online",
  "/operacao/agenda": "Agenda",
  "/operacao/todo": "Tarefas",
  "/operacao/recados": "Mural de Recados",
  "/operacao/minhas-preferencias": "Minhas Preferências",
  "/operacao/documentos-viagens": "Documentos Viagens",
  "/operacao/conciliacao": "Conciliação",
  "/operacao/campanhas": "Campanhas",
  "/chat": "Mural de Recados",
  "/operacao/controle-sac": "Controle de SAC",
  "/vendas/importar": "Importar Contratos",
  "/perfil": "Perfil",
  "/perfil/personalizar": "Perfil",
  "/perfil/escala": "Perfil",
};

const MODULO_PREFERENCIAS: Record<string, string> = {
  consultoria_online: "Consultoria Online",
  operacao_todo: "Tarefas",
  parametros_avisos: "Avisos",
};

export const MODULO_HERANCA: Record<string, string[]> = {
  // Observação: itens de menu/telas devem exigir permissão explícita do módulo.
  // Evitamos herdar de "Parametros"/"Relatorios" para não conceder acesso indireto.
  Agenda: ["Operacao"],
  Todo: ["Operacao"],
  Tarefas: ["Operacao"],
  "Mural de Recados": ["Operacao"],
  "Minhas Preferências": ["Operacao"],
  "Documentos Viagens": ["Operacao"],
  "Controle de SAC": ["Operacao"],
  Campanhas: ["Operacao"],
  ParametrosAvisos: ["Parametros"],
  Avisos: ["Parametros"],
  "Importar Contratos": ["Vendas"],
};

const MODULO_REVERSE: Record<string, string> = Object.entries(MAPA_MODULOS).reduce(
  (acc, [label, key]) => {
    acc[String(key)] = label;
    return acc;
  },
  {} as Record<string, string>,
);

export function normalizeModuloLabel(modulo: string): string {
  return MODULO_REVERSE[modulo] || modulo;
}

export function listarModulosComHeranca(modulo: string): string[] {
  const inicio = normalizeModuloLabel(modulo);
  const result: string[] = [];
  const visitado = new Set<string>();

  const visitar = (atual: string) => {
    if (!atual || visitado.has(atual)) return;
    visitado.add(atual);
    result.push(atual);
    const pais = MODULO_HERANCA[atual] || [];
    pais.forEach(visitar);
  };

  visitar(inicio);
  return result;
}

export const MODULOS_ADMIN_PERMISSOES: string[] = (() => {
  const seen = new Map<string, string>();
  const list: string[] = [];

  const addLabel = (label: string) => {
    const key = MAPA_MODULOS[label] || label;
    const normalizedKey = String(key).toLowerCase();
    const preferred = MODULO_PREFERENCIAS[normalizedKey];

    if (seen.has(normalizedKey)) {
      if (preferred && label === preferred) {
        const idx = list.indexOf(seen.get(normalizedKey) || "");
        if (idx >= 0) list[idx] = label;
        seen.set(normalizedKey, label);
      }
      return;
    }

    list.push(label);
    seen.set(normalizedKey, label);
  };

  Object.keys(MAPA_MODULOS).forEach(addLabel);
  Object.values(ROTAS_MODULOS).forEach(addLabel);

  return list;
})();

export const MODULOS_MASTER_PERMISSOES: string[] = MODULOS_ADMIN_PERMISSOES.filter(
  (label) => {
    const key = String(MAPA_MODULOS[label] || label).toLowerCase();
    if (key === "admin" || key.startsWith("admin_")) return false;
    if (key === "master_permissoes") return true;
    if (key === "master" || key.startsWith("master_")) return false;
    return true;
  },
);

export type ModuloSecaoPermissoes = {
  id: string;
  titulo: string;
  modulos: string[];
  includes?: string[];
};

export type ModuloSecaoPermissoesResolved = {
  id: string;
  titulo: string;
  modulos: string[];
  applyModulos: string[];
  includes: string[];
};

// Seções usadas nos editores de permissões (Admin/Master).
// Observação: "Básica" inclui todos os módulos da seção "Trial" + os extras listados.
export const SECOES_PERMISSOES: ModuloSecaoPermissoes[] = [
  {
    id: "trial",
    titulo: "Trial",
    modulos: [
      "Dashboard",
      "Vendas",
      "Orcamentos",
      "Clientes",
      "Circuitos",
      "Comissionamento",
      "Importar Contratos",
      "Operacao",
      "Aniversariantes",
    ],
  },
  {
    id: "basica",
    titulo: "Básica",
    includes: ["trial"],
    modulos: [
      "Consultoria Online",
      "Viagens",
      "Tarefas",
      "Agenda",
      "Mural de Recados",
      "Campanhas",
      "Perfil",
      "Minhas Preferências",
      "Documentos Viagens",
    ],
  },
  {
    id: "relatorios",
    titulo: "Relatórios",
    modulos: ["Relatorios", "RelatorioVendas", "RelatorioDestinos", "RelatorioProdutos", "RelatorioClientes"],
  },
  {
    id: "gestor",
    titulo: "Gestor",
    modulos: ["Ranking de vendas", "Controle de SAC", "Conciliação", "Metas", "Equipe", "Escalas"],
  },
  {
    id: "master",
    titulo: "Master",
    modulos: ["MasterEmpresas", "MasterUsuarios", "MasterPermissoes"],
  },
  {
    id: "cadastro",
    titulo: "Cadastro",
    modulos: ["Cadastros", "Paises", "Subdivisoes", "Cidades", "Destinos", "Produtos", "ProdutosLote", "Fornecedores"],
  },
  {
    id: "parametros",
    titulo: "Parâmetros",
    modulos: [
      "Parametros",
      "TipoProdutos",
      "TipoPacotes",
      "RegrasComissao",
      "Avisos",
      "Cambios",
      "Orcamentos (PDF)",
      "Formas de Pagamento",
    ],
  },
  {
    id: "admin",
    titulo: "Admin",
    modulos: [
      "Admin",
      "AdminDashboard",
      "AdminUsers",
      "AdminLogs",
      "AdminEmpresas",
      "AdminFinanceiro",
      "AdminPlanos",
      "AdminUserTypes",
    ],
  },
];

const normalizeSecaoKey = (value: string) => value.trim().toLowerCase();

function buildBaseModuloMap(modulosBase: string[]) {
  const map = new Map<string, string>();
  modulosBase.forEach((modulo) => {
    map.set(normalizeSecaoKey(modulo), modulo);
  });
  return map;
}

function resolveSecaoApplyModulos(
  secao: ModuloSecaoPermissoes,
  defsById: Record<string, ModuloSecaoPermissoes>,
  baseMap: Map<string, string>,
  visited: Set<string>,
): string[] {
  if (!secao?.id) return [];
  if (visited.has(secao.id)) return [];
  visited.add(secao.id);

  const result: string[] = [];
  const seen = new Set<string>();
  const push = (moduloLabel: string) => {
    const resolved = baseMap.get(normalizeSecaoKey(moduloLabel));
    if (!resolved) return;
    const key = normalizeSecaoKey(resolved);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(resolved);
  };

  (secao.includes || []).forEach((includedId) => {
    const included = defsById[includedId];
    if (!included) return;
    resolveSecaoApplyModulos(included, defsById, baseMap, visited).forEach(push);
  });
  (secao.modulos || []).forEach(push);

  return result;
}

export function agruparModulosPorSecao(modulosBase: string[]): ModuloSecaoPermissoesResolved[] {
  const baseMap = buildBaseModuloMap(modulosBase);
  const defsById = SECOES_PERMISSOES.reduce(
    (acc, secao) => {
      acc[secao.id] = secao;
      return acc;
    },
    {} as Record<string, ModuloSecaoPermissoes>,
  );

  const usedKeys = new Set<string>();
  const grupos: ModuloSecaoPermissoesResolved[] = [];

  for (const secao of SECOES_PERMISSOES) {
    const modulos = (secao.modulos || [])
      .map((label) => baseMap.get(normalizeSecaoKey(label)) || null)
      .filter(Boolean) as string[];

    const applyModulos = resolveSecaoApplyModulos(secao, defsById, baseMap, new Set<string>());
    applyModulos.forEach((m) => usedKeys.add(normalizeSecaoKey(m)));

    if (!modulos.length && !applyModulos.length) continue;

    grupos.push({
      id: secao.id,
      titulo: secao.titulo,
      modulos,
      applyModulos,
      includes: secao.includes || [],
    });
  }

  const outros = (modulosBase || []).filter((modulo) => !usedKeys.has(normalizeSecaoKey(modulo)));
  if (outros.length) {
    grupos.push({
      id: "outros",
      titulo: "Outros",
      modulos: outros,
      applyModulos: outros,
      includes: [],
    });
  }

  return grupos;
}

export function descobrirModulo(pathname: string): string | null {
  if (pathname === "/") return ROTAS_MODULOS["/"] ?? null;

  const entradas = Object.keys(ROTAS_MODULOS)
    .filter((rota) => rota !== "/")
    .sort((a, b) => b.length - a.length);

  for (const rota of entradas) {
    if (pathname.startsWith(rota)) return ROTAS_MODULOS[rota];
  }
  return null;
}
