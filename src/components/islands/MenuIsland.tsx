import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavList } from "../ui/primer/legacyCompat";
import { logoutUsuario } from "../../lib/logout";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { MAPA_MODULOS, listarModulosComHeranca } from "../../config/modulos";
import {
  getPermissaoFromCache,
  readPermissoesCache,
  subscribePermissoes,
  type Permissao,
  type PermissoesCache,
} from "../../lib/permissoesCache";
import { setCurrentScreen } from "../../lib/netMetrics";
import {
  MENU_PREFS_UPDATED_EVENT,
  getEffectiveItemSection,
  getEffectiveSectionOrder,
  isMenuItemHidden,
  menuItemStyle,
  readMenuPrefs,
  writeMenuPrefs,
  type MenuPrefsV1,
} from "../../lib/menuPrefs";
import IslandErrorBoundary from "../ui/IslandErrorBoundary";
import AppButton from "../ui/primer/AppButton";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";


const FornecedoresIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="14" cy="8" r="4.2" />
    <path d="M9 18c0-1.5 1.7-3 5-3s5 1.5 5 3" />
    <path d="M8 25c1.5-3 6-4 8-4s6 1 7 4" />
    <rect x="11.5" y="19" width="6" height="4" rx="1" />
    <path d="M21.5 8v16" />
    <path d="M21.5 8l6 3-6 3" />
  </svg>
);

function renderMenuIcon(icon: React.ReactNode, extraClassName = ""): React.ReactNode {
  if (typeof icon !== "string") return icon;
  const iconClass = icon.trim();
  if (!iconClass.startsWith("pi ")) return icon;
  return <i className={`${iconClass} ${extraClassName}`.trim()} aria-hidden="true" />;
}

function labelToTooltipText(label: React.ReactNode): string {
  if (label === null || label === undefined || typeof label === "boolean") return "";
  if (typeof label === "string" || typeof label === "number") return String(label).trim();
  if (Array.isArray(label)) {
    return label
      .map((chunk) => labelToTooltipText(chunk))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (!React.isValidElement(label)) return "";

  const className =
    typeof label.props?.className === "string" ? label.props.className : "";
  if (/\bmenu-badge\b/.test(className)) return "";

  return labelToTooltipText(label.props?.children);
}

type MenuIslandProps = {
  activePage?: string;
  initialCache?: PermissoesCache | null;
};

export default function MenuIsland(props: MenuIslandProps) {
  return (
    <IslandErrorBoundary name="MenuIsland">
      <MenuIslandInner {...props} />
    </IslandErrorBoundary>
  );
}

function MenuIslandInner({ activePage, initialCache }: MenuIslandProps) {
  const MENU_PREFS_ENABLED = import.meta.env.PUBLIC_MENU_PREFS !== "0";
  const DESKTOP_BREAKPOINT_QUERY = "(min-width: 1025px)";
  const COMPACT_DESKTOP_QUERY = "(max-width: 1366px)";
  const SIDEBAR_COLLAPSED_STORAGE_KEY = "vtur_sidebar_collapsed";
  const envMinutes = Number(import.meta.env.PUBLIC_AUTO_LOGOUT_MINUTES || "");
  const DEFAULT_LOGOUT_MINUTES =
    Number.isFinite(envMinutes) && envMinutes > 0 ? envMinutes : 15;
  const { userId, isSystemAdmin, can, canDb, ready, userType } = usePermissoesStore();
  const [cachedPerms, setCachedPerms] = useState<PermissoesCache | null>(() => initialCache ?? null);
  const [, setSaindo] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [consultoriaBadge, setConsultoriaBadge] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [menuPrefs, setMenuPrefs] = useState<MenuPrefsV1>(() =>
    MENU_PREFS_ENABLED ? readMenuPrefs(null) : { v: 1, hidden: [], order: {} }
  );
  const logoutTimeoutRef = useRef<number | null>(null);
  const warningTimeoutRef = useRef<number | null>(null);
  const AUTO_LOGOUT_MS = DEFAULT_LOGOUT_MINUTES * 60 * 1000;
  const WARNING_LEAD_TIME_MS = 60 * 1000;
  const SESSION_EXTENSION_MS = 15 * 60 * 1000;

  const cacheUserId = cachedPerms?.userId ?? null;
  const cacheUserType = cachedPerms?.userType ?? "";
  const menuUserType = ready ? userType : cacheUserType;
  const isSidebarCollapsed = isDesktopViewport && desktopCollapsed;
  const menuIsMaster = /MASTER/i.test(menuUserType || "");
  const menuIsVendedor = /VENDEDOR/i.test(menuUserType || "");
  const menuIsGestor = /GESTOR/i.test(menuUserType || "");

  const permLevel = (p?: Permissao | null): number => {
    switch (p) {
      case "admin":
        return 5;
      case "delete":
        return 4;
      case "edit":
        return 3;
      case "create":
        return 2;
      case "view":
        return 1;
      default:
        return 0;
    }
  };

  const canFromCache = (modulo: string, min: Permissao = "view") => {
    if (!cacheUserId) return false;
    const labels = listarModulosComHeranca(modulo);
    return labels.some((label) => {
      const modDb = MAPA_MODULOS[label] || label;
      const perm =
        getPermissaoFromCache(modDb, cacheUserId, cachedPerms)?.permissao ?? "none";
      if (permLevel(perm) >= permLevel(min)) return true;
      if (String(modDb).toLowerCase() !== String(label).toLowerCase()) {
        const permLabel =
          getPermissaoFromCache(label, cacheUserId, cachedPerms)?.permissao ?? "none";
        return permLevel(permLabel) >= permLevel(min);
      }
      return false;
    });
  };

  const canFromCacheExact = (modulo: string, min: Permissao = "view") => {
    if (!cacheUserId) return false;
    const modDb = MAPA_MODULOS[modulo] || modulo;
    const perm = getPermissaoFromCache(modDb, cacheUserId, cachedPerms)?.permissao ?? "none";
    if (permLevel(perm) >= permLevel(min)) return true;
    if (String(modDb).toLowerCase() !== String(modulo).toLowerCase()) {
      const permLabel =
        getPermissaoFromCache(modulo, cacheUserId, cachedPerms)?.permissao ?? "none";
      return permLevel(permLabel) >= permLevel(min);
    }
    return false;
  };

  const canMenu = ready ? can : canFromCache;
  const canMenuExact = ready
    ? (modulo: string, min: Permissao = "view") => {
        if (menuIsSystemAdmin) return true;
        const modDb = MAPA_MODULOS[modulo] || modulo;
        if (canDb(modDb, min)) return true;
        if (String(modDb).toLowerCase() !== String(modulo).toLowerCase()) {
          return canDb(modulo, min);
        }
        return false;
      }
    : canFromCacheExact;
  const menuUserId = ready ? userId : cacheUserId;
  const menuIsSystemAdmin = ready
    ? isSystemAdmin
    : Boolean(cachedPerms?.isSystemAdmin);
  const canParametrosTipoProdutos = canMenuExact("TipoProdutos");
  const canParametrosTipoPacotes = canMenuExact("TipoPacotes");
  const canParametrosMetas = canMenuExact("Metas");
  const canParametrosEquipe = canMenuExact("Equipe");
  const canParametrosEscalas = canMenuExact("Escalas");
  const canParametrosSistema = canMenuExact("Parametros");
  const canParametrosCambios = canMenuExact("Cambios");
  const canParametrosAvisos = canMenuExact("Avisos") || canMenuExact("ParametrosAvisos");
  const canParametrosOrcamentosPdf = canMenuExact("Orcamentos (PDF)");
  const canParametrosFormasPagamento = canMenuExact("Formas de Pagamento");
  const canParametrosRegrasComissao = canMenuExact("RegrasComissao");

  const canFinanceiroComissionamento = canMenuExact("Comissionamento");
  const canFinanceiroFormasPagamento = canParametrosFormasPagamento;
  const canFinanceiroRegrasComissao = canParametrosRegrasComissao;
  const canFinanceiroConciliacao =
    (menuIsGestor || menuIsMaster || menuIsSystemAdmin) && canMenuExact("Conciliação");
  const canFinanceiroSection =
    canFinanceiroComissionamento ||
    canFinanceiroFormasPagamento ||
    canFinanceiroRegrasComissao ||
    canFinanceiroConciliacao;
  const canParametrosSection =
    canParametrosTipoProdutos ||
    canParametrosTipoPacotes ||
    canParametrosMetas ||
    canParametrosEquipe ||
    canParametrosEscalas ||
    canParametrosSistema ||
    canParametrosAvisos ||
    canParametrosCambios ||
    canParametrosOrcamentosPdf;

  const canRelatoriosVendas = canMenuExact("RelatorioVendas") || canMenuExact("Relatorios");
  const canRelatoriosDestinos = canMenuExact("RelatorioDestinos") || canMenuExact("Relatorios");
  const canRelatoriosProdutos = canMenuExact("RelatorioProdutos") || canMenuExact("Relatorios");
  const canRelatoriosClientes = canMenuExact("RelatorioClientes") || canMenuExact("Relatorios");
  const canRelatoriosRanking = canMenuExact("Ranking de vendas");
  const canOperacaoCampanhas = canMenuExact("Campanhas") || canMenuExact("Operacao");
  const canRelatoriosSection =
    canRelatoriosVendas ||
    canRelatoriosDestinos ||
    canRelatoriosProdutos ||
    canRelatoriosClientes ||
    canRelatoriosRanking;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!menuUserId) return;
    if (!MENU_PREFS_ENABLED) {
      setMenuPrefs({ v: 1, hidden: [], order: {} });
      return;
    }
    // Local primeiro (instantâneo)
    setMenuPrefs(readMenuPrefs(menuUserId));

    // Depois tenta servidor (cross-device)
    (async () => {
      try {
        const resp = await fetch("/api/v1/menu/prefs", {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!resp.ok) return;
        const payload = (await resp.json().catch(() => null)) as any;
        const next = (payload as any)?.prefs as unknown;
        if (!next) return;
        setMenuPrefs(next as MenuPrefsV1);
        writeMenuPrefs(menuUserId, next as MenuPrefsV1);
      } catch {
        // mantém localStorage
      }
    })();
  }, [menuUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!menuUserId) return;
    if (!MENU_PREFS_ENABLED) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail?.userId && String(detail.userId) !== String(menuUserId)) return;
      setMenuPrefs(readMenuPrefs(menuUserId));
    };

    window.addEventListener(MENU_PREFS_UPDATED_EVENT, handler as EventListener);
    return () => window.removeEventListener(MENU_PREFS_UPDATED_EVENT, handler as EventListener);
  }, [menuUserId, MENU_PREFS_ENABLED]);

  const liStyle = (sectionKey: string, itemKey: string, defaultIndex: number, locked = false) =>
    MENU_PREFS_ENABLED
      ? menuItemStyle({ prefs: menuPrefs, sectionKey, itemKey, defaultIndex, locked })
      : undefined;

  const sectionTitle = (section: string) => {
    switch (section) {
      case "informativos":
        return "Informativos";
      case "operacao":
        return "Operação";
      case "financeiro":
        return "Financeiro";
      case "cadastros":
        return "Cadastros";
      case "gestao":
        return "Gestão";
      case "relatorios":
        return "Relatórios";
      case "parametros":
        return "Parâmetros";
      case "documentacao":
        return "Documentação";
      case "admin":
        return "Administração";
      default:
        return section;
    }
  };

  type MenuEntry = {
    key: string;
    section: string;
    href: string;
    active: string;
    icon: React.ReactNode;
    label: React.ReactNode;
    canShow: boolean;
    locked?: boolean;
  };

  const buildMenuEntries = (): MenuEntry[] => {
    if (menuIsSystemAdmin) {
      return [
        {
          key: "admin-dashboard",
          section: "admin",
          href: "/dashboard/admin",
          active: "admin-dashboard",
          icon: "pi pi-compass",
          label: "Dashboard",
          canShow: true,
        },
        {
          key: "admin-planos",
          section: "admin",
          href: "/admin/planos",
          active: "admin-planos",
          icon: "pi pi-credit-card",
          label: "Planos",
          canShow: true,
        },
        {
          key: "admin-financeiro",
          section: "admin",
          href: "/admin/financeiro",
          active: "admin-financeiro",
          icon: "pi pi-dollar",
          label: "Financeiro",
          canShow: true,
        },
        {
          key: "admin-empresas",
          section: "admin",
          href: "/admin/empresas",
          active: "admin-empresas",
          icon: "pi pi-building",
          label: "Empresas",
          canShow: true,
        },
        {
          key: "admin-usuarios",
          section: "admin",
          href: "/admin/usuarios",
          active: "admin-usuarios",
          icon: "pi pi-user",
          label: "Usuários",
          canShow: true,
        },
        {
          key: "admin-tipos-usuario",
          section: "admin",
          href: "/admin/tipos-usuario",
          active: "admin-tipos-usuario",
          icon: "pi pi-th-large",
          label: "Tipos de usuário",
          canShow: true,
        },
        {
          key: "admin-avisos",
          section: "admin",
          href: "/admin/avisos",
          active: "admin-avisos",
          icon: "pi pi-megaphone",
          label: "Avisos",
          canShow: true,
        },
        {
          key: "admin-email",
          section: "admin",
          href: "/admin/email",
          active: "admin-email",
          icon: "pi pi-envelope",
          label: "E-mail (Envio)",
          canShow: true,
        },
        {
          key: "admin-permissoes",
          section: "admin",
          href: "/admin/permissoes",
          active: "admin-permissoes",
          icon: "pi pi-cog",
          label: "Permissões",
          canShow: true,
        },
        {
          key: "admin-parametros-importacao",
          section: "admin",
          href: "/admin/parametros-importacao",
          active: "admin-parametros-importacao",
          icon: "pi pi-th-large",
          label: "Parâmetros importação",
          canShow: true,
        },
        {
          key: "admin-logs",
          section: "admin",
          href: "/dashboard/logs",
          active: "admin-logs",
          icon: "pi pi-file",
          label: "Logs",
          canShow: true,
        },
        {
          key: "documentacao",
          section: "admin",
          href: "/documentacao",
          active: "documentacao",
          icon: "pi pi-book",
          label: "Documentação",
          canShow: true,
        },
      ];
    }

    const dashboardHref = menuIsMaster
      ? "/dashboard/master"
      : menuIsGestor
      ? "/dashboard/gestor"
      : "/";

    const entries: MenuEntry[] = [];

    // Informativos
    entries.push({
      key: "dashboard",
      section: "informativos",
      href: dashboardHref,
      active: "dashboard",
      icon: "pi pi-chart-bar",
      label: "Dashboard",
      canShow: canMenuExact("Dashboard"),
    });
    entries.push({
      key: "operacao_todo",
      section: "informativos",
      href: "/operacao/todo",
      active: "operacao_todo",
      icon: "pi pi-check-circle",
      label: "Tarefas",
      canShow: canMenuExact("Tarefas"),
    });
    entries.push({
      key: "operacao_preferencias",
      section: "informativos",
      href: "/operacao/minhas-preferencias",
      active: "operacao_preferencias",
      icon: "pi pi-star",
      label: "Minhas Preferências",
      canShow: canMenuExact("Minhas Preferências"),
    });
    entries.push({
      key: "operacao_documentos_viagens",
      section: "informativos",
      href: "/operacao/documentos-viagens",
      active: "operacao_documentos_viagens",
      icon: "pi pi-folder",
      label: "Documentos Viagens",
      canShow: canMenuExact("Documentos Viagens"),
    });
    entries.push({
      key: "operacao_campanhas",
      section: "informativos",
      href: "/operacao/campanhas",
      active: "operacao_campanhas",
      icon: "pi pi-megaphone",
      label: "Campanhas",
      canShow: canOperacaoCampanhas,
    });
    entries.push({
      key: "perfil-escala",
      section: "informativos",
      href: "/perfil/escala",
      active: "perfil-escala",
      icon: "pi pi-clock",
      label: "Minha Escala",
      canShow: menuIsVendedor,
    });

    // Operação
    entries.push({
      key: "vendas",
      section: "operacao",
      href: "/vendas/consulta",
      active: "vendas",
      icon: "pi pi-money-bill",
      label: "Vendas",
      canShow: canMenuExact("Vendas"),
    });
    entries.push({
      key: "orcamentos",
      section: "operacao",
      href: "/orcamentos/consulta",
      active: "orcamentos",
      icon: "pi pi-briefcase",
      label: "Orçamentos",
      canShow: canMenuExact("Orcamentos"),
    });
    entries.push({
      key: "consultoria",
      section: "operacao",
      href: "/consultoria-online",
      active: "consultoria",
      icon: "pi pi-comments",
      label: (
        <span className="sidebar-link-label">
          Consultoria
          {consultoriaBadge > 0 && (
            <span className="menu-badge">{formatBadge(consultoriaBadge)}</span>
          )}
        </span>
      ),
      canShow: canMenuExact("Consultoria Online"),
    });
    entries.push({
      key: "operacao_viagens",
      section: "operacao",
      href: "/operacao/viagens",
      active: "operacao_viagens",
      icon: "pi pi-send",
      label: "Viagens",
      canShow: canMenuExact("Viagens"),
    });
    entries.push({
      key: "operacao_sac",
      section: "operacao",
      href: "/operacao/controle-sac",
      active: "operacao_sac",
      icon: "pi pi-headphones",
      label: "Controle de SAC",
      canShow: canMenuExact("Controle de SAC"),
    });

    // Financeiro
    entries.push({
      key: "comissionamento",
      section: "financeiro",
      href: "/operacao/comissionamento",
      active: "comissionamento",
      icon: "pi pi-dollar",
      label: "Comissionamento",
      canShow: canMenuExact("Comissionamento"),
    });
    entries.push({
      key: "parametros-formas-pagamento",
      section: "financeiro",
      href: "/parametros/formas-pagamento",
      active: "parametros-formas-pagamento",
      icon: "pi pi-credit-card",
      label: "Formas de Pagamento",
      canShow: canMenuExact("Formas de Pagamento"),
    });
    entries.push({
      key: "regras-comissao",
      section: "financeiro",
      href: "/parametros/regras-comissao",
      active: "regras-comissao",
      icon: "pi pi-dollar",
      label: "Regras de Comissão",
      canShow: canMenuExact("RegrasComissao"),
    });
    entries.push({
      key: "operacao_conciliacao",
      section: "financeiro",
      href: "/operacao/conciliacao",
      active: "operacao_conciliacao",
      icon: "pi pi-calculator",
      label: "Conciliação",
      canShow: (menuIsGestor || menuIsMaster || menuIsSystemAdmin) && canMenuExact("Conciliação"),
    });

    // Cadastros
    entries.push({
      key: "clientes",
      section: "cadastros",
      href: "/clientes/carteira",
      active: "clientes",
      icon: "pi pi-users",
      label: "Clientes",
      canShow: canMenuExact("Clientes"),
    });
    cadastrosMenu.forEach((item) => {
      entries.push({
        key: item.active,
        section: "cadastros",
        href: item.href,
        active: item.active,
        icon: item.icon,
        label: item.label,
        canShow: canMenuExact(item.name),
      });
    });

    // Gestão (Master)
    if (canMenuExact("MasterPermissoes") || menuIsMaster) {
      entries.push({
        key: "master-empresas",
        section: "gestao",
        href: "/master/empresas",
        active: "master-empresas",
        icon: "pi pi-building",
        label: "Empresas",
        canShow: menuIsMaster && canMenuExact("MasterEmpresas"),
      });
      entries.push({
        key: "master-usuarios",
        section: "gestao",
        href: "/master/usuarios",
        active: "master-usuarios",
        icon: "pi pi-users",
        label: "Usuários",
        canShow: menuIsMaster && canMenuExact("MasterUsuarios"),
      });
      entries.push({
        key: "master-permissoes",
        section: "gestao",
        href: "/master/permissoes",
        active: "master-permissoes",
        icon: "pi pi-lock",
        label: "Permissões",
        canShow: canMenuExact("MasterPermissoes"),
      });
    }

    // Relatórios
    entries.push({
      key: "relatorios-ranking-vendas",
      section: "relatorios",
      href: "/relatorios/ranking-vendas",
      active: "relatorios-ranking-vendas",
      icon: "pi pi-trophy",
      label: "Ranking de vendas",
      canShow: canMenuExact("Ranking de vendas"),
    });
    entries.push({
      key: "relatorios-vendas",
      section: "relatorios",
      href: "/relatorios/vendas",
      active: "relatorios-vendas",
      icon: "pi pi-chart-line",
      label: "Vendas (detalhado)",
      canShow: canMenuExact("RelatorioVendas") || canMenuExact("Relatorios"),
    });
    entries.push({
      key: "relatorios-vendas-destino",
      section: "relatorios",
      href: "/relatorios/vendas-por-destino",
      active: "relatorios-vendas-destino",
      icon: "pi pi-map-marker",
      label: "Vendas por destino",
      canShow: canMenuExact("RelatorioDestinos") || canMenuExact("Relatorios"),
    });
    entries.push({
      key: "relatorios-vendas-produto",
      section: "relatorios",
      href: "/relatorios/vendas-por-produto",
      active: "relatorios-vendas-produto",
      icon: "pi pi-ticket",
      label: "Vendas por produto",
      canShow: canMenuExact("RelatorioProdutos") || canMenuExact("Relatorios"),
    });
    entries.push({
      key: "relatorios-vendas-cliente",
      section: "relatorios",
      href: "/relatorios/vendas-por-cliente",
      active: "relatorios-vendas-cliente",
      icon: "pi pi-address-book",
      label: "Vendas por cliente",
      canShow: canMenuExact("RelatorioClientes") || canMenuExact("Relatorios"),
    });

    // Parâmetros
    entries.push({
      key: "parametros-tipo-produtos",
      section: "parametros",
      href: "/parametros/tipo-produtos",
      active: "parametros-tipo-produtos",
      icon: "pi pi-tag",
      label: "Tipo de Produtos",
      canShow: canMenuExact("TipoProdutos"),
    });
    entries.push({
      key: "parametros-tipo-pacotes",
      section: "parametros",
      href: "/parametros/tipo-pacotes",
      active: "parametros-tipo-pacotes",
      icon: "pi pi-box",
      label: "Tipo de Pacotes",
      canShow: canMenuExact("TipoPacotes"),
    });
    entries.push({
      key: "parametros-metas",
      section: "parametros",
      href: "/parametros/metas",
      active: "parametros-metas",
      icon: "pi pi-bullseye",
      label: "Metas",
      canShow: canMenuExact("Metas"),
    });
    entries.push({
      key: "parametros-equipe",
      section: "parametros",
      href: "/parametros/equipe",
      active: "parametros-equipe",
      icon: "pi pi-users",
      label: "Equipe",
      canShow: canMenuExact("Equipe"),
    });
    entries.push({
      key: "parametros-escalas",
      section: "parametros",
      href: "/parametros/escalas",
      active: "parametros-escalas",
      icon: "pi pi-calendar",
      label: "Escalas",
      canShow: canMenuExact("Escalas"),
    });
    entries.push({
      key: "parametros",
      section: "parametros",
      href: "/parametros",
      active: "parametros",
      icon: "pi pi-cog",
      label: "Parâmetros do Sistema",
      canShow: canMenuExact("Parametros"),
    });
    entries.push({
      key: "parametros-avisos",
      section: "parametros",
      href: "/parametros/avisos",
      active: "parametros-avisos",
      icon: "pi pi-share-alt",
      label: "CRM",
      canShow: canMenuExact("Avisos") || canMenuExact("ParametrosAvisos") || canMenuExact("Parametros"),
    });
    entries.push({
      key: "parametros-cambios",
      section: "parametros",
      href: "/parametros/cambios",
      active: "parametros-cambios",
      icon: "pi pi-sync",
      label: "Câmbios",
      canShow: canMenuExact("Cambios"),
    });
    entries.push({
      key: "parametros-orcamentos",
      section: "parametros",
      href: "/parametros/orcamentos",
      active: "parametros-orcamentos",
      icon: "pi pi-file",
      label: "Orçamentos (PDF)",
      canShow: canMenuExact("Orcamentos (PDF)"),
    });

    // Documentação
    entries.push({
      key: "documentacao",
      section: "documentacao",
      href: "/documentacao",
      active: "documentacao",
      icon: "pi pi-book",
      label: "Documentação",
      canShow: Boolean(menuUserId) && canMenuExact("Admin"),
    });

    return entries;
  };

  const renderMenuSections = () => {
    const desired = menuIsSystemAdmin
      ? ["admin"]
      : [
          "informativos",
          "operacao",
          "financeiro",
          "cadastros",
          "gestao",
          "relatorios",
          "parametros",
          "documentacao",
          "admin",
        ];

    const all = buildMenuEntries().filter((e) => e.canShow);

    const visible = all
      .map((e) => {
        const section = MENU_PREFS_ENABLED
          ? getEffectiveItemSection(menuPrefs, e.key, e.section)
          : e.section;
        return { ...e, section };
      })
      .filter((e) => {
        if (!MENU_PREFS_ENABLED) return true;
        if (e.locked) return true;
        return !isMenuItemHidden(menuPrefs, e.key);
      });

    const map = new Map<string, MenuEntry[]>();
    visible.forEach((e) => {
      if (!map.has(e.section)) map.set(e.section, []);
      map.get(e.section)!.push(e);
    });

    const sections = Array.from(map.keys()).sort((a, b) => {
      const ia = desired.indexOf(a);
      const ib = desired.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return sections.map((sectionKey) => {
      const sectionItems = map.get(sectionKey) || [];
      const keys = sectionItems.map((i) => i.key);
      const orderedKeys = MENU_PREFS_ENABLED
        ? getEffectiveSectionOrder(menuPrefs, sectionKey, keys)
        : keys;
      const byKey = new Map(sectionItems.map((i) => [i.key, i] as const));
      const ordered = orderedKeys.map((k) => byKey.get(k)).filter(Boolean) as MenuEntry[];

      if (ordered.length === 0) return null;

      return (
        <div key={sectionKey}>
          <div className="sidebar-section-title">{sectionTitle(sectionKey)}</div>
          <NavList className="vtur-sidebar-nav" aria-label={sectionTitle(sectionKey)}>
            {ordered.map((entry) => {
              const tooltip = labelToTooltipText(entry.label) || entry.key;
              return (
                <NavList.Item
                  key={entry.key}
                  href={entry.href}
                  style={liStyle(sectionKey, entry.key, ordered.indexOf(entry), Boolean(entry.locked))}
                  className="vtur-sidebar-nav-item"
                  aria-current={activePage === entry.active ? "page" : undefined}
                  aria-label={tooltip}
                  title={tooltip}
                  onClick={handleNavClick}
                >
                  <NavList.LeadingVisual>{renderMenuIcon(entry.icon)}</NavList.LeadingVisual>
                  <span className="sidebar-item-label">{entry.label}</span>
                </NavList.Item>
              );
            })}
          </NavList>
        </div>
      );
    });
  };

  useEffect(() => {
    const label = activePage || (typeof window !== "undefined" ? window.location.pathname : "") || "unknown";
    setCurrentScreen(label);
  }, [activePage]);

  useEffect(() => {
    if (!initialCache) {
      const localCache = readPermissoesCache();
      if (localCache) {
        setCachedPerms(localCache);
      }
    }
  }, [initialCache]);

  useEffect(() => {
    return subscribePermissoes((cache) => {
      setCachedPerms(cache);
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobileOpen(false);
    };

    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const desktopMq = window.matchMedia(DESKTOP_BREAKPOINT_QUERY);
    const compactDesktopMq = window.matchMedia(COMPACT_DESKTOP_QUERY);

    const syncDesktopMode = () => {
      const isDesktop = desktopMq.matches;
      setIsDesktopViewport(isDesktop);
      if (!isDesktop) {
        setDesktopCollapsed(false);
        return;
      }
      try {
        const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
        if (stored === "1") {
          setDesktopCollapsed(true);
        } else if (stored === "0") {
          setDesktopCollapsed(false);
        } else {
          setDesktopCollapsed(compactDesktopMq.matches);
        }
      } catch {
        setDesktopCollapsed(compactDesktopMq.matches);
      }
    };

    syncDesktopMode();

    if (desktopMq.addEventListener) desktopMq.addEventListener("change", syncDesktopMode);
    else desktopMq.addListener(syncDesktopMode);
    if (compactDesktopMq.addEventListener) compactDesktopMq.addEventListener("change", syncDesktopMode);
    else compactDesktopMq.addListener(syncDesktopMode);

    return () => {
      if (desktopMq.removeEventListener) desktopMq.removeEventListener("change", syncDesktopMode);
      else desktopMq.removeListener(syncDesktopMode);
      if (compactDesktopMq.removeEventListener) compactDesktopMq.removeEventListener("change", syncDesktopMode);
      else compactDesktopMq.removeListener(syncDesktopMode);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("sidebar-collapsed", isSidebarCollapsed);
    return () => document.body.classList.remove("sidebar-collapsed");
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const toggleDesktopCollapsed = () => {
    if (typeof window === "undefined" || !isDesktopViewport) return;
    setDesktopCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const executarLogout = useCallback(
    async (mostrarFeedback = true) => {
      if (mostrarFeedback) setSaindo(true);
      setShowWarning(false);
      closeMobile();
      try {
        await logoutUsuario();
      } finally {
        if (mostrarFeedback) setSaindo(false);
      }
    },
    [closeMobile, setSaindo]
  );

  const handleNavClick = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 1024) closeMobile();
  };

  type MobileNavItem = {
    key: string;
    label: string;
    href?: string;
    onPress?: () => void;
    icon: React.ReactNode;
    active?: string;
  };

  const clearTimers = useCallback(() => {
    if (logoutTimeoutRef.current) {
      window.clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      window.clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  const scheduleTimers = useCallback(
    (durationMs = AUTO_LOGOUT_MS) => {
      setShowWarning(false);
      clearTimers();
      logoutTimeoutRef.current = window.setTimeout(() => executarLogout(false), durationMs);
      const warningDelay = Math.max(durationMs - WARNING_LEAD_TIME_MS, 0);
      warningTimeoutRef.current = window.setTimeout(() => setShowWarning(true), warningDelay);
    },
    [AUTO_LOGOUT_MS, WARNING_LEAD_TIME_MS, clearTimers, executarLogout]
  );

  const handleExtendSession = () => {
    scheduleTimers(SESSION_EXTENSION_MS);
  };

  const handleActivity = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    scheduleTimers();
  }, [scheduleTimers]);

  useEffect(() => {
    scheduleTimers();
    const eventosAtividade = ["mousedown", "keydown", "scroll", "touchstart"];
    eventosAtividade.forEach((eventName) => window.addEventListener(eventName, handleActivity));

    return () => {
      eventosAtividade.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      clearTimers();
      setShowWarning(false);
    };
  }, [handleActivity, scheduleTimers, clearTimers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOpenMobileMenu = () => setMobileOpen(true);
    window.addEventListener("sgtur:open-mobile-menu", handleOpenMobileMenu as EventListener);
    return () => window.removeEventListener("sgtur:open-mobile-menu", handleOpenMobileMenu as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("consultoria_lembretes_badge");
    const initial = Number(raw || 0);
    if (Number.isFinite(initial)) setConsultoriaBadge(initial);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const count = Number(detail.count || 0);
      if (Number.isFinite(count)) setConsultoriaBadge(count);
    };
    window.addEventListener("consultoria-lembretes-badge", handler as EventListener);
    return () => window.removeEventListener("consultoria-lembretes-badge", handler as EventListener);
  }, []);

  const formatBadge = (count: number) => (count > 99 ? "99+" : String(count));
  const cadastrosMenu = [
    { name: "Produtos", href: "/cadastros/produtos", active: "produtos", icon: "pi pi-ticket", label: "Produtos" },
    { name: "Circuitos", href: "/cadastros/circuitos", active: "circuitos", icon: "pi pi-compass", label: "Circuitos" },
    { name: "Paises", href: "/cadastros/paises", active: "paises", icon: "pi pi-globe", label: "Países" },
    {
      name: "Subdivisoes",
      href: "/cadastros/estados",
      active: "subdivisoes",
      icon: "pi pi-map",
      label: "Estado/Província",
    },
    { name: "Cidades", href: "/cadastros/cidades", active: "cidades", icon: "pi pi-building", label: "Cidades" },
    { name: "ProdutosLote", href: "/cadastros/lote", active: "lote", icon: "pi pi-box", label: "Lote" },
    {
      name: "Fornecedores",
      href: "/cadastros/fornecedores",
      active: "fornecedores",
      icon: <FornecedoresIcon />,
      label: "Fornecedores",
    },
  ];
  const sidebarId = "app-sidebar";

  const mobileNavItems: MobileNavItem[] = [];

  if (menuIsSystemAdmin) {
    mobileNavItems.push({
      key: "admin-dashboard",
      label: "Dashboard",
      href: "/dashboard/admin",
      icon: "pi pi-compass",
      active: "admin-dashboard",
    });
  } else {
    if (canMenuExact("Dashboard")) {
      const dashboardHref = menuIsMaster
        ? "/dashboard/master"
        : menuIsGestor
        ? "/dashboard/gestor"
        : "/";
      mobileNavItems.push({
        key: "dashboard",
        label: "Dashboard",
        href: dashboardHref,
        icon: "pi pi-chart-bar",
        active: "dashboard",
      });
    }
    if (canMenuExact("Tarefas")) {
      mobileNavItems.push({
        key: "tarefas",
        label: "Tarefas",
        href: "/operacao/todo",
        icon: "pi pi-check-circle",
        active: "operacao_todo",
      });
    }
    if (canMenuExact("Vendas")) {
      mobileNavItems.push({
        key: "vendas",
        label: "Vendas",
        href: "/vendas/consulta",
        icon: "pi pi-file",
        active: "vendas",
      });
    }
    if (canMenuExact("Clientes")) {
      mobileNavItems.push({
        key: "clientes",
        label: "Clientes",
        href: "/clientes/carteira",
        icon: "pi pi-users",
        active: "clientes",
      });
    }
  }

  mobileNavItems.push({
    key: "menu",
    label: "Menu",
    icon: "pi pi-bars",
    onPress: () => setMobileOpen(true),
  });

  return (
    <AppPrimerProvider>
      <div className={`sidebar-overlay ${mobileOpen ? "visible" : ""}`} onClick={closeMobile} />

      <nav className="mobile-bottom-nav" aria-label="Atalhos principais">
        {mobileNavItems.map((item) => {
          const isActive = activePage === item.active;
          const className = `mobile-bottom-nav-item ${isActive ? "active" : ""}`;

          if (item.href) {
            return (
              <a
                key={item.key}
                className={className}
                href={item.href}
                onClick={handleNavClick}
              >
                <span className="mobile-bottom-nav-icon">
                  {renderMenuIcon(item.icon)}
                  {item.key === "consultoria" && consultoriaBadge > 0 && (
                    <span className="mobile-badge">{formatBadge(consultoriaBadge)}</span>
                  )}
                </span>
                <span className="mobile-bottom-nav-label">{item.label}</span>
              </a>
            );
          }

          return (
            <AppButton
              key={item.key}
              type="button"
              variant="ghost"
              className={className}
              onClick={() => {
                item.onPress?.();
              }}
            >
              <span className="mobile-bottom-nav-icon">{renderMenuIcon(item.icon)}</span>
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </AppButton>
          );
        })}
      </nav>

      <aside
        id={sidebarId}
        className={`app-sidebar ${mobileOpen ? "open" : ""} ${isSidebarCollapsed ? "desktop-collapsed" : ""}`}
      >
        <div className="sidebar-logo" aria-label="VTUR - CRM para Franquias CVC">
          <img className="sidebar-logo-image" src="/brand/vtur-symbol.svg" alt="vtur" />
          <div className="sidebar-logo-copy sidebar-logo-copy-inline">
            <span className="sidebar-logo-wordmark">VTUR</span>
            <span className="sidebar-logo-tagline">CRM para Franquias CVC</span>
          </div>
        </div>
        <AppButton
          type="button"
          variant="ghost"
          className="sidebar-desktop-toggle"
          onClick={toggleDesktopCollapsed}
          aria-label={isSidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          title={isSidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        >
          <span className="sidebar-desktop-toggle-icon" aria-hidden="true">
            <i className={isSidebarCollapsed ? "pi pi-angle-right" : "pi pi-angle-left"} />
          </span>
          <span className="sidebar-desktop-toggle-label">
            {isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          </span>
        </AppButton>

        {renderMenuSections()}
      </aside>
      {showWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <div
            className="vtur-warning-panel"
            style={{
              borderRadius: 12,
              padding: "24px 32px",
              boxShadow: "0 30px 60px rgba(15,23,42,0.35)",
              maxWidth: 420,
              width: "100%",
            }}
          >
            <h3 className="vtur-warning-text" style={{ marginTop: 0, marginBottom: 12 }}>Sessão quase expirando</h3>
            <p style={{ marginTop: 0, marginBottom: 20 }}>
              Sua sessão será encerrada automaticamente em 1 minuto por inatividade. Clique em
              “Continuar Logado” para ganhar mais 15 minutos sem perder o progresso.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <AppButton type="button" variant="primary" onClick={handleExtendSession}>
                Continuar Logado
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => executarLogout(true)}
              >
                Sair agora
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </AppPrimerProvider>
  );
}
