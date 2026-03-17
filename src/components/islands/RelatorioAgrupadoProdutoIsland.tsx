import { Dialog } from "../ui/primer/legacyCompat";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import { buildQueryLiteKey, queryLite } from "../../lib/queryLite";
import { exportTableToPDF } from "../../lib/pdf";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { normalizeText } from "../../lib/normalizeText";
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

type Produto = {
  id: string;
  nome: string | null;
  tipo: string;
};

type Venda = {
  id: string;
  cliente_id: string;
  destino_id: string;
  produto_id: string | null;
  destino_cidade_id: string | null;
  data_venda: string;
  data_embarque: string | null;
  valor_total: number | null;
  status: string | null;
  vendas_recibos?: { produto_id: string | null; valor_total: number | null; valor_taxas: number | null; numero_recibo?: string | null; produtos?: { nome?: string | null } }[];
  destinos?: { nome: string | null; cidade_id?: string | null };
  destino_cidade?: { nome: string | null };
};

type CidadeFiltro = { id: string; nome: string };

type LinhaProduto = {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  total: number;
  ticketMedio: number;
};

type ReciboDetalhe = {
  rowId: string;
  vendaId: string;
  numeroRecibo: string | null;
  produtoNome: string;
  tipoId: string | null;
  valorTotal: number;
  valorTaxas: number;
  dataVenda: string;
  status: string | null;
  destinoNome: string | null;
  cidadeNome: string | null;
  cidadeId: string | null;
};

type Ordenacao = "total" | "quantidade" | "ticket";
type StatusFiltro = "todos" | "aberto" | "confirmado" | "cancelado";

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

async function fetchRelatorioProdutos(params: {
  dataInicio?: string;
  dataFim?: string;
  status?: string;
  busca?: string;
  cidadeId?: string;
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
  if (params.cidadeId) qs.set("cidade_id", params.cidadeId);
  if (params.vendedorIds && params.vendedorIds.length > 0) {
    qs.set("vendedor_ids", params.vendedorIds.join(","));
  }
  if (params.ordem) qs.set("ordem", params.ordem);
  qs.set("ordem_desc", params.ordemDesc ? "1" : "0");
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.noCache) qs.set("no_cache", "1");

  const cacheKey = buildQueryLiteKey(["relatorioProdutos", qs.toString()]);
  const payload = await queryLite(
    cacheKey,
    async () => {
      const resp = await fetch(`/api/v1/relatorios/vendas-por-produto?${qs.toString()}`);
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      return resp.json();
    },
    { ttlMs: params.noCache ? 0 : 10_000 }
  );

  return Array.isArray(payload) ? payload : [];
}

async function fetchRelatorioProdutosRecibos(params: {
  dataInicio?: string;
  dataFim?: string;
  status?: string;
  vendedorIds?: string[] | null;
  noCache?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.dataInicio) qs.set("inicio", params.dataInicio);
  if (params.dataFim) qs.set("fim", params.dataFim);
  if (params.status && params.status !== "todos") qs.set("status", params.status);
  if (params.vendedorIds && params.vendedorIds.length > 0) {
    qs.set("vendedor_ids", params.vendedorIds.join(","));
  }
  if (params.noCache) qs.set("no_cache", "1");

  const cacheKey = buildQueryLiteKey(["relatorioProdutosRecibos", qs.toString()]);
  const payload = await queryLite(
    cacheKey,
    async () => {
      const resp = await fetch(`/api/v1/relatorios/produtos-recibos?${qs.toString()}`);
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      return resp.json();
    },
    { ttlMs: params.noCache ? 0 : 10_000 }
  );

  return Array.isArray(payload) ? payload : [];
}

async function fetchCidadesSugestoes(params: {
  query: string;
  limite?: number;
  signal?: AbortSignal;
}) {
  const qs = new URLSearchParams();
  qs.set("q", params.query);
  qs.set("limite", String(params.limite ?? 8));
  const resp = await fetch(`/api/v1/relatorios/cidades-busca?${qs.toString()}`, {
    signal: params.signal,
  });
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  const payload = await resp.json();
  return Array.isArray(payload) ? payload : [];
}

function buildRecibosDetalhados(params: {
  vendas: Venda[];
  tipoProdutosNomeMap: Map<string, string>;
  cidadesMap: Record<string, string>;
  statusFiltro: StatusFiltro;
}): ReciboDetalhe[] {
  const rows: ReciboDetalhe[] = [];
  const nomeFallback = (tipoId?: string | null) =>
    params.tipoProdutosNomeMap.get(tipoId || "") || "(sem produto)";
  params.vendas.forEach((v) => {
    if (params.statusFiltro !== "todos" && v.status !== params.statusFiltro) {
      return;
    }
    const cidadeId = v.destino_cidade_id || v.destinos?.cidade_id || null;
    const cidadeNome =
      v.destino_cidade?.nome ||
      (cidadeId && params.cidadesMap[cidadeId]
        ? params.cidadesMap[cidadeId]
        : null);
    const destinoNome = v.destinos?.nome || null;
    const recibos = v.vendas_recibos || [];
    if (recibos.length) {
      recibos.forEach((r, idx) => {
        const produtoNome = r.produtos?.nome || nomeFallback(r.produto_id);
        const rowId = `${v.id}-${r.numero_recibo || "sem"}-${r.produto_id || "sem"}-${idx}`;
        rows.push({
          rowId,
          vendaId: v.id,
          numeroRecibo: r.numero_recibo || null,
          tipoId: r.produto_id || null,
          produtoNome,
          valorTotal: Number(r.valor_total || 0),
          valorTaxas: Number(r.valor_taxas || 0),
          dataVenda: v.data_venda,
          status: v.status,
          destinoNome,
          cidadeNome,
          cidadeId,
        });
      });
    } else {
      const rowId = `${v.id}-sem-${v.produto_id || "sem"}-0`;
      rows.push({
        rowId,
        vendaId: v.id,
        numeroRecibo: null,
        tipoId: v.produto_id || null,
        produtoNome: nomeFallback(v.produto_id),
        valorTotal: v.valor_total ?? 0,
        valorTaxas: 0,
        dataVenda: v.data_venda,
        status: v.status,
        destinoNome,
        cidadeNome,
        cidadeId,
      });
    }
  });
  return rows;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function csvEscape(value: string): string {
  const doubleQuote = '"';
  if (value.includes(";") || value.includes(doubleQuote) || value.includes("\n")) {
    const escaped = value.split(doubleQuote).join(doubleQuote + doubleQuote);
    return doubleQuote + escaped + doubleQuote;
  }
  return value;
}

function formatCurrency(value: number): string {
  return formatCurrencyBRL(value);
}

async function fetchRelatorioBase() {
  const resp = await fetch("/api/v1/relatorios/base");
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json();
}

export default function RelatorioAgrupadoProdutoIsland() {
  const { ready, userType } = usePermissoesStore();
  const isMaster = /MASTER/i.test(String(userType || ""));
  const masterScope = useMasterScope(Boolean(isMaster && ready));
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [tipoReciboSelecionado, setTipoReciboSelecionado] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");
  const [cidadeNomeInput, setCidadeNomeInput] = useState("");
  const [mostrarSugestoesCidadeFiltro, setMostrarSugestoesCidadeFiltro] = useState(false);
  const [cidadesLista, setCidadesLista] = useState<CidadeFiltro[]>([]);
  const [cidadeSugestoes, setCidadeSugestoes] = useState<CidadeFiltro[]>([]);
  const [buscandoCidade, setBuscandoCidade] = useState(false);
  const [erroCidade, setErroCidade] = useState<string | null>(null);

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [linhas, setLinhas] = useState<LinhaProduto[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [userCtx, setUserCtx] = useState<UserCtx | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [vendedoresEquipe, setVendedoresEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>("todos");
  const [cidadesMap, setCidadesMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [totalGeral, setTotalGeral] = useState(0);
  const [totalQtd, setTotalQtd] = useState(0);
  const [exportFlags, setExportFlags] = useState<ExportFlags>({ pdf: true, excel: true });
  const [showExport, setShowExport] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
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
  const [activeTab, setActiveTab] = useState<"agrupado" | "recibos">("recibos");
  const tabOptions = [
    { id: "recibos", label: "Produtos por recibo" },
    { id: "agrupado", label: "Resumo por tipo" },
  ];


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
    async function carregarBase() {
      try {
        const payload = await fetchRelatorioBase();
        const tipos = (payload?.tiposProdutos || []) as Produto[];
        setProdutos(tipos);
        const cidades = (payload?.cidades || []) as CidadeFiltro[];
        const map: Record<string, string> = {};
        const lista: CidadeFiltro[] = [];
        cidades.forEach((cidade: any) => {
          if (cidade?.id && cidade?.nome) {
            map[cidade.id] = cidade.nome;
            lista.push({ id: cidade.id, nome: cidade.nome });
          }
        });
        setCidadesMap(map);
        setCidadesLista(lista);
      } catch (e: any) {
        console.error(e);
        setErro("Erro ao carregar base de produtos/cidades.");
      }
    }

    carregarBase();
  }, []);

  useEffect(() => {
    if (cidadeNomeInput.trim().length < 2) {
      setCidadeSugestoes([]);
      setErroCidade(null);
      setBuscandoCidade(false);
      setMostrarSugestoesCidadeFiltro(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBuscandoCidade(true);
      setErroCidade(null);
      try {
        const data = await fetchCidadesSugestoes({
          query: cidadeNomeInput.trim(),
          limite: 8,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setCidadeSugestoes((data || []) as CidadeFiltro[]);
          setMostrarSugestoesCidadeFiltro(true);
        }
      } catch (e: any) {
        if (!controller.signal.aborted) {
          console.error("Erro ao buscar cidades:", e);
          setErroCidade("Erro ao buscar cidades. Tente novamente.");
          setCidadeSugestoes([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setBuscandoCidade(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [cidadeNomeInput]);

  useEffect(() => {
    if (!cidadeFiltro) return;
    const selec = cidadesLista.find((cidade) => cidade.id === cidadeFiltro);
    if (selec) {
      setCidadeNomeInput(selec.nome);
    }
  }, [cidadeFiltro, cidadesLista]);


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
          .select("id, user_types(name)")
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

  const tipoProdutosNomeMap = useMemo(
    () => new Map(produtos.map((p) => [p.id, p.nome || ""])),
    [produtos]
  );

  const linhasExibidas = linhas;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPaginas);
  const ticketGeral = totalQtd > 0 ? totalGeral / totalQtd : 0;

  const recibosDetalhados = useMemo(() => {
    return buildRecibosDetalhados({
      vendas,
      tipoProdutosNomeMap,
      cidadesMap,
      statusFiltro,
    });
  }, [vendas, tipoProdutosNomeMap, cidadesMap, statusFiltro]);

  const recibosFiltrados = useMemo(() => {
    const hasTerm = buscaProduto.trim().length > 0;
    const term = normalizeText(buscaProduto);
    return recibosDetalhados.filter((recibo) => {
      if (cidadeFiltro && recibo.cidadeId !== cidadeFiltro) {
        return false;
      }
      if (tipoReciboSelecionado && recibo.tipoId !== tipoReciboSelecionado) {
        return false;
      }
      if (!hasTerm) return true;
      const destino = normalizeText(recibo.destinoNome || "");
      const produto = normalizeText(recibo.produtoNome || "");
      return destino.includes(term) || produto.includes(term);
    });
  }, [recibosDetalhados, buscaProduto, tipoReciboSelecionado, cidadeFiltro]);
  const recibosExibidos = useMemo(() => {
    return recibosFiltrados;
  }, [recibosFiltrados]);
  const totalRecibosCount = recibosFiltrados.length;
  const totalRecibosValor = recibosFiltrados.reduce((acc, r) => acc + r.valorTotal, 0);
  const totalRecibosTaxas = recibosFiltrados.reduce((acc, r) => acc + r.valorTaxas, 0);

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
      const rows = (await fetchRelatorioProdutos({
        dataInicio: dataInicio || "",
        dataFim: dataFim || "",
        status: statusFiltro,
        busca: buscaProduto,
        cidadeId: cidadeFiltro || "",
        vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
        ordem: ordenacao,
        ordemDesc,
        page: paginaAtual,
        pageSize,
      })) as any[];
      const mapped = rows.map((row) => ({
        produto_id: row.produto_id,
        produto_nome: row.produto_nome || "(sem produto)",
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
      setErro("Erro ao carregar vendas para relatório por produto.");
      setLinhas([]);
      setTotalLinhas(0);
      setTotalGeral(0);
      setTotalQtd(0);
    } finally {
      setLoading(false);
    }
  }

  async function carregarTodasLinhas(): Promise<LinhaProduto[]> {
    if (!userCtx) return [];
    const pageSizeExport = 500;
    let pagina = 1;
    const todas: LinhaProduto[] = [];

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
      const rows = (await fetchRelatorioProdutos({
        dataInicio: dataInicio || "",
        dataFim: dataFim || "",
        status: statusFiltro,
        busca: buscaProduto,
        cidadeId: cidadeFiltro || "",
        vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
        ordem: ordenacao,
        ordemDesc,
        page: pagina,
        pageSize: pageSizeExport,
        noCache: true,
      })) as any[];
      const mapped = rows.map((row) => ({
        produto_id: row.produto_id,
        produto_nome: row.produto_nome || "(sem produto)",
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

  async function carregarRecibos(opts?: { noCache?: boolean }) {
    if (!userCtx) return [] as Venda[];
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
        setVendas([]);
        return;
      }

      const rows = (await fetchRelatorioProdutosRecibos({
        dataInicio: dataInicio || "",
        dataFim: dataFim || "",
        status: statusFiltro,
        vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
        noCache: opts?.noCache,
      })) as any[];
      setVendas((rows || []) as Venda[]);
      return rows as Venda[];
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar vendas para relatório por produto.");
      return [] as Venda[];
    } finally {
      setLoading(false);
    }
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
    if (userCtx && activeTab === "agrupado") {
      carregarResumo();
    }
  }, [
    userCtx,
    activeTab,
    page,
    pageSize,
    dataInicio,
    dataFim,
    statusFiltro,
    buscaProduto,
    cidadeFiltro,
    ordenacao,
    ordemDesc,
    vendedorSelecionado,
    masterScope.vendedorSelecionado,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
    masterScope.vendedorIds,
  ]);

  useEffect(() => {
    if (userCtx && activeTab === "recibos") {
      carregarRecibos();
    }
  }, [
    userCtx,
    activeTab,
    dataInicio,
    dataFim,
    statusFiltro,
    vendedorSelecionado,
    masterScope.vendedorSelecionado,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
    masterScope.vendedorIds,
  ]);

  useEffect(() => {
    if (activeTab === "agrupado") {
      setPage(1);
    }
  }, [
    activeTab,
    dataInicio,
    dataFim,
    statusFiltro,
    buscaProduto,
    cidadeFiltro,
    ordenacao,
    ordemDesc,
    vendedorSelecionado,
    masterScope.vendedorSelecionado,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
    masterScope.vendedorIds,
  ]);

  useEffect(() => {
    if (activeTab === "agrupado" && page > totalPaginas) {
      setPage(totalPaginas);
    }
  }, [activeTab, page, totalPaginas]);

  async function exportarCSV() {
    if (exportando) return;
    setExportando(true);
    try {
      let header: string[] = [];
      let rows: string[][] = [];
      let fileBase = "relatorio-vendas-por-produto";

      if (activeTab === "agrupado") {
        const linhasExport = await carregarTodasLinhas();
        if (linhasExport.length === 0) {
          showToast("Não há dados para exportar.", "warning");
          return;
        }

        header = ["produto", "quantidade", "total", "ticket_medio"];
        rows = linhasExport.map((l) => [
          l.produto_nome,
          l.quantidade.toString(),
          l.total.toFixed(2).replace(".", ","),
          l.ticketMedio.toFixed(2).replace(".", ","),
        ]);
      } else {
        const vendasExport = await carregarRecibos({ noCache: true });
        const recibosExport = buildRecibosDetalhados({
          vendas: vendasExport,
          tipoProdutosNomeMap,
          cidadesMap,
          statusFiltro,
        });
        const hasTerm = buscaProduto.trim().length > 0;
        const term = normalizeText(buscaProduto);
        const recibosExportFiltrados = recibosExport.filter((recibo) => {
          if (cidadeFiltro && recibo.cidadeId !== cidadeFiltro) {
            return false;
          }
          if (tipoReciboSelecionado && recibo.tipoId !== tipoReciboSelecionado) {
            return false;
          }
          if (!hasTerm) return true;
          const destino = normalizeText(recibo.destinoNome || "");
          const produto = normalizeText(recibo.produtoNome || "");
          return destino.includes(term) || produto.includes(term);
        });

        if (recibosExportFiltrados.length === 0) {
          showToast("Não há dados para exportar.", "warning");
          return;
        }

        header = ["recibo", "produto", "cidade", "destino", "data_venda", "valor_total", "taxas"];
        rows = recibosExportFiltrados.map((recibo) => [
          recibo.numeroRecibo || "",
          recibo.produtoNome,
          recibo.cidadeNome || "",
          recibo.destinoNome || "",
          recibo.dataVenda ? recibo.dataVenda.split("T")[0] : "",
          recibo.valorTotal.toFixed(2).replace(".", ","),
          recibo.valorTaxas.toFixed(2).replace(".", ","),
        ]);
        fileBase = "relatorio-produtos-por-recibo";
      }

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
      link.setAttribute("download", `${fileBase}-${ts}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  async function exportarExcel() {
    if (exportando) return;
    if (!exportFlags.excel) {
      showToast("Exportação Excel desabilitada nos parâmetros.", "warning");
      return;
    }
    setExportando(true);

    try {
      const module = await import("xlsx");
      const XLSX = (module as any).default ?? module;

      if (activeTab === "agrupado") {
        const linhasExport = await carregarTodasLinhas();
        if (linhasExport.length === 0) {
          showToast("Não há dados para exportar.", "warning");
          return;
        }

        const data = linhasExport.map((l) => ({
          "Tipo de Produto": l.produto_nome,
          Quantidade: l.quantidade,
          "Faturamento (R$)": l.total,
          "Ticket médio (R$)": l.ticketMedio,
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resumo por Produto");

        const ts = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
        XLSX.writeFile(wb, `relatorio-produtos-${ts}.xlsx`);
        return;
      }

      const vendasExport = await carregarRecibos({ noCache: true });
      const recibosExport = buildRecibosDetalhados({
        vendas: vendasExport,
        tipoProdutosNomeMap,
        cidadesMap,
        statusFiltro,
      });
      const hasTerm = buscaProduto.trim().length > 0;
      const term = normalizeText(buscaProduto);
      const recibosExportFiltrados = recibosExport.filter((recibo) => {
        if (cidadeFiltro && recibo.cidadeId !== cidadeFiltro) {
          return false;
        }
        if (tipoReciboSelecionado && recibo.tipoId !== tipoReciboSelecionado) {
          return false;
        }
        if (!hasTerm) return true;
        const destino = normalizeText(recibo.destinoNome || "");
        const produto = normalizeText(recibo.produtoNome || "");
        return destino.includes(term) || produto.includes(term);
      });

      if (recibosExportFiltrados.length === 0) {
        showToast("Não há dados para exportar.", "warning");
        return;
      }

      const data = recibosExportFiltrados.map((recibo) => ({
        Recibo: recibo.numeroRecibo || "",
        Produto: recibo.produtoNome,
        Cidade: recibo.cidadeNome || "",
        Destino: recibo.destinoNome || "",
        "Data venda": recibo.dataVenda ? recibo.dataVenda.split("T")[0] : "",
        "Valor total": recibo.valorTotal,
        Taxas: recibo.valorTaxas,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Produtos por recibo");

      const ts = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
      XLSX.writeFile(wb, `relatorio-produtos-recibo-${ts}.xlsx`);
    } catch (e) {
      console.error("Erro ao exportar Excel:", e);
      showToast("Não foi possível exportar Excel. Recarregue a página e tente novamente.", "error");
    } finally {
      setExportando(false);
    }
  }

  async function exportarPDF() {
    if (!exportFlags.pdf) {
      showToast("Exportação PDF desabilitada nos parâmetros.", "warning");
      return;
    }

    const subtitle =
      dataInicio && dataFim
        ? `Período: ${formatarDataParaExibicao(
            dataInicio
          )} até ${formatarDataParaExibicao(dataFim)}`
        : dataInicio
        ? `A partir de ${formatarDataParaExibicao(dataInicio)}`
        : dataFim
        ? `Até ${formatarDataParaExibicao(dataFim)}`
        : undefined;

    if (activeTab === "agrupado") {
      const linhasExport = await carregarTodasLinhas();
      if (linhasExport.length === 0) {
        showToast("Não há dados para exportar.", "warning");
        return;
      }

      const headers = ["Tipo de Produto", "Qtde", "Faturamento", "Ticket médio"];
      const rows = linhasExport.map((l) => [
        l.produto_nome,
        l.quantidade,
        formatCurrency(l.total),
        formatCurrency(l.ticketMedio),
      ]);

      try {
        await exportTableToPDF({
          title: "Vendas por Produto",
          subtitle,
          headers,
          rows,
          fileName: "relatorio-vendas-por-produto",
          orientation: "landscape",
        });
      } catch (error) {
        console.error("Erro ao exportar PDF:", error);
        showToast("Não foi possível exportar PDF. Recarregue a página e tente novamente.", "error");
      }
      return;
    }

    if (recibosFiltrados.length === 0) {
      showToast("Não há dados para exportar.", "warning");
      return;
    }

	    const headers = [
	      "Recibo",
	      "Produto",
	      "Cidade",
	      "Destino",
	      "Data venda",
	      "Valor total",
	      "Taxas",
	    ];
	    const rows = recibosFiltrados.map((recibo) => [
	      recibo.numeroRecibo || "-",
	      recibo.produtoNome,
	      recibo.cidadeNome || "-",
	      recibo.destinoNome || "-",
	      recibo.dataVenda ? recibo.dataVenda.split("T")[0] : "-",
	      formatCurrency(recibo.valorTotal),
	      formatCurrency(recibo.valorTaxas),
	    ]);

    try {
      await exportTableToPDF({
        title: "Produtos por Recibo",
        subtitle,
        headers,
        rows,
        fileName: "relatorio-produtos-por-recibo",
        orientation: "landscape",
      });
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      showToast("Não foi possível exportar PDF. Recarregue a página e tente novamente.", "error");
    }
  }

  async function exportarSelecionado() {
    if (exportTipo === "csv") {
      await exportarCSV();
      return;
    }
    if (exportTipo === "excel") {
      await exportarExcel();
      return;
    }
    await exportarPDF();
  }

  const exportDisabled =
    (exportTipo === "excel" && !exportFlags.excel) ||
    (exportTipo === "pdf" && !exportFlags.pdf);

  if (loadingUser) return <LoadingUsuarioContext />;

  const aplicarFiltrosRelatorio = () => {
    if (activeTab === "agrupado") {
      setPage(1);
      carregarResumo(1);
    } else {
      carregarRecibos();
    }
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
      ? userCtx.papel === "GESTOR"
        ? "Relatório limitado à sua equipe."
        : userCtx.papel === "MASTER"
        ? "Relatório limitado ao seu portfólio selecionado."
        : "Relatório limitado à suas vendas."
      : null;

  const renderCidadeField = () => (
    <div className="vtur-city-picker">
      <AppField
        label="Cidade"
        placeholder="Digite a cidade"
        value={cidadeNomeInput}
        onChange={(e) => {
          const value = e.target.value;
          setCidadeNomeInput(value);
          setCidadeFiltro("");
          if (value.trim().length > 0) {
            setMostrarSugestoesCidadeFiltro(true);
          }
        }}
        onFocus={() => {
          if (cidadeNomeInput.trim().length >= 2) {
            setMostrarSugestoesCidadeFiltro(true);
          }
        }}
        onBlur={() => {
          setTimeout(() => setMostrarSugestoesCidadeFiltro(false), 150);
          if (!cidadeNomeInput.trim()) {
            setCidadeFiltro("");
            return;
          }
          const match = cidadesLista.find(
            (cidade) => normalizeText(cidade.nome) === normalizeText(cidadeNomeInput)
          );
          if (match) {
            setCidadeFiltro(match.id);
            setCidadeNomeInput(match.nome);
          }
        }}
      />
      {mostrarSugestoesCidadeFiltro && cidadeNomeInput.trim().length >= 1 ? (
        <div className="vtur-city-dropdown vtur-quote-client-dropdown">
          {buscandoCidade ? <div className="vtur-subdivisao-helper">Buscando cidades...</div> : null}
          {!buscandoCidade && erroCidade ? (
            <div className="vtur-subdivisao-helper">{erroCidade}</div>
          ) : null}
          {!buscandoCidade && !erroCidade && cidadeSugestoes.length === 0 ? (
            <div className="vtur-subdivisao-helper">Nenhuma cidade encontrada.</div>
          ) : null}
          {!buscandoCidade &&
            !erroCidade &&
            cidadeSugestoes.map((cidade) => (
              <AppButton
                key={cidade.id}
                type="button"
                variant="ghost"
                className="vtur-city-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCidadeFiltro(cidade.id);
                  setCidadeNomeInput(cidade.nome);
                  setMostrarSugestoesCidadeFiltro(false);
                }}
              >
                {cidade.nome}
              </AppButton>
            ))}
        </div>
      ) : null}
    </div>
  );

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
        {renderCidadeField()}
        {activeTab === "recibos" ? (
          <AppField
            as="select"
            label="Tipo de produto"
            value={tipoReciboSelecionado}
            onChange={(e) => setTipoReciboSelecionado(e.target.value)}
            options={[
              { label: "Todos os tipos", value: "" },
              ...produtos.map((produto) => ({
                label: produto.nome || produto.tipo || produto.id,
                value: produto.id,
              })),
            ]}
          />
        ) : null}
        <AppField
          label="Buscar produto"
          placeholder={activeTab === "recibos" ? "Produto ou destino" : "Nome do produto"}
          value={buscaProduto}
          onChange={(e) => setBuscaProduto(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 16 }}>{renderPeriodButtons()}</div>
    </>
  );

  return (
    <AppPrimerProvider>
      <div className="relatorio-vendas-produto-page page-content-wrap">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        <AppCard
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Vendas por Produto"
          subtitle={`Gerencie indicadores por produto com visao de CRM. Periodo: ${periodoResumo}. ${activeTab === "recibos" ? "Visao por recibo." : "Resumo consolidado por tipo de produto."}`}
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
        </AppCard>

        <AppCard className="mb-3" title="Modo de leitura" subtitle="Alterne entre a consolidação por tipo e a visão analítica por recibo.">
          <div className="vtur-quote-top-actions">
            {tabOptions.map((tab) => (
              <AppButton
                key={tab.id}
                type="button"
                variant={activeTab === tab.id ? "primary" : "secondary"}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
              >
                {tab.label}
              </AppButton>
            ))}
          </div>
        </AppCard>

        {showFilters ? (
          <Dialog
            title="Filtros do relatório"
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
                subtitle="Ajuste datas, escopo, cidade, status e filtros de produto antes de atualizar o relatório."
              >
                {renderFiltersGrid()}
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        {showExport ? (
          <Dialog
            title="Exportar relatório"
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
                title="Formato da exportação"
                subtitle="Escolha o formato final respeitando as permissões definidas nos parâmetros da empresa."
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
                      O formato selecionado está desabilitado nos parâmetros da empresa.
                    </AlertMessage>
                  </div>
                ) : null}
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        {escopoResumo ? (
          <AlertMessage variant="warning" className="mb-3 vtur-alert-inline">
            {escopoResumo}
          </AlertMessage>
        ) : null}

        {erro ? (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        ) : null}

        {activeTab === "agrupado" ? (
          <AppCard
            title="Resumo por tipo de produto"
            subtitle="Quantidade, faturamento e ticket médio consolidados no recorte atual."
          >
            <div className="vtur-quote-summary-grid">
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Tipos listados</span>
                <strong>{totalLinhas}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Quantidade</span>
                <strong>{totalQtd}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Faturamento</span>
                <strong>{formatCurrency(totalGeral)}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Ticket médio</span>
                <strong>{formatCurrency(ticketGeral)}</strong>
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
                  <th>Tipo de Produto</th>
                  <th style={{ cursor: "pointer" }} onClick={() => mudarOrdenacao("quantidade")}>
                    Qtde {ordenacao === "quantidade" ? (ordemDesc ? "↓" : "↑") : ""}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => mudarOrdenacao("total")}>
                    Faturamento {ordenacao === "total" ? (ordemDesc ? "↓" : "↑") : ""}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => mudarOrdenacao("ticket")}>
                    Ticket médio {ordenacao === "ticket" ? (ordemDesc ? "↓" : "↑") : ""}
                  </th>
                </tr>
              }
              loading={loading}
              loadingMessage="Carregando consolidação por produto..."
              empty={!loading && linhasExibidas.length === 0}
              emptyMessage={
                <EmptyState
                  title="Nenhum produto encontrado"
                  description="Ajuste datas, escopo ou busca para ampliar o recorte do relatório."
                />
              }
              colSpan={4}
              className="table-header-blue table-mobile-cards min-w-[620px]"
            >
              {linhasExibidas.map((linha, idx) => (
                <tr key={linha.produto_id ?? `sem-${idx}`}>
                  <td data-label="Tipo de Produto">{linha.produto_nome}</td>
                  <td data-label="Qtde">{linha.quantidade}</td>
                  <td data-label="Faturamento">{formatCurrency(linha.total)}</td>
                  <td data-label="Ticket médio">{formatCurrency(linha.ticketMedio)}</td>
                </tr>
              ))}
            </DataTable>
          </AppCard>
        ) : (
          <AppCard
            title="Produtos por recibo"
            subtitle="Visão analítica dos recibos com produto, cidade, destino, valor total e taxas."
          >
            <div className="vtur-quote-summary-grid">
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Recibos</span>
                <strong>{totalRecibosCount}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Total recebido</span>
                <strong>{formatCurrency(totalRecibosValor)}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Taxas</span>
                <strong>{formatCurrency(totalRecibosTaxas)}</strong>
              </div>
              <div className="vtur-quote-summary-item">
                <span className="vtur-quote-summary-label">Líquido</span>
                <strong>{formatCurrency(totalRecibosValor - totalRecibosTaxas)}</strong>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <DataTable
                headers={
                  <tr>
                    <th>Recibo</th>
                    <th>Produto</th>
                    <th>Cidade</th>
                    <th>Destino</th>
                    <th>Data venda</th>
                    <th style={{ textAlign: "right" }}>Valor total</th>
                    <th style={{ textAlign: "right" }}>Taxas</th>
                  </tr>
                }
                loading={loading}
                loadingMessage="Carregando recibos..."
                empty={!loading && recibosExibidos.length === 0}
                emptyMessage={
                  <EmptyState
                    title="Nenhum recibo encontrado"
                    description="Ajuste os filtros de data, cidade, status ou produto para ampliar o recorte."
                  />
                }
                colSpan={7}
                className="table-header-blue table-mobile-cards min-w-[720px]"
              >
                {recibosExibidos.map((recibo) => {
                  const dataLabel = recibo.dataVenda ? recibo.dataVenda.split("T")[0] : "-";
                  return (
                    <tr key={recibo.rowId}>
                      <td data-label="Recibo">{recibo.numeroRecibo || "-"}</td>
                      <td data-label="Produto">{recibo.produtoNome}</td>
                      <td data-label="Cidade">{recibo.cidadeNome || "-"}</td>
                      <td data-label="Destino">{recibo.destinoNome || "-"}</td>
                      <td data-label="Data venda">{dataLabel}</td>
                      <td data-label="Valor total" style={{ textAlign: "right" }}>
                        {formatCurrency(recibo.valorTotal)}
                      </td>
                      <td data-label="Taxas" style={{ textAlign: "right" }}>
                        {formatCurrency(recibo.valorTaxas)}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
          </AppCard>
        )}
      </div>
    </AppPrimerProvider>
  );
}
