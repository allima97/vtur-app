import { Dialog } from "../ui/primer/legacyCompat";
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import { buildQueryLiteKey, queryLite } from "../../lib/queryLite";
import { exportTableToPDF } from "../../lib/pdf";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { formatCurrencyBRL } from "../../lib/format";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { ToastStack, useToastQueue } from "../ui/Toast";
import PaginationControls from "../ui/PaginationControls";
import { fetchGestorEquipeIdsComGestor } from "../../lib/gestorEquipe";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type StatusFiltro = "todos" | "aberto" | "confirmado" | "cancelado";

type LinhaCliente = {
  cliente_id: string;
  cliente_nome: string;
  cliente_cpf: string;
  quantidade: number;
  total: number;
  ticketMedio: number;
};

type Ordenacao = "total" | "quantidade" | "ticket";

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

type UserCtx = {
  usuarioId: string;
  papel: Papel;
  vendedorIds: string[];
};

type ExportFlags = {
  pdf: boolean;
  excel: boolean;
};

type PeriodoPreset = "hoje" | "7" | "30" | "mes_atual" | "mes_anterior" | "limpar" | "";

function hojeISO() {
  return new Date().toISOString().substring(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatISO(date: Date) {
  return date.toISOString().substring(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function csvEscape(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

async function fetchRelatorioClientes(params: {
  dataInicio?: string;
  dataFim?: string;
  status?: string;
  busca?: string;
  vendedorIds?: string[] | null;
  ordem: string;
  ordemDesc: boolean;
  page: number;
  pageSize: number;
  noCache?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.dataInicio) qs.set("inicio", params.dataInicio);
  if (params.dataFim) qs.set("fim", params.dataFim);
  if (params.status && params.status !== "todos") qs.set("status", params.status);
  if (params.busca) qs.set("busca", params.busca);
  if (params.vendedorIds && params.vendedorIds.length > 0) {
    qs.set("vendedor_ids", params.vendedorIds.join(","));
  }
  if (params.ordem) qs.set("ordem", params.ordem);
  qs.set("ordem_desc", params.ordemDesc ? "1" : "0");
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.noCache) qs.set("no_cache", "1");

  const cacheKey = buildQueryLiteKey(["relatorioClientes", qs.toString()]);
  const payload = await queryLite(
    cacheKey,
    async () => {
      const resp = await fetch(`/api/v1/relatorios/vendas-por-cliente?${qs.toString()}`);
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      return resp.json();
    },
    { ttlMs: params.noCache ? 0 : 10_000 }
  );

  return Array.isArray(payload) ? payload : [];
}

export default function RelatorioAgrupadoClienteIsland() {
  const { ready, userType } = usePermissoesStore();
  const isMaster = /MASTER/i.test(String(userType || ""));
  const masterScope = useMasterScope(Boolean(isMaster && ready));
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [buscaCliente, setBuscaCliente] = useState("");

  const [linhas, setLinhas] = useState<LinhaCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [userCtx, setUserCtx] = useState<UserCtx | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [vendedoresEquipe, setVendedoresEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [totalGeral, setTotalGeral] = useState(0);
  const [totalQtd, setTotalQtd] = useState(0);
  const [exportFlags, setExportFlags] = useState<ExportFlags>({
    pdf: true,
    excel: true,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportTipo, setExportTipo] = useState<"csv" | "excel" | "pdf">("csv");
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const [ordenacao, setOrdenacao] = useState<Ordenacao>("total");
  const [ordemDesc, setOrdemDesc] = useState<boolean>(true);
  const vendedorSelecionadoAtual =
    userCtx?.papel === "MASTER" ? masterScope.vendedorSelecionado : vendedorSelecionado;
  const setVendedorSelecionadoAtual = (value: string) => {
    if (userCtx?.papel === "MASTER") {
      masterScope.setVendedorSelecionado(value);
    } else {
      setVendedorSelecionado(value);
    }
  };
  const todosValue = userCtx?.papel === "MASTER" ? "all" : "todos";
  const isTodosFiltro = (value?: string) =>
    !value || value === "todos" || value === "all";

  useEffect(() => {
    if (exportTipo === "excel" && !exportFlags.excel) {
      setExportTipo("csv");
      return;
    }
    if (exportTipo === "pdf" && !exportFlags.pdf) {
      setExportTipo("csv");
    }
  }, [exportFlags, exportTipo]);

  useEffect(() => {
    async function carregarUserCtx() {
      try {
        setLoadingUser(true);
        setErro(null);

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) {
          setErro("Usuário não autenticado.");
          return;
        }

        const { data: usuarioDb } = await supabase
          .from("users")
          .select("id, user_types(name), company_id")
          .eq("id", userId)
          .maybeSingle();

        const tipoName =
          ((usuarioDb as any)?.user_types as any)?.name ||
          (auth?.user?.user_metadata as any)?.name ||
          "";
        const tipoNorm = String(tipoName || "").toUpperCase();

        let papel: Papel = "VENDEDOR";
        if (tipoNorm.includes("ADMIN")) papel = "ADMIN";
        else if (tipoNorm.includes("MASTER")) papel = "MASTER";
        else if (tipoNorm.includes("GESTOR")) papel = "GESTOR";
        else if (tipoNorm.includes("VENDEDOR")) papel = "VENDEDOR";
        else papel = "OUTRO";

        let vendedorIds: string[] = [userId];
        if (papel === "MASTER") {
          vendedorIds = masterScope.vendedorIds;
          setUserCtx({ usuarioId: userId, papel, vendedorIds });
          return;
        }
        if (papel === "GESTOR") {
          vendedorIds = await fetchGestorEquipeIdsComGestor(userId);
        } else if (papel === "ADMIN") {
          vendedorIds = [];
        }

        const companyId = (usuarioDb as any)?.company_id || null;
        if (companyId) {
          const { data: params } = await supabase
            .from("parametros_comissao")
            .select("exportacao_pdf, exportacao_excel")
            .eq("company_id", companyId)
            .maybeSingle();
          if (params) {
            setExportFlags({
              pdf: params.exportacao_pdf ?? true,
              excel: params.exportacao_excel ?? true,
            });
          }
        }

        setUserCtx({ usuarioId: userId, papel, vendedorIds });
      } catch (e: any) {
        console.error(e);
        setErro("Erro ao carregar contexto do usuário.");
      } finally {
        setLoadingUser(false);
      }
    }

    carregarUserCtx();
  }, []);

  useEffect(() => {
    if (userCtx?.papel !== "MASTER") return;
    setUserCtx((prev) =>
      prev ? { ...prev, vendedorIds: masterScope.vendedorIds } : prev
    );
  }, [masterScope.vendedorIds, userCtx?.papel]);

  useEffect(() => {
    if (!userCtx || (userCtx.papel !== "GESTOR" && userCtx.papel !== "MASTER")) {
      setVendedoresEquipe([]);
      setVendedorSelecionado("todos");
      return;
    }

    if (userCtx.papel === "MASTER") {
      setVendedoresEquipe(
        masterScope.vendedoresDisponiveis.map((v) => ({
          id: v.id,
          nome: v.nome_completo || "Vendedor",
        }))
      );
      return;
    }

    async function carregarVendedoresEquipe() {
      try {
        const ids = userCtx.vendedorIds || [];
        if (ids.length === 0) {
          setVendedoresEquipe([]);
          return;
        }
        const { data, error } = await supabase
          .from("users")
          .select("id, nome_completo")
          .in("id", ids)
          .order("nome_completo");
        if (error) throw error;
        setVendedoresEquipe(
          (data || []).map((v: any) => ({
            id: v.id,
            nome: v.nome_completo || "Vendedor",
          }))
        );
      } catch (e) {
        console.error(e);
        setVendedoresEquipe([]);
      }
    }

    carregarVendedoresEquipe();
  }, [userCtx]);

  useEffect(() => {
    if (dataInicio || dataFim) return;
    const hoje = new Date();
    const inicio = addDays(hoje, -30);
    setDataInicio(formatISO(inicio));
    setDataFim(hojeISO());
  }, []);

  const linhasExibidas = linhas;
  const ticketGeral = totalQtd > 0 ? totalGeral / totalQtd : 0;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPaginas);

  function aplicarPeriodoPreset(
    tipo: "hoje" | "7" | "30" | "mes_atual" | "mes_anterior" | "limpar"
  ) {
    setPeriodoPreset(tipo);
    const hoje = new Date();
    if (tipo === "hoje") {
      setDataInicio(hojeISO());
      setDataFim(hojeISO());
      return;
    }
    if (tipo === "7") {
      const inicio = addDays(hoje, -7);
      setDataInicio(formatISO(inicio));
      setDataFim(hojeISO());
      return;
    }
    if (tipo === "30") {
      const inicio = addDays(hoje, -30);
      setDataInicio(formatISO(inicio));
      setDataFim(hojeISO());
      return;
    }
    if (tipo === "mes_atual") {
      const inicio = startOfMonth(hoje);
      const fim = endOfMonth(hoje);
      setDataInicio(formatISO(inicio));
      setDataFim(formatISO(fim));
      return;
    }
    if (tipo === "mes_anterior") {
      const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const inicio = startOfMonth(mesAnterior);
      const fim = endOfMonth(mesAnterior);
      setDataInicio(formatISO(inicio));
      setDataFim(formatISO(fim));
      return;
    }
    if (tipo === "limpar") {
      setDataInicio("");
      setDataFim("");
    }
  }

  async function carregarResumo(pageOverride?: number) {
    if (!userCtx) return;
    try {
      setLoading(true);
      setErro(null);

      const vendedorIdsFiltro =
        userCtx.papel === "ADMIN"
          ? null
          : (userCtx.papel === "GESTOR" || userCtx.papel === "MASTER") &&
            !isTodosFiltro(vendedorSelecionadoAtual)
          ? [vendedorSelecionadoAtual]
          : userCtx.vendedorIds;

      if (userCtx.papel !== "ADMIN" && (!vendedorIdsFiltro || vendedorIdsFiltro.length === 0)) {
        setLinhas([]);
        setTotalLinhas(0);
        setTotalGeral(0);
        setTotalQtd(0);
        return;
      }

      const paginaAtual = Math.max(1, pageOverride ?? page);
      const rows = (await fetchRelatorioClientes({
        dataInicio: dataInicio || "",
        dataFim: dataFim || "",
        status: statusFiltro,
        busca: buscaCliente,
        vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
        ordem: ordenacao,
        ordemDesc,
        page: paginaAtual,
        pageSize,
      })) as any[];
      const mapped = rows.map((row) => ({
        cliente_id: row.cliente_id,
        cliente_nome: row.cliente_nome || "(sem cliente)",
        cliente_cpf: row.cliente_cpf || "",
        quantidade: Number(row.quantidade || 0),
        total: Number(row.total || 0),
        ticketMedio: Number(row.ticket_medio || 0),
      }));

      setLinhas(mapped);
      if (rows.length > 0) {
        setTotalLinhas(Number(rows[0].total_count || 0));
        setTotalGeral(Number(rows[0].total_total || 0));
        setTotalQtd(Number(rows[0].total_quantidade || 0));
      } else {
        setTotalLinhas(0);
        setTotalGeral(0);
        setTotalQtd(0);
      }
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar vendas para relatório por cliente.");
      setLinhas([]);
      setTotalLinhas(0);
      setTotalGeral(0);
      setTotalQtd(0);
    } finally {
      setLoading(false);
    }
  }

  async function carregarTodasLinhas(): Promise<LinhaCliente[]> {
    if (!userCtx) return [];
    const pageSizeExport = 500;
    let pagina = 1;
    const todas: LinhaCliente[] = [];

    const vendedorIdsFiltro =
      userCtx.papel === "ADMIN"
        ? null
        : (userCtx.papel === "GESTOR" || userCtx.papel === "MASTER") &&
          !isTodosFiltro(vendedorSelecionadoAtual)
        ? [vendedorSelecionadoAtual]
        : userCtx.vendedorIds;

    if (userCtx.papel !== "ADMIN" && (!vendedorIdsFiltro || vendedorIdsFiltro.length === 0)) {
      return [];
    }

    while (true) {
      const rows = (await fetchRelatorioClientes({
        dataInicio: dataInicio || "",
        dataFim: dataFim || "",
        status: statusFiltro,
        busca: buscaCliente,
        vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
        ordem: ordenacao,
        ordemDesc,
        page: pagina,
        pageSize: pageSizeExport,
        noCache: true,
      })) as any[];
      const mapped = rows.map((row) => ({
        cliente_id: row.cliente_id,
        cliente_nome: row.cliente_nome || "(sem cliente)",
        cliente_cpf: row.cliente_cpf || "",
        quantidade: Number(row.quantidade || 0),
        total: Number(row.total || 0),
        ticketMedio: Number(row.ticket_medio || 0),
      }));
      todas.push(...mapped);

      if (rows.length < pageSizeExport) break;
      pagina += 1;
    }

    return todas;
  }

  function mudarOrdenacao(campo: Ordenacao) {
    if (campo === ordenacao) {
      setOrdemDesc((prev) => !prev);
    } else {
      setOrdenacao(campo);
      setOrdemDesc(true);
    }
    setPage(1);
  }

  useEffect(() => {
    if (userCtx) {
      carregarResumo();
    }
  }, [
    userCtx,
    page,
    pageSize,
    dataInicio,
    dataFim,
    statusFiltro,
    buscaCliente,
    ordenacao,
    ordemDesc,
    vendedorSelecionado,
    masterScope.vendedorSelecionado,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
    masterScope.vendedorIds,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    dataInicio,
    dataFim,
    statusFiltro,
    buscaCliente,
    ordenacao,
    ordemDesc,
    vendedorSelecionado,
    masterScope.vendedorSelecionado,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
    masterScope.vendedorIds,
  ]);

  useEffect(() => {
    if (page > totalPaginas) {
      setPage(totalPaginas);
    }
  }, [page, totalPaginas]);

  async function exportarCSV() {
    const linhasExport = await carregarTodasLinhas();
    if (linhasExport.length === 0) {
      showToast("Não há dados para exportar.", "warning");
      return;
    }

    const header = ["cliente", "cpf", "quantidade", "total", "ticket_medio"];
    const rows = linhasExport.map((l) => [
      l.cliente_nome,
      l.cliente_cpf,
      l.quantidade.toString(),
      l.total.toFixed(2).replace(".", ","),
      l.ticketMedio.toFixed(2).replace(".", ","),
    ]);
    const all = [header, ...rows]
      .map((cols) => cols.map((c) => csvEscape(c)).join(";"))
      .join("\n");

    const blob = new Blob([all], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(now.getDate()).padStart(2, "0")}-${String(
      now.getHours()
    ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio-vendas-por-cliente-${ts}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function exportarExcel() {
    if (!exportFlags.excel) {
      showToast("Exportação Excel desabilitada nos parâmetros.", "warning");
      return;
    }
    const linhasExport = await carregarTodasLinhas();
    if (linhasExport.length === 0) {
      showToast("Não há dados para exportar.", "warning");
      return;
    }

    try {
      const module = await import("xlsx");
      const XLSX = (module as any).default ?? module;
      const data = linhasExport.map((l) => ({
        Cliente: l.cliente_nome,
        CPF: l.cliente_cpf,
        Quantidade: l.quantidade,
        "Faturamento (R$)": l.total,
        "Ticket médio (R$)": l.ticketMedio,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vendas por Cliente");

      const ts = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
      XLSX.writeFile(wb, `relatorio-clientes-${ts}.xlsx`);
    } catch (e) {
      console.error("Erro ao exportar Excel:", e);
      showToast("Não foi possível exportar Excel. Recarregue a página e tente novamente.", "error");
    }
  }

  async function exportarPDF() {
    if (!exportFlags.pdf) {
      showToast("Exportação PDF desabilitada nos parâmetros.", "warning");
      return;
    }
    const linhasExport = await carregarTodasLinhas();
    if (linhasExport.length === 0) {
      showToast("Não há dados para exportar.", "warning");
      return;
    }

    const subtitle =
      dataInicio && dataFim
        ? `Período: ${formatarDataParaExibicao(dataInicio)} até ${formatarDataParaExibicao(
            dataFim
          )}`
        : dataInicio
        ? `A partir de ${formatarDataParaExibicao(dataInicio)}`
        : dataFim
        ? `Até ${formatarDataParaExibicao(dataFim)}`
        : undefined;

    const headers = ["Cliente", "CPF", "Qtde", "Faturamento", "Ticket médio"];
    const rows = linhasExport.map((l) => [
      l.cliente_nome,
      l.cliente_cpf,
      l.quantidade,
      formatCurrencyBRL(l.total),
      formatCurrencyBRL(l.ticketMedio),
    ]);

    try {
      await exportTableToPDF({
        title: "Vendas por Cliente",
        subtitle,
        headers,
        rows,
        fileName: "relatorio-vendas-por-cliente",
        orientation: "landscape",
      });
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      showToast("Não foi possível exportar PDF. Recarregue a página e tente novamente.", "error");
    }
  }

  async function exportarSelecionado() {
    if (exportando) return;
    setExportando(true);
    try {
      if (exportTipo === "csv") {
        await exportarCSV();
        return;
      }
      if (exportTipo === "excel") {
        await exportarExcel();
        return;
      }
      await exportarPDF();
    } finally {
      setExportando(false);
    }
  }

  const exportDisabled =
    (exportTipo === "excel" && !exportFlags.excel) ||
    (exportTipo === "pdf" && !exportFlags.pdf);

  if (loadingUser) return <LoadingUsuarioContext />;

  const aplicarFiltrosRelatorio = () => {
    setPage(1);
    carregarResumo(1);
    setShowFilters(false);
  };

  const periodoResumo =
    dataInicio && dataFim
      ? `${formatarDataParaExibicao(dataInicio)} ate ${formatarDataParaExibicao(dataFim)}`
      : dataInicio
      ? `A partir de ${formatarDataParaExibicao(dataInicio)}`
      : dataFim
      ? `Ate ${formatarDataParaExibicao(dataFim)}`
      : "Sem recorte de data";

  const escopoResumo =
    userCtx && userCtx.papel !== "ADMIN"
      ? `Relatorio limitado a ${
          userCtx.papel === "GESTOR"
            ? "sua equipe"
            : userCtx.papel === "MASTER"
            ? "seu portfolio selecionado"
            : "suas vendas"
        }.`
      : null;

  const renderPeriodButtons = () => (
    <div className="vtur-quote-top-actions">
      {[
        { id: "hoje", label: "Hoje" },
        { id: "7", label: "Ultimos 7 dias" },
        { id: "30", label: "Ultimos 30 dias" },
        { id: "mes_atual", label: "Este mes" },
        { id: "mes_anterior", label: "Mes anterior" },
        { id: "limpar", label: "Limpar datas" },
      ].map((periodo) => (
        <AppButton
          key={periodo.id}
          type="button"
          variant={periodoPreset === periodo.id ? "primary" : "secondary"}
          onClick={() => aplicarPeriodoPreset(periodo.id as Exclude<PeriodoPreset, "">)}
        >
          {periodo.label}
        </AppButton>
      ))}
    </div>
  );

  const renderFiltersGrid = () => (
    <>
      <div className="vtur-commission-filters-grid">
        <AppField
          label="Data Início"
          type="date"
          value={dataInicio}
          onFocus={selectAllInputOnFocus}
          onChange={(e) => {
            const nextInicio = e.target.value;
            setPeriodoPreset("");
            setDataInicio(nextInicio);
            if (dataFim && nextInicio && dataFim < nextInicio) {
              setDataFim(nextInicio);
            }
          }}
        />
        <AppField
          label="Data Final"
          type="date"
          value={dataFim}
          min={dataInicio || undefined}
          onFocus={selectAllInputOnFocus}
          onChange={(e) => {
            const nextFim = e.target.value;
            setPeriodoPreset("");
            const boundedFim = dataInicio && nextFim && nextFim < dataInicio ? dataInicio : nextFim;
            setDataFim(boundedFim);
          }}
        />
        {userCtx?.papel === "MASTER" ? (
          <>
            <AppField
              as="select"
              label="Filial"
              value={masterScope.empresaSelecionada}
              onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)}
              options={[
                { label: "Todas", value: "all" },
                ...masterScope.empresasAprovadas.map((empresa) => ({
                  label: empresa.nome_fantasia,
                  value: empresa.id,
                })),
              ]}
            />
            <AppField
              as="select"
              label="Equipe"
              value={masterScope.gestorSelecionado}
              onChange={(e) => masterScope.setGestorSelecionado(e.target.value)}
              options={[
                { label: "Todas", value: "all" },
                ...masterScope.gestoresDisponiveis.map((gestor) => ({
                  label: gestor.nome_completo,
                  value: gestor.id,
                })),
              ]}
            />
          </>
        ) : null}
        {userCtx?.papel === "GESTOR" || userCtx?.papel === "MASTER" ? (
          <AppField
            as="select"
            label="Vendedor"
            value={vendedorSelecionadoAtual || todosValue}
            onChange={(e) => setVendedorSelecionadoAtual(e.target.value)}
            options={[
              { label: "Todos", value: todosValue },
              ...vendedoresEquipe.map((vendedor) => ({
                label: vendedor.nome,
                value: vendedor.id,
              })),
            ]}
          />
        ) : null}
        <AppField
          as="select"
          label="Status"
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as StatusFiltro)}
          options={[
            { label: "Todos", value: "todos" },
            { label: "Aberto", value: "aberto" },
            { label: "Confirmado", value: "confirmado" },
            { label: "Cancelado", value: "cancelado" },
          ]}
        />
        <AppField
          label="Buscar cliente"
          value={buscaCliente}
          onChange={(e) => setBuscaCliente(e.target.value)}
          placeholder="Nome do cliente ou CPF..."
        />
      </div>
      <div style={{ marginTop: 16 }}>{renderPeriodButtons()}</div>
    </>
  );

  return (
    <AppPrimerProvider>
      <div className="relatorio-vendas-cliente-page">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        <AppToolbar
          sticky
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Relatorio agrupado por cliente"
          subtitle={`Periodo: ${periodoResumo}. Consolidacao por cliente no recorte atual.`}
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton type="button" variant="secondary" className="sm:hidden" onClick={() => setShowFilters(true)}>
                Filtros
              </AppButton>
              <AppButton type="button" variant="primary" onClick={aplicarFiltrosRelatorio}>
                Aplicar filtros
              </AppButton>
              <AppButton type="button" variant="secondary" onClick={() => setShowExport(true)}>
                Exportar
              </AppButton>
            </div>
          }
        >
          <div className="hidden sm:block">{renderFiltersGrid()}</div>
        </AppToolbar>

        {showFilters ? (
          <Dialog
            title="Filtros do relatorio"
            width="xlarge"
            onClose={() => setShowFilters(false)}
            footerButtons={[
              {
                content: "Cancelar",
                buttonType: "default",
                onClick: () => setShowFilters(false),
              },
              {
                content: "Aplicar filtros",
                buttonType: "primary",
                onClick: aplicarFiltrosRelatorio,
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                title="Refine o recorte comercial"
                subtitle="Ajuste datas, escopo, status e busca por cliente antes de atualizar o relatorio."
              >
                {renderFiltersGrid()}
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        {showExport ? (
          <Dialog
            title="Exportar relatorio"
            width="large"
            onClose={() => setShowExport(false)}
            footerButtons={[
              {
                content: "Cancelar",
                buttonType: "default",
                onClick: () => setShowExport(false),
              },
              {
                content: exportando ? "Preparando..." : "Exportar",
                buttonType: "primary",
                onClick: () => {
                  exportarSelecionado();
                  setShowExport(false);
                },
                disabled: exportDisabled || exportando,
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                title="Formato da exportacao"
                subtitle="Escolha o formato final respeitando as permissoes definidas nos parametros da empresa."
              >
                <div className="vtur-quote-top-actions">
                  <AppButton
                    type="button"
                    variant={exportTipo === "csv" ? "primary" : "secondary"}
                    onClick={() => setExportTipo("csv")}
                  >
                    CSV
                  </AppButton>
                  <AppButton
                    type="button"
                    variant={exportTipo === "excel" ? "primary" : "secondary"}
                    onClick={() => setExportTipo("excel")}
                    disabled={!exportFlags.excel}
                  >
                    Excel
                  </AppButton>
                  <AppButton
                    type="button"
                    variant={exportTipo === "pdf" ? "primary" : "secondary"}
                    onClick={() => setExportTipo("pdf")}
                    disabled={!exportFlags.pdf}
                  >
                    PDF
                  </AppButton>
                </div>
                {exportDisabled ? (
                  <div style={{ marginTop: 16 }}>
                    <AlertMessage variant="warning">
                      O formato selecionado esta desabilitado nos parametros da empresa.
                    </AlertMessage>
                  </div>
                ) : null}
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        {escopoResumo ? (
          <AlertMessage variant="info" className="mb-3">
            {escopoResumo}
          </AlertMessage>
        ) : null}

        {erro ? (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        ) : null}

        <AppCard
          title="Resumo por cliente"
          subtitle="Quantidade, faturamento e ticket medio consolidados por cliente no recorte atual."
        >
          <div className="vtur-quote-summary-grid">
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Clientes</span>
              <strong>{totalLinhas}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Quantidade</span>
              <strong>{totalQtd}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Faturamento</span>
              <strong>{formatCurrencyBRL(totalGeral)}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Ticket medio</span>
              <strong>{formatCurrencyBRL(ticketGeral)}</strong>
            </div>
          </div>

          <div className="mb-3" style={{ marginTop: 16 }}>
            <PaginationControls
              page={paginaAtual}
              pageSize={pageSize}
              totalItems={totalLinhas}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>

          <DataTable
            headers={
              <tr>
                <th>Cliente</th>
                <th>CPF</th>
                <th style={{ cursor: "pointer" }} onClick={() => mudarOrdenacao("quantidade")}>
                  Qtde {ordenacao === "quantidade" ? (ordemDesc ? "↓" : "↑") : ""}
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => mudarOrdenacao("total")}>
                  Faturamento {ordenacao === "total" ? (ordemDesc ? "↓" : "↑") : ""}
                </th>
                <th style={{ cursor: "pointer" }} onClick={() => mudarOrdenacao("ticket")}>
                  Ticket medio {ordenacao === "ticket" ? (ordemDesc ? "↓" : "↑") : ""}
                </th>
              </tr>
            }
            loading={loading}
            loadingMessage="Carregando consolidacao por cliente..."
            empty={!loading && linhasExibidas.length === 0}
            emptyMessage={
              <EmptyState
                title="Nenhum cliente encontrado"
                description="Ajuste datas, escopo, status ou busca para ampliar o recorte do relatorio."
              />
            }
            colSpan={5}
            className="table-header-blue table-mobile-cards min-w-[700px]"
          >
            {linhasExibidas.map((linha) => (
              <tr key={linha.cliente_id}>
                <td data-label="Cliente">{linha.cliente_nome}</td>
                <td data-label="CPF">{linha.cliente_cpf}</td>
                <td data-label="Qtde">{linha.quantidade}</td>
                <td data-label="Faturamento">{formatCurrencyBRL(linha.total)}</td>
                <td data-label="Ticket medio">{formatCurrencyBRL(linha.ticketMedio)}</td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}
