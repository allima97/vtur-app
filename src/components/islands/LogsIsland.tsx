import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { formatDateTimeBR } from "../../lib/format";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import { ToastStack, useToastQueue } from "../ui/Toast";

type LogEntry = {
  id: string;
  user_id: string;
  acao: string;
  modulo: string | null;
  detalhes: any;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  users?: { nome_completo: string | null } | null;
};

type FiltroRapido = "all" | "security" | "2fa" | "login";

type SummaryItem = {
  label: string;
  value: string;
};

type LogStats = {
  total: number;
  security_total: number;
  login_total: number;
  mfa_total: number;
  reset_mfa_total: number;
};

function isSecurityLog(log: LogEntry) {
  const modulo = String(log.modulo || "").toLowerCase();
  const acao = String(log.acao || "").toLowerCase();
  return (
    modulo.includes("login") ||
    modulo.includes("auth") ||
    modulo.includes("masterusuarios") ||
    acao.includes("login") ||
    acao.includes("mfa") ||
    acao.includes("2fa") ||
    acao.includes("resetou_mfa") ||
    acao.includes("senha")
  );
}

function isTwoFactorLog(log: LogEntry) {
  const modulo = String(log.modulo || "").toLowerCase();
  const acao = String(log.acao || "").toLowerCase();
  return (
    modulo.includes("auth_mfa") ||
    acao.includes("mfa") ||
    acao.includes("2fa") ||
    acao.includes("resetou_mfa")
  );
}

function isLoginLog(log: LogEntry) {
  const modulo = String(log.modulo || "").toLowerCase();
  const acao = String(log.acao || "").toLowerCase();
  return modulo === "login" || acao.includes("login");
}

function getActionLabel(acao?: string | null) {
  const value = String(acao || "").trim();
  const map: Record<string, string> = {
    tentativa_login: "Tentativa de login",
    login_falhou: "Login falhou",
    login_sucesso: "Login com sucesso",
    login_erro_interno: "Erro interno no login",
    solicitou_recuperacao_senha: "Solicitou recuperacao de senha",
    reset_link_invalido: "Link de reset invalido",
    reset_senha_falhou: "Falha ao resetar senha",
    reset_senha_sucesso: "Senha resetada",
    mfa_ativado: "2FA ativado",
    mfa_removido: "2FA removido",
    mfa_verificado: "2FA verificado",
    mfa_verificacao_falhou: "Falha na verificacao do 2FA",
    admin_resetou_mfa: "Admin resetou 2FA",
    master_resetou_mfa: "Master resetou 2FA",
  };
  return map[value] || value || "-";
}

function pushIfValue(items: SummaryItem[], label: string, value: unknown) {
  const normalized =
    typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
  if (!normalized) return;
  items.push({ label, value: normalized });
}

function buildSecuritySummary(log: LogEntry | null): SummaryItem[] {
  if (!log) return [];

  const detalhes = log.detalhes && typeof log.detalhes === "object" ? log.detalhes : {};
  const summary: SummaryItem[] = [];

  pushIfValue(summary, "Resumo", getActionLabel(log.acao));
  pushIfValue(summary, "Usuario do log", log.users?.nome_completo || log.user_id || "");
  pushIfValue(summary, "Ator", detalhes.actor_role);
  pushIfValue(summary, "ID do ator", detalhes.actor_user_id);
  pushIfValue(summary, "Empresa do ator", detalhes.actor_company_id);
  pushIfValue(summary, "Alvo", detalhes.target_email || detalhes.email);
  pushIfValue(summary, "ID do alvo", detalhes.target_user_id || detalhes.userId);
  pushIfValue(summary, "Empresa do alvo", detalhes.target_company_id);
  pushIfValue(summary, "Motivo", detalhes.motivo);
  pushIfValue(summary, "Fator", detalhes.factorId);
  if (detalhes.deleted_count !== undefined && detalhes.deleted_count !== null) {
    pushIfValue(summary, "Fatores removidos", detalhes.deleted_count);
  }
  pushIfValue(summary, "IP", log.ip);
  pushIfValue(summary, "Navegador", log.user_agent);

  return summary;
}

function escapeCsvValue(value: unknown) {
  const text =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  const normalized = text.replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${normalized}"`;
}

function buildExportRows(logs: LogEntry[]) {
  return logs.map((log) => ({
    data: formatDateTimeBR(log.created_at),
    usuario: log.users?.nome_completo || "",
    user_id: log.user_id || "",
    acao: log.acao || "",
    acao_label: getActionLabel(log.acao),
    modulo: log.modulo || "",
    ip: log.ip || "",
    user_agent: log.user_agent || "",
    detalhes: JSON.stringify(log.detalhes || {}),
  }));
}

function buildExportFilename(prefix: string, filtroRapido: FiltroRapido) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = filtroRapido === "all" ? "todos" : filtroRapido;
  return `${prefix}-${suffix}-${ts}`;
}

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return {
    dateFrom: formatInputDate(start),
    dateTo: formatInputDate(end),
  };
}

function isValidFiltroRapido(value: string): value is FiltroRapido {
  return value === "all" || value === "security" || value === "2fa" || value === "login";
}

function buildPresetRange(preset: "today" | "7d" | "30d" | "90d" | "month") {
  const end = new Date();
  const start = new Date();

  if (preset === "today") {
    return {
      dateFrom: formatInputDate(end),
      dateTo: formatInputDate(end),
    };
  }

  if (preset === "month") {
    start.setDate(1);
    return {
      dateFrom: formatInputDate(start),
      dateTo: formatInputDate(end),
    };
  }

  if (preset === "7d") start.setDate(end.getDate() - 7);
  if (preset === "30d") start.setDate(end.getDate() - 30);
  if (preset === "90d") start.setDate(end.getDate() - 90);

  return {
    dateFrom: formatInputDate(start),
    dateTo: formatInputDate(end),
  };
}

export default function LogsIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminDashboard");

  const [isAdmin, setIsAdmin] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [totalLogs, setTotalLogs] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pageInput, setPageInput] = useState("1");
  const [dateRange] = useState(getDefaultDateRange);
  const [availableModulos, setAvailableModulos] = useState<string[]>([]);
  const [availableAcoes, setAvailableAcoes] = useState<string[]>([]);
  const [stats, setStats] = useState<LogStats>({
    total: 0,
    security_total: 0,
    login_total: 0,
    mfa_total: 0,
    reset_mfa_total: 0,
  });
  const [refreshTick, setRefreshTick] = useState(0);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Filtros
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroModulo, setFiltroModulo] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("all");
  const [dateFrom, setDateFrom] = useState(dateRange.dateFrom);
  const [dateTo, setDateTo] = useState(dateRange.dateTo);
  const [exportando, setExportando] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  // Modal
  const [logSelecionado, setLogSelecionado] = useState<LogEntry | null>(null);

  // ---------------------------------------------------------------
  // VALIDAR SE É ADMIN
  // ---------------------------------------------------------------
  useEffect(() => {
    async function validar() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const { data: u } = await supabase
        .from("users")
        .select("id, user_types(name)")
        .eq("id", auth.user.id)
        .maybeSingle();

      const tipo = u?.user_types?.name?.toUpperCase() || "";
      setIsAdmin(tipo.includes("ADMIN"));
    }

    validar();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuick = String(params.get("quick_filter") || "").trim().toLowerCase();
    const initialUser = String(params.get("user_id") || "").trim();
    const initialModulo = String(params.get("modulo") || "").trim();
    const initialAcao = String(params.get("acao") || "").trim();
    const initialBusca = String(params.get("search") || "").trim();
    const initialDateFrom = String(params.get("date_from") || "").trim();
    const initialDateTo = String(params.get("date_to") || "").trim();
    const initialPage = Number(params.get("page") || "");
    const initialPageSize = Number(params.get("page_size") || "");

    if (isValidFiltroRapido(initialQuick)) setFiltroRapido(initialQuick);
    if (initialUser) setFiltroUsuario(initialUser);
    if (initialModulo) setFiltroModulo(initialModulo);
    if (initialAcao) setFiltroAcao(initialAcao);
    if (initialBusca) {
      setBusca(initialBusca);
      setBuscaAplicada(initialBusca);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(initialDateFrom)) setDateFrom(initialDateFrom);
    if (/^\d{4}-\d{2}-\d{2}$/.test(initialDateTo)) setDateTo(initialDateTo);
    if (Number.isFinite(initialPage) && initialPage > 0) setPage(Math.floor(initialPage));
    if (Number.isFinite(initialPageSize) && [50, 100, 200].includes(Math.floor(initialPageSize))) {
      setPageSize(Math.floor(initialPageSize));
    }

    setFiltersReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaAplicada(busca.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    async function loadUsuarios() {
      try {
        const { data: uData } = await supabase
          .from("users")
          .select("id, nome_completo")
          .order("nome_completo");
        setUsuarios(uData || []);
      } catch (error) {
        console.error("Erro ao carregar usuários para filtros de logs:", error);
      }
    }

    loadUsuarios();
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    const params = new URLSearchParams();
    if (filtroRapido !== "all") params.set("quick_filter", filtroRapido);
    if (filtroUsuario) params.set("user_id", filtroUsuario);
    if (filtroModulo) params.set("modulo", filtroModulo);
    if (filtroAcao) params.set("acao", filtroAcao);
    if (busca.trim()) params.set("search", busca.trim());
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 50) params.set("page_size", String(pageSize));

    const next = params.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      const url = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", url);
    }
  }, [filtersReady, filtroRapido, filtroUsuario, filtroModulo, filtroAcao, busca, dateFrom, dateTo, page, pageSize]);

  // ---------------------------------------------------------------
  // CARREGAR LOGS
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!filtersReady) return;
    setPage(1);
  }, [filtersReady, filtroUsuario, filtroModulo, filtroAcao, buscaAplicada, filtroRapido, dateFrom, dateTo, pageSize]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    if (!filtersReady || !autoRefresh) return;
    const timer = window.setInterval(() => {
      setRefreshTick((value) => value + 1);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [filtersReady, autoRefresh]);

  useEffect(() => {
    if (!filtersReady) return;
    async function load() {
      try {
        setLoading(true);
        setErro(null);
        const qs = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
          quick_filter: filtroRapido,
        });
        if (filtroUsuario) qs.set("user_id", filtroUsuario);
        if (filtroModulo) qs.set("modulo", filtroModulo);
        if (filtroAcao) qs.set("acao", filtroAcao);
        if (dateFrom) qs.set("date_from", dateFrom);
        if (dateTo) qs.set("date_to", dateTo);
        if (buscaAplicada) qs.set("search", buscaAplicada);

        const resp = await fetch(`/api/v1/admin/logs?${qs.toString()}`, {
          credentials: "include",
        });
        const raw = await resp.text();
        const payload = raw ? JSON.parse(raw) : {};
        if (!resp.ok) {
          throw new Error(payload?.error || raw || "Erro ao carregar logs.");
        }

        setLogs((payload?.items || []) as LogEntry[]);
        setTotalLogs(Number(payload?.total || 0));
        setAvailableModulos(Array.isArray(payload?.available_modulos) ? payload.available_modulos : []);
        setAvailableAcoes(Array.isArray(payload?.available_acoes) ? payload.available_acoes : []);
        setStats({
          total: Number(payload?.stats?.total || 0),
          security_total: Number(payload?.stats?.security_total || 0),
          login_total: Number(payload?.stats?.login_total || 0),
          mfa_total: Number(payload?.stats?.mfa_total || 0),
          reset_mfa_total: Number(payload?.stats?.reset_mfa_total || 0),
        });
        setUltimaAtualizacao(new Date().toISOString());
      } catch (e: any) {
        console.error(e);
        setErro("Erro ao carregar logs.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [filtersReady, page, pageSize, filtroUsuario, filtroModulo, filtroAcao, buscaAplicada, filtroRapido, dateFrom, dateTo, refreshTick]);

  // ---------------------------------------------------------------
  // FILTRAGEM
  // ---------------------------------------------------------------
  const logsFiltrados = useMemo(() => {
    return logs;
  }, [logs]);

  const modulosDisponiveis = useMemo(
    () =>
      Array.from(new Set([...(availableModulos || []), filtroModulo].filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [availableModulos, filtroModulo]
  );
  const acoesDisponiveis = useMemo(
    () =>
      Array.from(new Set([...(availableAcoes || []), filtroAcao].filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [availableAcoes, filtroAcao]
  );

  const logResumo = useMemo(() => buildSecuritySummary(logSelecionado), [logSelecionado]);
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const usuarioNomeMap = useMemo(
    () => new Map((usuarios || []).map((u: any) => [String(u.id), String(u.nome_completo || "Usuário")])),
    [usuarios]
  );
  const filtrosAtivos = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (filtroRapido !== "all") {
      const labelMap: Record<FiltroRapido, string> = {
        all: "Tudo",
        security: "Segurança",
        "2fa": "2FA",
        login: "Login",
      };
      chips.push({
        key: "quick",
        label: `Visão: ${labelMap[filtroRapido]}`,
        onClear: () => setFiltroRapido("all"),
      });
    }
    if (filtroUsuario) {
      chips.push({
        key: "user",
        label: `Usuário: ${usuarioNomeMap.get(filtroUsuario) || filtroUsuario}`,
        onClear: () => setFiltroUsuario(""),
      });
    }
    if (filtroModulo) {
      chips.push({
        key: "modulo",
        label: `Módulo: ${filtroModulo}`,
        onClear: () => setFiltroModulo(""),
      });
    }
    if (filtroAcao) {
      chips.push({
        key: "acao",
        label: `Ação: ${getActionLabel(filtroAcao)}`,
        onClear: () => setFiltroAcao(""),
      });
    }
    if (busca.trim()) {
      chips.push({
        key: "busca",
        label: `Busca: ${busca.trim()}`,
        onClear: () => {
          setBusca("");
          setBuscaAplicada("");
        },
      });
    }
    const defaults = getDefaultDateRange();
    if (dateFrom !== defaults.dateFrom || dateTo !== defaults.dateTo) {
      chips.push({
        key: "periodo",
        label: `Período: ${dateFrom || "-"} até ${dateTo || "-"}`,
        onClear: () => {
          setDateFrom(defaults.dateFrom);
          setDateTo(defaults.dateTo);
        },
      });
    }
    if (pageSize !== 50) {
      chips.push({
        key: "page_size",
        label: `Itens/página: ${pageSize}`,
        onClear: () => setPageSize(50),
      });
    }
    return chips;
  }, [filtroRapido, filtroUsuario, filtroModulo, filtroAcao, busca, dateFrom, dateTo, pageSize, usuarioNomeMap]);

  async function fetchAllFilteredLogs() {
    const allItems: LogEntry[] = [];
    let currentPage = 1;
    let totalPagesToFetch = 1;

    while (currentPage <= totalPagesToFetch) {
      const qs = new URLSearchParams({
        page: String(currentPage),
        page_size: "500",
        quick_filter: filtroRapido,
      });
      if (filtroUsuario) qs.set("user_id", filtroUsuario);
      if (filtroModulo) qs.set("modulo", filtroModulo);
      if (filtroAcao) qs.set("acao", filtroAcao);
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (buscaAplicada) qs.set("search", buscaAplicada);

      const resp = await fetch(`/api/v1/admin/logs?${qs.toString()}`, {
        credentials: "include",
      });
      const raw = await resp.text();
      const payload = raw ? JSON.parse(raw) : {};
      if (!resp.ok) {
        throw new Error(payload?.error || raw || "Erro ao exportar logs.");
      }

      allItems.push(...((payload?.items || []) as LogEntry[]));
      totalPagesToFetch = Number(payload?.total_pages || 1);
      currentPage += 1;
    }

    return allItems;
  }

  async function exportarCSV() {
    if (totalLogs === 0) {
      showToast("Não há logs para exportar.", "warning");
      return;
    }
    try {
      setExportando(true);
      const allLogs = await fetchAllFilteredLogs();
      const rows = buildExportRows(allLogs);
      const headers = Object.keys(rows[0]);
      const content = [
        headers.join(","),
        ...rows.map((row) => headers.map((header) => escapeCsvValue((row as any)[header])).join(",")),
      ].join("\n");

      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${buildExportFilename("logs-auditoria", filtroRapido)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("CSV exportado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao exportar CSV:", error);
      showToast("Não foi possível exportar CSV. Recarregue a página e tente novamente.", "error");
    } finally {
      setExportando(false);
    }
  }

  async function exportarExcel() {
    if (totalLogs === 0) {
      showToast("Não há logs para exportar.", "warning");
      return;
    }

    try {
      setExportando(true);
      const module = await import("xlsx");
      const XLSX = module.default || module;
      const allLogs = await fetchAllFilteredLogs();
      const rows = buildExportRows(allLogs);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Logs");
      XLSX.writeFile(wb, `${buildExportFilename("logs-auditoria", filtroRapido)}.xlsx`);
      showToast("Excel exportado com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao exportar Excel:", error);
      showToast("Não foi possível exportar Excel. Recarregue a página e tente novamente.", "error");
    } finally {
      setExportando(false);
    }
  }

  function limparFiltros() {
    const defaults = getDefaultDateRange();
    setFiltroUsuario("");
    setFiltroModulo("");
    setFiltroAcao("");
    setBusca("");
    setBuscaAplicada("");
    setFiltroRapido("all");
    setDateFrom(defaults.dateFrom);
    setDateTo(defaults.dateTo);
    setPage(1);
    setPageSize(50);
  }

  function aplicarPeriodoRapido(preset: "today" | "7d" | "30d" | "90d" | "month") {
    const range = buildPresetRange(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setPage(1);
  }

  function atualizarAgora() {
    setRefreshTick((value) => value + 1);
  }

  function irParaPagina(rawValue: string | number) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(page));
      return;
    }
    const nextPage = Math.min(Math.max(Math.floor(parsed), 1), totalPages);
    setPage(nextPage);
    setPageInput(String(nextPage));
  }

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer || !isAdmin)
    return (
      <AppCard tone="config" className="logs-admin-page admin-page">
        Apenas administradores podem acessar os logs.
      </AppCard>
    );

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------

  return (
    <div className="logs-admin-page admin-page">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <AppCard
        tone="config"
        title="Logs de Auditoria"
        subtitle="Todas as acoes executadas no sistema."
      />
      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 mb-3">
        <AppCard tone="config" title="Total" subtitle="Registros no recorte atual.">
          <div className="text-2xl font-semibold">{stats.total}</div>
        </AppCard>
        <AppCard tone="info" title="Segurança" subtitle="Login, senha e MFA.">
          <div className="text-2xl font-semibold">{stats.security_total}</div>
        </AppCard>
        <AppCard tone="info" title="Login" subtitle="Eventos de autenticação.">
          <div className="text-2xl font-semibold">{stats.login_total}</div>
        </AppCard>
        <AppCard tone="info" title="2FA" subtitle="Ativações, validações e MFA.">
          <div className="text-2xl font-semibold">{stats.mfa_total}</div>
        </AppCard>
        <AppCard tone="warning" title="Reset 2FA" subtitle="Resets administrativos.">
          <div className="text-2xl font-semibold">{stats.reset_mfa_total}</div>
        </AppCard>
      </div>

      <AppCard
        tone="config"
        title="Atualização"
        subtitle={ultimaAtualizacao ? `Última carga em ${formatDateTimeBR(ultimaAtualizacao)}.` : "Aguardando primeira carga."}
        className="mb-3"
        actions={
          <div className="flex gap-2 flex-wrap mobile-stack-buttons">
            <AppButton type="button" variant="secondary" onClick={atualizarAgora} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar agora"}
            </AppButton>
            <AppButton
              type="button"
              variant={autoRefresh ? "primary" : "secondary"}
              onClick={() => setAutoRefresh((value) => !value)}
            >
              {autoRefresh ? "Autoatualização 30s ativa" : "Ativar autoatualização 30s"}
            </AppButton>
          </div>
        }
      />

      {filtrosAtivos.length > 0 && (
        <AppCard tone="config" title="Filtros ativos" className="mb-3">
          <div className="flex gap-2 flex-wrap">
            {filtrosAtivos.map((chip) => (
              <AppButton
                key={chip.key}
                type="button"
                variant="secondary"
                onClick={chip.onClear}
                title="Remover filtro"
              >
                {chip.label} x
              </AppButton>
            ))}
          </div>
        </AppCard>
      )}

      {/* FILTROS */}
      <AppCard tone="config" title="Filtros">
        <div className="flex gap-2 flex-wrap mb-3 mobile-stack-buttons">
          <AppButton
            type="button"
            variant={filtroRapido === "all" ? "primary" : "secondary"}
            onClick={() => setFiltroRapido("all")}
          >
            Tudo
          </AppButton>
          <AppButton
            type="button"
            variant={filtroRapido === "security" ? "primary" : "secondary"}
            onClick={() => setFiltroRapido("security")}
          >
            Segurança
          </AppButton>
          <AppButton
            type="button"
            variant={filtroRapido === "2fa" ? "primary" : "secondary"}
            onClick={() => setFiltroRapido("2fa")}
          >
            2FA
          </AppButton>
          <AppButton
            type="button"
            variant={filtroRapido === "login" ? "primary" : "secondary"}
            onClick={() => setFiltroRapido("login")}
          >
            Login
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={limparFiltros}>
            Limpar filtros
          </AppButton>
        </div>

        <div className="flex gap-2 flex-wrap mb-3 mobile-stack-buttons">
          <AppButton type="button" variant="secondary" onClick={() => aplicarPeriodoRapido("today")}>
            Hoje
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={() => aplicarPeriodoRapido("7d")}>
            7 dias
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={() => aplicarPeriodoRapido("30d")}>
            30 dias
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={() => aplicarPeriodoRapido("90d")}>
            90 dias
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={() => aplicarPeriodoRapido("month")}>
            Este mês
          </AppButton>
        </div>

        <div className="form-row">
          <AppField
            as="select"
            label="Usuario"
            wrapperClassName="form-group"
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            options={[
              { value: "", label: "Todos" },
              ...usuarios.map((u) => ({ value: u.id, label: u.nome_completo })),
            ]}
          />

          <AppField
            as="select"
            label="Modulo"
            wrapperClassName="form-group"
            value={filtroModulo}
            onChange={(e) => setFiltroModulo(e.target.value)}
            options={[
              { value: "", label: "Todos" },
              ...modulosDisponiveis.map((modulo) => ({ value: modulo, label: modulo })),
            ]}
          />

          <AppField
            as="select"
            label="Acao"
            wrapperClassName="form-group"
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            options={[
              { value: "", label: "Todas" },
              ...acoesDisponiveis.map((a) => ({ value: a, label: a })),
            ]}
          />
        </div>

        <div className="form-row mt-2">
          <AppField
            as="input"
            type="date"
            label="Data inicial"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            wrapperClassName="form-group"
          />
          <AppField
            as="input"
            type="date"
            label="Data final"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            wrapperClassName="form-group"
          />
        </div>

        <div className="form-row mt-2">
          <AppField
            as="input"
            type="text"
            label="Busca no servidor"
            placeholder="Buscar por ação, módulo, IP ou navegador..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            wrapperClassName="form-group"
          />
        </div>
      </AppCard>

      {/* TABELA */}
      <AppCard
        tone="config"
        title={`Registros (${logsFiltrados.length} de ${totalLogs})`}
        actions={
          <div className="flex gap-2 flex-wrap mobile-stack-buttons">
            <AppButton type="button" variant="secondary" onClick={exportarCSV} disabled={exportando}>
              CSV
            </AppButton>
            <AppButton type="button" variant="secondary" onClick={exportarExcel} disabled={exportando}>
              {exportando ? "Exportando..." : "Excel"}
            </AppButton>
          </div>
        }
      >
        <DataTable
          containerClassName="vtur-scroll-y-65"
          className="table-header-blue table-mobile-cards min-w-[820px]"
          headers={
            <tr>
              <th className="min-w-[150px]">Data</th>
              <th>Usuario</th>
              <th>Acao</th>
              <th>Modulo</th>
              <th>IP</th>
              <th className="th-actions">Ações</th>
            </tr>
          }
          colSpan={6}
          loading={loading}
          empty={logsFiltrados.length === 0}
          emptyMessage="Nenhum log encontrado."
        >
          {logsFiltrados.map((l) => (
            <tr key={l.id}>
              <td data-label="Data">{formatDateTimeBR(l.created_at)}</td>
              <td data-label="Usuario">{l.users?.nome_completo || "Desconhecido"}</td>
              <td data-label="Acao">{getActionLabel(l.acao)}</td>
              <td data-label="Modulo">{l.modulo || "-"}</td>
              <td data-label="IP">{l.ip || "-"}</td>
              <td className="th-actions" data-label="Ações">
                <div className="action-buttons">
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => setLogSelecionado(l)}
                    title="Ver detalhes"
                    aria-label="Ver detalhes"
                  >
                    <i className="pi pi-eye" aria-hidden="true" />
                  </AppButton>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>

	        <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
	          <div className="text-sm text-slate-600">
	            Página {page} de {totalPages}
	          </div>
	          <div className="flex items-end gap-2 flex-wrap">
	            <AppButton
	              type="button"
	              variant="secondary"
	              onClick={() => setPage(1)}
	              disabled={page <= 1 || loading}
	            >
	              Primeira
	            </AppButton>
	            <AppField
	              as="select"
	              label="Itens por página"
	              value={String(pageSize)}
	              onChange={(e) => setPageSize(Number(e.target.value) || 50)}
              options={[
                { label: "50", value: "50" },
	                { label: "100", value: "100" },
	                { label: "200", value: "200" },
	              ]}
	            />
	            <AppField
	              as="input"
	              type="number"
	              label="Ir para página"
	              value={pageInput}
	              min={1}
	              max={totalPages}
	              onChange={(e) => setPageInput(e.target.value)}
	            />
	            <AppButton
	              type="button"
	              variant="secondary"
	              onClick={() => irParaPagina(pageInput)}
	              disabled={loading || totalPages <= 1}
	            >
	              Ir
	            </AppButton>
	            <AppButton type="button" variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
	              Anterior
	            </AppButton>
	            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
	            >
	              Próxima
	            </AppButton>
	            <AppButton
	              type="button"
	              variant="secondary"
	              onClick={() => setPage(totalPages)}
	              disabled={page >= totalPages || loading}
	            >
	              Última
	            </AppButton>
	          </div>
	        </div>
      </AppCard>

      {/* MODAL DETALHES */}
      {logSelecionado && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[100]">
          <AppCard
            tone="config"
            className="w-[95%] max-w-[700px] max-h-[90vh] overflow-y-auto"
            title="Detalhes do log"
            actions={
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setLogSelecionado(null)}
              >
                Fechar
              </AppButton>
            }
          >
            <p>
              <strong>Usuário:</strong> {logSelecionado.users?.nome_completo}
            </p>
            <p>
              <strong>Ação:</strong> {getActionLabel(logSelecionado.acao)}
            </p>
            <p>
              <strong>Módulo:</strong> {logSelecionado.modulo}
            </p>
            <p>
              <strong>Data:</strong> {formatDateTimeBR(logSelecionado.created_at)}
            </p>
            <p>
              <strong>IP:</strong> {logSelecionado.ip || "-"}
            </p>
            {logResumo.length > 0 && (
              <>
                <p className="mt-3">
                  <strong>Resumo:</strong>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {logResumo.map((item) => (
                    <div key={`${item.label}-${item.value}`} className="rounded border border-slate-200 px-3 py-2">
                      <div className="text-xs uppercase tracking-wide text-slate-500">{item.label}</div>
                      <div className="text-sm font-medium break-all">{item.value}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="mt-3">
              <strong>Detalhes:</strong>
            </p>
            <pre className="bg-slate-900 p-3 rounded text-xs whitespace-pre-wrap">
              {JSON.stringify(logSelecionado.detalhes, null, 2)}
            </pre>
          </AppCard>
        </div>
      )}
    </div>
  );
}
