import { Dialog } from "../ui/primer/legacyCompat";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchApiJsonWithPersistentCache } from "../../lib/apiPersistentCache";
import { exportTableToPDF } from "../../lib/pdf";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { fetchCidadesByApiWithCache } from "../../lib/cidadesSearchApiCache";
import { normalizeText } from "../../lib/normalizeText";
import { cleanTipoPacoteForRule, normalizeTipoPacoteRuleKey } from "../../lib/tipoPacote";
import { matchesCpfSearch } from "../../lib/searchNormalization";
import { formatCurrencyBRL, formatDateBR, formatNumberBR } from "../../lib/format";
import {
  ParametrosComissao,
  Regra,
  RegraProduto,
  calcularPctFixoProduto,
  calcularPctPorRegra,
  calcularDescontoAplicado,
  hasConciliacaoCommissionRule,
  regraProdutoTemFixo,
  resolveConciliacaoCommissionSelection,
} from "../../lib/comissaoUtils";
import { carregarTermosNaoComissionaveis, calcularNaoComissionavelPorVenda } from "../../lib/pagamentoUtils";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { ToastStack, useToastQueue } from "../ui/Toast";
import PaginationControls from "../ui/PaginationControls";
import { useMasterScope } from "../../lib/useMasterScope";
import { fetchGestorEquipeIdsComGestor } from "../../lib/gestorEquipe";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import { getVendasCacheVersion } from "../../lib/vendasCacheVersion";
import { filterRecibosCanceladosMesmoMes } from "../../lib/conciliacao/source";

type Cliente = {
  id: string;
  nome: string;
  cpf: string | null;
};

type Produto = {
  id: string;
  nome: string | null;
  tipo_produto: string | null;
  cidade_id: string | null;
  todas_as_cidades?: boolean | null;
  regra_comissionamento?: string | null;
  soma_na_meta?: boolean | null;
  usa_meta_produto?: boolean | null;
  meta_produto_valor?: number | null;
  comissao_produto_meta_pct?: number | null;
  descontar_meta_geral?: boolean | null;
  exibe_kpi_comissao?: boolean | null;
};

type TipoProduto = {
  id: string;
  nome: string | null;
  tipo: string | null;
  regra_comissionamento?: string | null;
  soma_na_meta?: boolean | null;
  usa_meta_produto?: boolean | null;
  meta_produto_valor?: number | null;
  comissao_produto_meta_pct?: number | null;
  descontar_meta_geral?: boolean | null;
  exibe_kpi_comissao?: boolean | null;
};

type Cidade = {
  id: string;
  nome: string;
};

type MetaVendedor = {
  id: string;
  meta_geral: number;
  periodo?: string;
};

type MetaProduto = {
  produto_id: string;
  valor: number;
};

type Venda = {
  id: string;
  numero_venda: string | null;
  cliente_id: string;
  destino_id: string;
  destino_cidade_id?: string | null;
  produto_id: string | null;
  data_venda: string;
  data_embarque: string | null;
  valor_total: number | null;
  valor_total_bruto?: number | null;
  valor_total_pago?: number | null;
  desconto_comercial_valor?: number | null;
  valor_nao_comissionado?: number | null;
  cancelada?: boolean | null;
  status: string | null;
  vendas_recibos?: {
    id?: string | null;
    numero_recibo: string | null;
    data_venda?: string | null;
    valor_total: number | null;
    valor_taxas: number | null;
    valor_du?: number | null;
    valor_rav?: number | null;
    produto_id: string | null;
    tipo_pacote?: string | null;
    valor_bruto_override?: number | null;
    valor_meta_override?: number | null;
    valor_liquido_override?: number | null;
    valor_comissao_loja?: number | null;
    percentual_comissao_loja?: number | null;
    faixa_comissao?: string | null;
    cancelado_por_conciliacao_em?: string | null;
    cancelado_por_conciliacao_observacao?: string | null;
    produto_resolvido_id?: string | null;
    tipo_produtos?: { id: string; nome: string | null; tipo: string | null } | null;
    produto_resolvido?: { id: string; nome: string | null; tipo: string | null } | null;
  }[];
  destino_produto?: { id: string; nome: string | null; tipo?: string | null } | null;
  cliente?: { nome: string | null; cpf: string | null } | null;
  destino?: { nome: string | null } | null;
  destino_cidade?: { nome: string | null } | null;
};

type ReciboEnriquecido = {
  id: string;
  venda_id: string;
  cliente_id: string;
  numero_venda: string | null;
  cliente_nome: string;
  cliente_cpf: string;
  destino_nome: string;
  produto_nome: string;
  produto_tipo: string;
  produto_tipo_id: string | null;
  produto_comissao_id?: string | null;
  produto_id: string | null;
  cidade_nome: string;
  cidade_id: string | null;
  data_venda_recibo?: string | null;
  data_venda_venda?: string | null;
  data_venda: string;
  data_embarque: string | null;
  numero_recibo: string | null;
  valor_total: number;
  valor_comissionavel: number | null;
  valor_taxas: number | null;
  valor_du?: number | null;
  valor_rav?: number | null;
  valor_bruto_override?: number | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
  valor_comissao_loja?: number | null;
  percentual_comissao_loja?: number | null;
  faixa_comissao?: string | null;
  tipo_pacote?: string | null;
  venda_cancelada?: boolean | null;
  status: string | null;
};

function hasConciliacaoOverride(r: {
  valor_bruto_override?: number | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
}) {
  return (
    r.valor_bruto_override != null ||
    r.valor_meta_override != null ||
    r.valor_liquido_override != null
  );
}

function getBrutoRecibo(r: { valor_total?: number | null; valor_bruto_override?: number | null }) {
  if (hasConciliacaoOverride(r)) {
    return Math.max(0, Number(r.valor_bruto_override ?? r.valor_total ?? 0));
  }
  return Math.max(0, Number(r.valor_total ?? 0));
}

function getBrutoSemRav(r: {
  valor_total?: number | null;
  valor_rav?: number | null;
  valor_bruto_override?: number | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
}) {
  // Espelha operacao/comissionamento: base sem RAV parte de valor_total original.
  return Math.max(0, Number(r.valor_total || 0) - Number(r.valor_rav || 0));
}

function getTaxasEfetivas(r: {
  valor_taxas?: number | null;
  valor_du?: number | null;
  valor_bruto_override?: number | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
}) {
  if (hasConciliacaoOverride(r)) {
    return Math.max(0, Number(r.valor_taxas ?? 0));
  }
  const taxasBrutas = Math.max(0, Number(r.valor_taxas ?? 0));
  const du = Math.max(0, Number(r.valor_du ?? 0));
  return Math.max(0, taxasBrutas - du);
}

function getLiquidoComissionavel(r: {
  valor_total?: number | null;
  valor_rav?: number | null;
  valor_taxas?: number | null;
  valor_du?: number | null;
  valor_bruto_override?: number | null;
  valor_meta_override?: number | null;
  valor_liquido_override?: number | null;
}) {
  if (r.valor_liquido_override != null) {
    return Math.max(0, Number(r.valor_liquido_override || 0));
  }
  return Math.max(0, getBrutoSemRav(r) - getTaxasEfetivas(r));
}

function getMetaRecibo(
  r: {
    valor_total?: number | null;
    valor_rav?: number | null;
    valor_taxas?: number | null;
    valor_du?: number | null;
    valor_bruto_override?: number | null;
    valor_meta_override?: number | null;
    valor_liquido_override?: number | null;
  },
  params: ParametrosComissao
) {
  if (r.valor_meta_override != null) {
    return Math.max(0, Number(r.valor_meta_override || 0));
  }
  const liquido = getLiquidoComissionavel(r);
  return params.foco_valor === "liquido"
    ? liquido
    : params.usar_taxas_na_meta
    ? getBrutoRecibo(r)
    : liquido;
}

function isStatusCancelado(status?: string | null, vendaCancelada?: boolean | null) {
  if (vendaCancelada === true) return true;
  return String(status || "").trim().toLowerCase() === "cancelado";
}

function normalizarDataIso(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.includes("T") ? raw.slice(0, 10) : raw;
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso) ? iso : "";
}

function reciboDentroDoPeriodo(
  recibo: { data_venda_recibo?: string | null },
  inicio?: string | null,
  fim?: string | null
) {
  // Espelha operacao/comissionamento:
  // o recorte usa data do recibo; sem data do recibo, não entra no período.
  const data = normalizarDataIso(recibo.data_venda_recibo);
  if (!data) return false;
  const ini = normalizarDataIso(inicio);
  const end = normalizarDataIso(fim);
  if (ini && data < ini) return false;
  if (end && data > end) return false;
  return true;
}

type StatusFiltro = "todos" | "aberto" | "confirmado" | "cancelado";
type PeriodoPreset =
  | "hoje"
  | "7"
  | "30"
  | "mes_atual"
  | "mes_anterior"
  | "personalizado"
  | "limpar"
  | "";

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

type UserCtx = {
  usuarioId: string;
  papel: Papel;
  vendedorIds: string[];
  companyId: string | null;
};

type ExportFlags = {
  pdf: boolean;
  excel: boolean;
};

function hojeISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

async function fetchRelatorioBase() {
  const { data: auth } = await supabase.auth.getUser();
  const cacheIdentity = auth?.user?.id || "anon";
  return fetchApiJsonWithPersistentCache<{
    clientes: Cliente[];
    produtos: Produto[];
    tiposProdutos: TipoProduto[];
    cidades: Cidade[];
  }>({
    endpoint: "/api/v1/relatorios/base",
    cacheScope: "relatorios-base",
    cacheKey: `v2:${cacheIdentity}`,
    persistentTtlMs: 6 * 60 * 60 * 1000,
    queryLiteTtlMs: 60_000,
  });
}

async function fetchRelatorioVendas(params: {
  dataInicio?: string;
  dataFim?: string;
  status?: string;
  clienteId?: string | null;
  valorMin?: string;
  valorMax?: string;
  vendedorIds?: string[] | null;
  page: number;
  pageSize: number;
  all?: boolean;
  noCache?: boolean;
  includePagamentos?: boolean;
  cacheRevision?: string;
}) {
  const qs = new URLSearchParams();
  if (params.dataInicio) qs.set("inicio", params.dataInicio);
  if (params.dataFim) qs.set("fim", params.dataFim);
  if (params.status && params.status !== "todos") qs.set("status", params.status);
  if (params.clienteId) qs.set("cliente_id", params.clienteId);
  if (params.valorMin) qs.set("valor_min", params.valorMin);
  if (params.valorMax) qs.set("valor_max", params.valorMax);
  if (params.vendedorIds && params.vendedorIds.length > 0) {
    qs.set("vendedor_ids", params.vendedorIds.join(","));
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.all) qs.set("all", "1");
  if (params.noCache) qs.set("no_cache", "1");
  if (params.includePagamentos) qs.set("include_pagamentos", "1");
  if (params.cacheRevision && params.cacheRevision !== "0") qs.set("rev", params.cacheRevision);

  const resp = await fetch(`/api/v1/relatorios/vendas?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  const data = await resp.json();
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: typeof data?.total === "number" ? data.total : 0,
    pagamentosNaoComissionaveis: data?.pagamentosNaoComissionaveis ?? null,
  } as {
    items: Venda[];
    total: number;
    pagamentosNaoComissionaveis?: Record<string, number> | null;
  };
}

function pagamentosMapFromPayload(payload?: Record<string, number> | null) {
  const map = new Map<string, number>();
  if (!payload) return map;
  Object.entries(payload).forEach(([id, value]) => {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return;
    map.set(id, parsed);
  });
  return map;
}

async function fetchCidadesSugestoes(params: {
  query: string;
  limite?: number;
  signal?: AbortSignal;
}) {
  return fetchCidadesByApiWithCache({
    query: params.query,
    limit: params.limite ?? 8,
    signal: params.signal,
    cacheNamespace: "relatorio-vendas",
    endpoints: ["/api/v1/relatorios/cidades-busca"],
  });
}

function csvEscape(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function isTodosFiltro(value?: string) {
  return !value || value === "todos" || value === "all";
}

function isSeguroRecibo(recibo: ReciboEnriquecido) {
  const tipo = (recibo.produto_tipo || "").toLowerCase();
  const nome = (recibo.produto_nome || "").toLowerCase();
  return tipo.includes("seguro") || nome.includes("seguro");
}

async function carregarPagamentosNaoComissionaveis(
  vendaIds: string[],
  supabaseClient: typeof supabase
) {
  if (!vendaIds.length) return new Map<string, number>();
  const { data, error } = await supabaseClient
    .from("vendas_pagamentos")
    .select("venda_id, valor_total, valor_bruto, desconto_valor, paga_comissao, forma_nome")
    .in("venda_id", vendaIds);
  if (error) {
    console.error("Erro ao carregar pagamentos:", error);
    return new Map<string, number>();
  }
  const termosNaoComissionaveis = await carregarTermosNaoComissionaveis();
  return calcularNaoComissionavelPorVenda((data || []) as any[], termosNaoComissionaveis);
}

function getPeriodosMeses(inicio: string, fim: string) {
  const parse = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  let start = parse(inicio) || new Date();
  let end = parse(fim) || new Date();
  if (end < start) {
    [start, end] = [end, start];
  }
  const meses: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (current <= last) {
    const label = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-01`;
    meses.push(label);
    current.setMonth(current.getMonth() + 1);
  }
  if (meses.length === 0) {
    const fallback = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    meses.push(fallback);
  }
  return meses;
}

export default function RelatorioVendasIsland() {
  const mesAtualInicio = formatISO(startOfMonth(new Date()));
  const mesAtualFim = formatISO(endOfMonth(new Date()));
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tiposProdutos, setTiposProdutos] = useState<TipoProduto[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);

  const [clienteBusca, setClienteBusca] = useState("");
  const [destinoBusca, setDestinoBusca] = useState("");

  const [cidadeNomeInput, setCidadeNomeInput] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");
  const [mostrarSugestoesCidade, setMostrarSugestoesCidade] = useState(false);
  const [cidadeSugestoes, setCidadeSugestoes] = useState<Cidade[]>([]);
  const [buscandoCidade, setBuscandoCidade] = useState(false);
  const [erroCidade, setErroCidade] = useState<string | null>(null);

  const [tipoSelecionadoId, setTipoSelecionadoId] = useState("");

  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);

  const [dataInicio, setDataInicio] = useState<string>(mesAtualInicio);
  const [dataFim, setDataFim] = useState<string>(mesAtualFim);
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("mes_atual");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [valorMin, setValorMin] = useState<string>("");
  const [valorMax, setValorMax] = useState<string>("");
  const [vendedoresEquipe, setVendedoresEquipe] = useState<{ id: string; nome_completo: string }[]>([]);
  const [vendedorFiltro, setVendedorFiltro] = useState<string>("todos");

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [pagamentosNaoComissionaveis, setPagamentosNaoComissionaveis] = useState<Map<string, number>>(new Map());
  const [vendasResumoData, setVendasResumoData] = useState<Venda[]>([]);
  const [pagamentosResumoData, setPagamentosResumoData] = useState<Map<string, number>>(new Map());
  const [resumoDataKey, setResumoDataKey] = useState<string>("");
  const [vendasBaseComissaoData, setVendasBaseComissaoData] = useState<Venda[]>([]);
  const [pagamentosBaseComissaoData, setPagamentosBaseComissaoData] = useState<Map<string, number>>(new Map());
  const [recibosBaseComissao, setRecibosBaseComissao] = useState<ReciboEnriquecido[]>([]);
  const [recibosBaseComissaoKey, setRecibosBaseComissaoKey] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [userCtx, setUserCtx] = useState<UserCtx | null>(null);
  const isMaster = userCtx?.papel === "MASTER";
  const masterScope = useMasterScope(Boolean(isMaster));
  const [loadingUser, setLoadingUser] = useState(true);
  const [exportFlags, setExportFlags] = useState<ExportFlags>({ pdf: true, excel: true });
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalVendasDb, setTotalVendasDb] = useState(0);
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportTipo, setExportTipo] = useState<"csv" | "excel" | "pdf">("csv");
  const [parametrosComissao, setParametrosComissao] =
    useState<ParametrosComissao | null>(null);
  const [regrasCommission, setRegrasCommission] = useState<Record<string, Regra>>(
    {}
  );
  const [regraProdutoMap, setRegraProdutoMap] = useState<
    Record<string, RegraProduto>
  >({});
  const [regraProdutoPacoteMap, setRegraProdutoPacoteMap] = useState<
    Record<string, Record<string, RegraProduto>>
  >({});
  const [metaPlanejada, setMetaPlanejada] = useState<number>(0);
  const [metaProdutoMap, setMetaProdutoMap] = useState<Record<string, number>>(
    {}
  );
  const [, setCommissionLoading] = useState(false);
  const [, setCommissionErro] = useState<string | null>(null);
  const metaProdEnabled = import.meta.env.PUBLIC_META_PRODUTO_ENABLED !== "false";
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

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
        const companyId = (usuarioDb as any)?.company_id || null;

        let papel: Papel = "VENDEDOR";
        if (tipoNorm.includes("ADMIN")) papel = "ADMIN";
        else if (tipoNorm.includes("MASTER")) papel = "MASTER";
        else if (tipoNorm.includes("GESTOR")) papel = "GESTOR";
        else if (tipoNorm.includes("VENDEDOR")) papel = "VENDEDOR";
        else papel = "OUTRO";

        let vendedorIds: string[] = [userId];
        if (papel === "GESTOR") {
          vendedorIds = await fetchGestorEquipeIdsComGestor(userId);
        } else if (papel === "MASTER") {
          vendedorIds = [];
        } else if (papel === "ADMIN") {
          vendedorIds = [];
        }

        const defaultParametros: ParametrosComissao = {
          usar_taxas_na_meta: true,
          foco_valor: "bruto",
          foco_faturamento: "bruto",
          conciliacao_sobrepoe_vendas: false,
          conciliacao_regra_ativa: false,
          conciliacao_tipo: "GERAL",
          conciliacao_meta_nao_atingida: null,
          conciliacao_meta_atingida: null,
          conciliacao_super_meta: null,
          conciliacao_tiers: [],
          conciliacao_faixas_loja: [],
        };
        if (companyId) {
          const { data: params } = await supabase
            .from("parametros_comissao")
            .select(
              "exportacao_pdf, exportacao_excel, usar_taxas_na_meta, foco_valor, foco_faturamento, conciliacao_sobrepoe_vendas, conciliacao_regra_ativa, conciliacao_tipo, conciliacao_meta_nao_atingida, conciliacao_meta_atingida, conciliacao_super_meta, conciliacao_tiers, conciliacao_faixas_loja"
            )
            .eq("company_id", companyId)
            .maybeSingle();
          if (params) {
            setExportFlags({
              pdf: params.exportacao_pdf ?? true,
              excel: params.exportacao_excel ?? true,
            });
            setParametrosComissao({
              usar_taxas_na_meta: !!params.usar_taxas_na_meta,
              foco_valor: params.foco_valor === "liquido" ? "liquido" : "bruto",
              foco_faturamento:
                params.foco_faturamento === "liquido" ? "liquido" : "bruto",
              conciliacao_sobrepoe_vendas: Boolean(params.conciliacao_sobrepoe_vendas),
              conciliacao_regra_ativa: Boolean(params.conciliacao_regra_ativa),
              conciliacao_tipo:
                params.conciliacao_tipo === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL",
              conciliacao_meta_nao_atingida:
                params.conciliacao_meta_nao_atingida != null
                  ? Number(params.conciliacao_meta_nao_atingida)
                  : null,
              conciliacao_meta_atingida:
                params.conciliacao_meta_atingida != null
                  ? Number(params.conciliacao_meta_atingida)
                  : null,
              conciliacao_super_meta:
                params.conciliacao_super_meta != null
                  ? Number(params.conciliacao_super_meta)
                  : null,
              conciliacao_tiers: Array.isArray((params as any).conciliacao_tiers)
                ? ((params as any).conciliacao_tiers as ParametrosComissao["conciliacao_tiers"])
                : [],
              conciliacao_faixas_loja: Array.isArray((params as any).conciliacao_faixas_loja)
                ? ((params as any).conciliacao_faixas_loja as ParametrosComissao["conciliacao_faixas_loja"])
                : [],
            });
          } else {
            setExportFlags({ pdf: true, excel: true });
            setParametrosComissao(defaultParametros);
          }
        } else {
          setExportFlags({ pdf: true, excel: true });
          setParametrosComissao(defaultParametros);
        }

        setUserCtx({ usuarioId: userId, papel, vendedorIds, companyId });
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
    if (!userCtx || (userCtx.papel !== "GESTOR" && userCtx.papel !== "MASTER")) {
      setVendedoresEquipe([]);
      setVendedorFiltro("todos");
      return;
    }

    if (userCtx.papel === "MASTER") {
      const lista = masterScope.vendedoresDisponiveis.map((v) => ({
        id: v.id,
        nome_completo: v.nome_completo || "Vendedor",
      }));
      setVendedoresEquipe(lista);
      if (isTodosFiltro(vendedorFiltro)) {
        setVendedorFiltro("all");
      }
      return;
    }

    async function carregarVendedoresEquipe() {
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
      if (error) {
        console.error("Erro ao carregar vendedores da equipe:", error);
        setVendedoresEquipe([]);
        return;
      }
      setVendedoresEquipe((data || []) as { id: string; nome_completo: string }[]);
    }

    carregarVendedoresEquipe();
  }, [userCtx, masterScope.vendedoresDisponiveis]);

  useEffect(() => {
    if (!userCtx || userCtx.papel !== "MASTER") return;
    setUserCtx((prev) =>
      prev ? { ...prev, vendedorIds: masterScope.vendedorIds } : prev
    );
  }, [userCtx?.papel, masterScope.vendedorIds]);

  useEffect(() => {
    async function carregarBase() {
      try {
        const payload = await fetchRelatorioBase();
        setClientes((payload?.clientes || []) as Cliente[]);
        setProdutos((payload?.produtos || []) as Produto[]);
        setTiposProdutos((payload?.tiposProdutos || []) as TipoProduto[]);
        setCidades((payload?.cidades || []) as Cidade[]);
      } catch (e: any) {
        console.error(e);
        setErro(
          "Erro ao carregar bases de clientes e produtos. Verifique o Supabase."
        );
      }
    }

    carregarBase();
  }, []);

  useEffect(() => {
    if (!userCtx) return;
    carregarDadosComissao();
  }, [userCtx, dataInicio, dataFim, vendedorFiltro]);

  async function carregarDadosComissao() {
    if (!userCtx) return;
    try {
      setCommissionLoading(true);
      setCommissionErro(null);
      const periodos = getPeriodosMeses(dataInicio, dataFim);
      const vendedorIdsFiltro =
        userCtx.papel === "ADMIN"
          ? []
          : (userCtx.papel === "GESTOR" || userCtx.papel === "MASTER") &&
            !isTodosFiltro(vendedorFiltro)
          ? [vendedorFiltro]
          : userCtx.vendedorIds;

      if (userCtx.papel !== "ADMIN" && (!vendedorIdsFiltro || vendedorIdsFiltro.length === 0)) {
        setMetaPlanejada(0);
        setMetaProdutoMap({});
        setRegrasCommission({});
        setRegraProdutoMap({});
        setCommissionLoading(false);
        return;
      }
      let metasQuery = supabase
        .from("metas_vendedor")
        .select("id, meta_geral")
        .eq("scope", "vendedor")
        .in("periodo", periodos);
      if (userCtx.papel !== "ADMIN" && vendedorIdsFiltro.length > 0) {
        metasQuery = metasQuery.in("vendedor_id", vendedorIdsFiltro);
      }
      const { data: metasData, error: metasError } = await metasQuery;
      if (metasError) throw metasError;
      const metaTotal = (metasData || []).reduce(
        (acc, item) => acc + Number(item.meta_geral || 0),
        0
      );
      setMetaPlanejada(metaTotal);
      const metaIds = (metasData || []).map((item) => item.id).filter(Boolean);
      const metasProdPromise =
        metaIds.length > 0
          ? supabase
              .from("metas_vendedor_produto")
              .select("produto_id, valor")
              .in("meta_vendedor_id", metaIds)
          : Promise.resolve({ data: [], error: null as null });
      const tiposBaseCols = "id, nome, tipo";
      const tiposExtraCols =
        ", regra_comissionamento, soma_na_meta, usa_meta_produto, meta_produto_valor, comissao_produto_meta_pct, descontar_meta_geral, exibe_kpi_comissao";

      const tiposPromise = supabase
        .from("tipo_produtos")
        .select(`${tiposBaseCols}${tiposExtraCols}`)
        .order("nome", { ascending: true });

      const [
        metasProdRes,
        regrasRes,
        regrasProdRes,
        regrasProdPacoteRes,
        tiposRes,
      ] = await Promise.all([
        metasProdPromise,
        supabase
          .from("commission_rule")
          .select(
            "id, tipo, meta_nao_atingida, meta_atingida, super_meta, commission_tier (faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao)"
          ),
        supabase
          .from("product_commission_rule")
          .select("produto_id, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta"),
        supabase
          .from("product_commission_rule_pacote")
          .select("produto_id, tipo_pacote, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta"),
        tiposPromise,
      ]);
      if (metasProdRes.error) throw metasProdRes.error;
      if (regrasRes.error) throw regrasRes.error;
      if (regrasProdRes.error) throw regrasProdRes.error;
      if (regrasProdPacoteRes.error) throw regrasProdPacoteRes.error;
      let tiposData = tiposRes.data;
      if (tiposRes.error && tiposRes.error.code === "42703") {
        const fallback = await supabase
          .from("tipo_produtos")
          .select(tiposBaseCols)
          .order("nome", { ascending: true });
        if (fallback.error) throw fallback.error;
        tiposData = fallback.data;
      } else if (tiposRes.error) {
        throw tiposRes.error;
      }
      const regrasMap: Record<string, Regra> = {};
      (regrasRes.data || []).forEach((rule: any) => {
        regrasMap[rule.id] = {
          id: rule.id,
          tipo: rule.tipo || "GERAL",
          meta_nao_atingida: rule.meta_nao_atingida,
          meta_atingida: rule.meta_atingida,
          super_meta: rule.super_meta,
          commission_tier: rule.commission_tier || [],
        };
      });
      const regraProdMap: Record<string, RegraProduto> = {};
      (regrasProdRes.data || []).forEach((rule: any) => {
        regraProdMap[rule.produto_id] = {
          produto_id: rule.produto_id,
          rule_id: rule.rule_id,
          fix_meta_nao_atingida: rule.fix_meta_nao_atingida,
          fix_meta_atingida: rule.fix_meta_atingida,
          fix_super_meta: rule.fix_super_meta,
        };
      });
      const regraProdPacoteMap: Record<string, Record<string, RegraProduto>> = {};
      (regrasProdPacoteRes.data || []).forEach((rule: any) => {
        const produtoId = rule.produto_id;
        const tipoPacoteKey = normalizeTipoPacoteRuleKey(rule.tipo_pacote || "");
        if (!produtoId || !tipoPacoteKey) return;
        if (!regraProdPacoteMap[produtoId]) regraProdPacoteMap[produtoId] = {};
        regraProdPacoteMap[produtoId][tipoPacoteKey] = {
          produto_id: produtoId,
          rule_id: rule.rule_id,
          fix_meta_nao_atingida: rule.fix_meta_nao_atingida,
          fix_meta_atingida: rule.fix_meta_atingida,
          fix_super_meta: rule.fix_super_meta,
        };
      });
      const metaProdMap: Record<string, number> = {};
      (metasProdRes.data || []).forEach((entry: any) => {
        if (!entry.produto_id) return;
        metaProdMap[entry.produto_id] =
          (metaProdMap[entry.produto_id] || 0) + Number(entry.valor || 0);
      });
      if (Array.isArray(tiposData) && tiposData.length > 0) {
        setTiposProdutos(tiposData as TipoProduto[]);
      }
      setRegrasCommission(regrasMap);
      setRegraProdutoMap(regraProdMap);
      setRegraProdutoPacoteMap(regraProdPacoteMap);
      setMetaProdutoMap(metaProdMap);
    } catch (e: any) {
      console.error("Erro ao carregar dados de comissão:", e);
      setCommissionErro("Erro ao carregar dados de comissão.");
    } finally {
      setCommissionLoading(false);
    }
  }

  useEffect(() => {
    if (cidadeNomeInput.trim().length < 2) {
      setCidadeSugestoes([]);
      setMostrarSugestoesCidade(false);
      setErroCidade(null);
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
          setCidadeSugestoes((data || []) as Cidade[]);
          setMostrarSugestoesCidade(true);
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
    if (!cidadeFiltro) {
      return;
    }
    const matched = cidades.find((cidade) => cidade.id === cidadeFiltro);
    if (matched) {
      setCidadeNomeInput(matched.nome);
    }
  }, [cidadeFiltro, cidades]);

  const clientesFiltrados = useMemo(() => {
    if (!clienteBusca.trim()) return clientes;
    const termo = normalizeText(clienteBusca);
    return clientes.filter((c) => {
      const doc = c.cpf || "";
      return (
        normalizeText(c.nome).includes(termo) ||
        normalizeText(doc).includes(termo)
      );
    });
  }, [clientes, clienteBusca]);

  const tipoNomePorId = useMemo(() => {
    const map = new Map<string, string>();
    tiposProdutos.forEach((tipo) => {
      const tipoLabel = tipo.tipo?.trim() || "";
      const nomeRaw = tipo.nome?.trim() || "";
      const nomeLimpo = nomeRaw && !nomeRaw.startsWith("--") ? nomeRaw : "";
      const label = tipoLabel || nomeLimpo;
      if (label) {
        map.set(tipo.id, label);
      }
    });
    return map;
  }, [tiposProdutos]);

  const tipoProdutoIdSet = useMemo(() => {
    const set = new Set<string>();
    tiposProdutos.forEach((tipo) => {
      if (tipo.id) set.add(tipo.id);
    });
    return set;
  }, [tiposProdutos]);

  const cidadePorId = useMemo(() => {
    const map = new Map<string, string>();
    cidades.forEach((cidade) => {
      if (cidade.id && cidade.nome) {
        map.set(cidade.id, cidade.nome);
      }
    });
    return map;
  }, [cidades]);

  const construirRecibosEnriquecidos = useCallback(
    (vendasInput: Venda[], pagamentosMap?: Map<string, number>) => {
      const cliMap = new Map(clientes.map((c) => [c.id, c]));
      const prodMap = new Map(produtos.map((p) => [p.id, p]));

      return vendasInput.flatMap((v) => {
        const c = cliMap.get(v.cliente_id) || v.cliente;
        const clienteNome = c?.nome || "(sem cliente)";
        const clienteCpf = c?.cpf || "";
        const produtoDestino = v.destino_produto;
        const recibos = filterRecibosCanceladosMesmoMes(v.vendas_recibos || []);
        const recibosBase = recibos.filter((recibo) => !hasConciliacaoOverride(recibo));
        const totalBrutoVendaBase = recibosBase.reduce((sum, r) => sum + getBrutoRecibo(r), 0);
        const naoComissionado = pagamentosMap?.get(v.id) ?? Number(v.valor_nao_comissionado || 0);
        const descontoComercial = Math.max(0, Number(v.desconto_comercial_valor || 0));
        // No relatório de vendas, não reduzimos pelo "pago" (valor_total_pago), pois isso representa pagamentos.
        // O ajuste aqui considera apenas descontos comerciais explícitos e formas de pagamento não comissionáveis.
        const baseComissionavel = Math.max(0, totalBrutoVendaBase - descontoComercial - naoComissionado);
        const fatorComissionavel =
          totalBrutoVendaBase > 0 ? Math.max(0, Math.min(1, baseComissionavel / totalBrutoVendaBase)) : 1;

        return recibos.map((recibo, index) => {
        const produtoResolvido = recibo.produto_resolvido;
        const tipoRegistro = recibo.tipo_produtos;
        const reciboProdutoId = String(recibo.produto_id || "").trim();
        const tipoIdDoRecibo =
          tipoRegistro?.id ||
          (reciboProdutoId
            ? tipoProdutoIdSet.has(reciboProdutoId)
              ? reciboProdutoId
              : prodMap.get(reciboProdutoId)?.tipo_produto || null
            : null) ||
          produtoResolvido?.tipo_produto ||
          produtoDestino?.tipo_produto ||
          null;
        const tipoId = tipoIdDoRecibo;
        const tipoLabel =
          tipoRegistro?.nome ||
          tipoRegistro?.tipo ||
          tipoNomePorId.get(tipoId || "") ||
          tipoId ||
          "(sem tipo)";
        const cidadeBaseId =
          v.destino_cidade_id ||
          produtoResolvido?.cidade_id ||
          produtoDestino?.cidade_id ||
          null;
        const produtoBase =
          tipoId && produtos.length
            ? produtos.find((p) => {
                if (!p?.tipo_produto || p.tipo_produto !== tipoId) return false;
                if (p.todas_as_cidades) return true;
                if (!cidadeBaseId) return !p.cidade_id;
                return p.cidade_id === cidadeBaseId;
              })
            : undefined;
        const produtoNome =
          produtoResolvido?.nome ||
          produtoBase?.nome ||
          produtoDestino?.nome ||
          tipoLabel ||
          "(sem produto)";
        const destinoNome =
          produtoDestino?.nome ||
          produtoResolvido?.nome ||
          v.destino?.nome ||
          "(sem destino)";
        const cidadeId =
          cidadeBaseId ||
          produtoBase?.cidade_id ||
          prodMap.get(recibo.produto_id || "")?.cidade_id ||
          null;
        const vendaCidadeNome = v.destino_cidade?.nome || "";
        const cidadeNome =
          vendaCidadeNome ||
          (cidadeId && cidadePorId.get(cidadeId) ? cidadePorId.get(cidadeId)! : "");

        const produtoId =
          produtoResolvido?.id ||
          produtoBase?.id ||
          recibo.produto_id ||
          produtoDestino?.id ||
          null;

	        return {
	          id: `${v.id}-${index}-${recibo.numero_recibo || "recibo"}`,
	          venda_id: v.id,
	          cliente_id: v.cliente_id,
	          numero_venda: v.numero_venda || v.id,
	          cliente_nome: clienteNome,
	          cliente_cpf: clienteCpf,
	          destino_nome: destinoNome,
	          produto_nome: produtoNome,
	          produto_tipo: tipoLabel,
	          produto_tipo_id: tipoId,
            produto_comissao_id: tipoIdDoRecibo,
	          produto_id: produtoId,
	          cidade_nome: cidadeNome,
	          cidade_id: cidadeId,
	          data_venda_recibo: recibo.data_venda || null,
	          data_venda_venda: v.data_venda || null,
	          data_venda: recibo.data_venda || v.data_venda,
	          data_embarque: v.data_embarque,
	          numero_recibo: recibo.numero_recibo,
            valor_total: getBrutoRecibo(recibo),
            // Mantido por compatibilidade interna (não usar para exibição de Total).
            // Representa o fator aplicado quando existe desconto comercial / não-comissionável.
            valor_comissionavel: hasConciliacaoOverride(recibo)
              ? getBrutoRecibo(recibo)
              : getBrutoRecibo(recibo) * fatorComissionavel,
	          valor_taxas: recibo.valor_taxas ?? null,
            valor_du: recibo.valor_du ?? null,
            valor_rav: recibo.valor_rav ?? null,
            valor_bruto_override: recibo.valor_bruto_override ?? null,
            valor_meta_override: recibo.valor_meta_override ?? null,
            valor_liquido_override: recibo.valor_liquido_override ?? null,
            valor_comissao_loja: recibo.valor_comissao_loja ?? null,
            percentual_comissao_loja: recibo.percentual_comissao_loja ?? null,
            faixa_comissao: recibo.faixa_comissao ?? null,
	          tipo_pacote: recibo.tipo_pacote || null,
            venda_cancelada: v.cancelada ?? null,
	          status: v.status,
	        };
        });
      });
    },
    [clientes, produtos, tipoNomePorId, tipoProdutoIdSet, cidadePorId]
  );

  const recibosEnriquecidos: ReciboEnriquecido[] = useMemo(
    () => construirRecibosEnriquecidos(vendas, pagamentosNaoComissionaveis),
    [vendas, pagamentosNaoComissionaveis, construirRecibosEnriquecidos]
  );

  const recibosResumoBase = useMemo(
    () => construirRecibosEnriquecidos(vendasResumoData, pagamentosResumoData),
    [vendasResumoData, pagamentosResumoData, construirRecibosEnriquecidos]
  );

  useEffect(() => {
    if (vendasBaseComissaoData.length === 0) {
      setRecibosBaseComissao([]);
      return;
    }
    setRecibosBaseComissao(
      construirRecibosEnriquecidos(vendasBaseComissaoData, pagamentosBaseComissaoData)
    );
  }, [
    vendasBaseComissaoData,
    pagamentosBaseComissaoData,
    construirRecibosEnriquecidos,
  ]);

  const recibosParaCalculoComissao = useMemo(() => {
    if (recibosBaseComissao.length > 0) return recibosBaseComissao;
    return recibosEnriquecidos;
  }, [recibosBaseComissao, recibosEnriquecidos]);

  const recibosElegiveisComissao = useMemo(
    () =>
      recibosParaCalculoComissao.filter(
        (recibo) =>
          !isStatusCancelado(recibo.status, recibo.venda_cancelada) &&
          reciboDentroDoPeriodo(recibo, dataInicio, dataFim)
      ),
    [recibosParaCalculoComissao, dataInicio, dataFim]
  );

  const filtrosLocaisAtivos = Boolean(
    destinoBusca.trim() ||
      cidadeNomeInput.trim() ||
      clienteBusca.trim() ||
      tipoSelecionadoId
  );

  const filtrarRecibos = useCallback(
    (recibos: ReciboEnriquecido[]) => {
      const termProd = normalizeText(destinoBusca.trim());
      const termCidade = normalizeText(cidadeNomeInput.trim());
      const termClienteRaw = clienteBusca.trim();
      const termCliente = normalizeText(termClienteRaw);
      return recibos.filter((recibo) => {
        const matchTipo =
          !tipoSelecionadoId || recibo.produto_tipo_id === tipoSelecionadoId;
        const matchCidade =
          !cidadeFiltro && !termCidade
            ? true
            : cidadeFiltro
            ? recibo.cidade_id === cidadeFiltro
            : normalizeText(recibo.cidade_nome || "").includes(termCidade);
        const nomeProduto = normalizeText(recibo.produto_nome || "");
        const matchProduto = !termProd || nomeProduto.includes(termProd);
        const matchCliente = clienteSelecionado
          ? recibo.cliente_id === clienteSelecionado.id
          : !termCliente
          ? true
          : normalizeText(recibo.cliente_nome || "").includes(termCliente) ||
            matchesCpfSearch(recibo.cliente_cpf || "", termClienteRaw);
        return matchTipo && matchCidade && matchProduto && matchCliente;
      });
    },
    [
      destinoBusca,
      tipoSelecionadoId,
      cidadeFiltro,
      cidadeNomeInput,
      clienteBusca,
      clienteSelecionado,
    ]
  );

  const recibosFiltrados = useMemo(
    () => filtrarRecibos(recibosEnriquecidos),
    [recibosEnriquecidos, filtrarRecibos]
  );
  const recibosResumoFiltrados = useMemo(
    () => filtrarRecibos(recibosResumoBase),
    [recibosResumoBase, filtrarRecibos]
  );
  const usaPaginacaoServidor = !filtrosLocaisAtivos && !carregouTodos;
  const totalItems = usaPaginacaoServidor ? totalVendasDb : recibosFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItems / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPaginas);
  const recibosExibidos = useMemo(() => {
    if (usaPaginacaoServidor) return recibosFiltrados;
    const inicio = (paginaAtual - 1) * pageSize;
    return recibosFiltrados.slice(inicio, inicio + pageSize);
  }, [usaPaginacaoServidor, recibosFiltrados, paginaAtual, pageSize]);

  useEffect(() => {
    if (page > totalPaginas) {
      setPage(totalPaginas);
    }
  }, [page, totalPaginas]);

  const totalRecibos = recibosResumoFiltrados.length;
  const somaValores = recibosResumoFiltrados.reduce((acc, v) => {
    return acc + getBrutoRecibo(v);
  }, 0);
  const formatCurrency = (value: number) => formatCurrencyBRL(value);
  const somaTaxas = recibosResumoFiltrados.reduce((acc, v) => {
    return acc + getTaxasEfetivas(v);
  }, 0);
  const somaLiquido = recibosResumoFiltrados.reduce((acc, v) => {
    return acc + getLiquidoComissionavel(v);
  }, 0);
  const ticketMedio = totalRecibos > 0 ? somaValores / totalRecibos : 0;

  const produtosMap = useMemo(
    () => new Map(produtos.map((p) => [p.id, p])),
    [produtos]
  );

  const tipoProdutoMap = useMemo(
    () => new Map(tiposProdutos.map((tipo) => [tipo.id, tipo])),
    [tiposProdutos]
  );

  const tipoIdFromProduto = useCallback(
    (produto?: Produto | TipoProduto) => {
      if (!produto) return undefined;
      if ("tipo_produto" in produto) {
        return produto.tipo_produto || undefined;
      }
      return produto.id;
    },
    []
  );

  const getProdutoPorId = useCallback(
    (prodId: string) => {
      const tipoDireto = tipoProdutoMap.get(prodId);
      if (tipoDireto) return tipoDireto;
      const produto = produtosMap.get(prodId);
      if (!produto) return undefined;
      const tipoPorProduto =
        produto.tipo_produto ? tipoProdutoMap.get(produto.tipo_produto) : undefined;
      return tipoPorProduto || produto;
    },
    [produtosMap, tipoProdutoMap]
  );

  const getRegraProduto = useCallback(
    (prodId: string, produto?: Produto | TipoProduto) => {
      const direct = regraProdutoMap[prodId];
      if (direct) return direct;
      if (produto) {
        const tipoId = tipoIdFromProduto(produto);
        if (tipoId) {
          return regraProdutoMap[tipoId];
        }
      }
      return undefined;
    },
    [regraProdutoMap, tipoIdFromProduto]
  );

  const getRegraProdutoPacote = useCallback(
    (prodId: string, tipoPacote?: string | null, produto?: Produto | TipoProduto) => {
      const key = normalizeTipoPacoteRuleKey(tipoPacote || "");
      if (!key) return undefined;
      const direct = regraProdutoPacoteMap[prodId]?.[key];
      if (direct) return direct;
      if (produto) {
        const tipoId = tipoIdFromProduto(produto);
        if (tipoId) {
          return regraProdutoPacoteMap[tipoId]?.[key];
        }
      }
      return undefined;
    },
    [regraProdutoPacoteMap, tipoIdFromProduto]
  );

  const buildCommissionBucketKey = useCallback(
    (prodId: string, recibo: ReciboEnriquecido) => {
      const tipoPacoteKey = normalizeTipoPacoteRuleKey(recibo.tipo_pacote || "");
      const isConciliacao = hasConciliacaoOverride(recibo);
      const percentualComissaoLoja =
        recibo.percentual_comissao_loja != null
          ? Number(recibo.percentual_comissao_loja)
          : null;
      const faixaComissao = recibo.faixa_comissao || null;
      return [
        prodId,
        tipoPacoteKey || "default",
        isConciliacao ? "conciliacao" : "base",
        isConciliacao ? faixaComissao || "sem-faixa" : "sem-faixa",
        isConciliacao && percentualComissaoLoja != null
          ? String(percentualComissaoLoja)
          : "sem-pct-loja",
      ].join("::");
    },
    []
  );

  const commissionAggregates = useMemo(() => {
    if (!tipoProdutoMap.size) return null;
    const params = parametrosComissao || {
      usar_taxas_na_meta: true,
      foco_valor: "bruto",
      foco_faturamento: "bruto",
    };
    const baseMetaPorProduto: Record<string, number> = {};
    const liquidoPorProduto: Record<string, number> = {};
    const brutoPorProduto: Record<string, number> = {};
    const baseComPorProduto: Record<string, number> = {};
    const bucketTotals: Record<
      string,
      {
        prodId: string;
        tipoPacote: string | null;
        baseCom: number;
        valorLiquido: number;
        isConciliacao: boolean;
        percentualComissaoLoja: number | null;
        faixaComissao: string | null;
        isSeguro: boolean;
      }
    > = {};
    let baseMetaTotal = 0;
    recibosElegiveisComissao.forEach((recibo) => {
      const prodId =
        recibo.produto_comissao_id || recibo.produto_tipo_id || recibo.produto_id || "";
      if (!prodId) return;
      const produto = getProdutoPorId(prodId);
      if (!produto) return;
      const brutoSemRav = getBrutoSemRav(recibo);
      const liquido = getLiquidoComissionavel(recibo);
      const valParaMeta = getMetaRecibo(recibo, params);
      baseMetaPorProduto[prodId] = (baseMetaPorProduto[prodId] || 0) + valParaMeta;
      if (produto.soma_na_meta) {
        baseMetaTotal += valParaMeta;
      }
      liquidoPorProduto[prodId] = (liquidoPorProduto[prodId] || 0) + liquido;
      brutoPorProduto[prodId] = (brutoPorProduto[prodId] || 0) + brutoSemRav;
      // Espelha operacao/comissionamento: comissão em valor usa sempre base líquida.
      const baseCom = liquido;
      baseComPorProduto[prodId] = (baseComPorProduto[prodId] || 0) + baseCom;

      const bucketKey = buildCommissionBucketKey(prodId, recibo);
      const bucket = bucketTotals[bucketKey] || {
        prodId,
        tipoPacote: recibo.tipo_pacote || null,
        baseCom: 0,
        valorLiquido: 0,
        isConciliacao: hasConciliacaoOverride(recibo),
        percentualComissaoLoja:
          recibo.percentual_comissao_loja != null
            ? Number(recibo.percentual_comissao_loja)
            : null,
        faixaComissao: recibo.faixa_comissao || null,
        isSeguro: isSeguroRecibo(recibo),
      };
      bucket.baseCom += baseCom;
      bucket.valorLiquido += liquido;
      bucketTotals[bucketKey] = bucket;
    });
    const pctMetaGeral =
      metaPlanejada > 0 ? (baseMetaTotal / metaPlanejada) * 100 : 0;
    const pctByBucket: Record<string, number> = {};

    Object.entries(bucketTotals).forEach(([bucketKey, bucket]) => {
      const produto = getProdutoPorId(bucket.prodId);
      if (!produto || bucket.baseCom <= 0) return;

      const baseMetaProduto = baseMetaPorProduto[bucket.prodId] || 0;
      const regraPacote = getRegraProdutoPacote(bucket.prodId, bucket.tipoPacote, produto);
      const regraProdBase = getRegraProduto(bucket.prodId, produto);
      let regraProd = regraPacote || regraProdBase;

      if (bucket.isConciliacao && hasConciliacaoCommissionRule(params)) {
        const conciliacaoSelection = resolveConciliacaoCommissionSelection(params, {
          faixa_comissao: bucket.faixaComissao,
          percentual_comissao_loja: bucket.percentualComissaoLoja,
          is_seguro_viagem: bucket.isSeguro,
        });
        if (conciliacaoSelection.kind === "CONCILIACAO" && conciliacaoSelection.rule) {
          pctByBucket[bucketKey] = calcularPctPorRegra(
            conciliacaoSelection.rule,
            pctMetaGeral
          );
          return;
        }
      }

      if (produto.regra_comissionamento === "diferenciado") {
        if (!regraProd) return;
        const produtoTipoId = tipoIdFromProduto(produto);
        const metaProdValor =
          metaProdutoMap[bucket.prodId] ||
          (produtoTipoId ? metaProdutoMap[produtoTipoId] : 0) ||
          0;
        const temMetaProd = metaProdValor > 0;
        const pctMetaProd = temMetaProd ? (baseMetaProduto / metaProdValor) * 100 : 0;
        const pctReferencia = temMetaProd ? pctMetaProd : pctMetaGeral;
        pctByBucket[bucketKey] = calcularPctFixoProduto(regraProd, pctReferencia);
        return;
      }

      let pct = 0;
      let usouFixo = false;

      if (regraProd && !regraProd.rule_id) {
        if (regraProdutoTemFixo(regraProd)) {
          pct = calcularPctFixoProduto(regraProd, pctMetaGeral);
          usouFixo = true;
        } else if (regraPacote && regraProd === regraPacote) {
          regraProd = regraProdBase;
        }
      }

      if (!usouFixo) {
        const regraId = regraProd?.rule_id;
        const regra = regraId ? regrasCommission[regraId] : undefined;
        if (!regra) return;
        pct = calcularPctPorRegra(regra, pctMetaGeral);
      }

      if (
        metaProdEnabled &&
        produto.usa_meta_produto &&
        produto.meta_produto_valor &&
        produto.comissao_produto_meta_pct
      ) {
        const atingiuMetaProd =
          produto.meta_produto_valor > 0 &&
          baseMetaProduto >= produto.meta_produto_valor;
        if (atingiuMetaProd) {
          const baseComProduto = baseComPorProduto[bucket.prodId] || 0;
          if (baseComProduto > 0) {
            const valMetaProd =
              baseComProduto * ((produto.comissao_produto_meta_pct || 0) / 100);
            const valGeral = baseComProduto * (pct / 100);
            const diffValor =
              produto.descontar_meta_geral === false
                ? valMetaProd
                : Math.max(valMetaProd - valGeral, 0);
            if (diffValor > 0) {
              pct += (diffValor / baseComProduto) * 100;
            }
          }
        }
      }

      pctByBucket[bucketKey] = pct;
    });

    return {
      baseMetaPorProduto,
      liquidoPorProduto,
      brutoPorProduto,
      baseComPorProduto,
      baseMetaTotal,
      pctMetaGeral,
      pctByBucket,
    };
  }, [
    recibosElegiveisComissao,
    parametrosComissao,
    tipoProdutoMap,
    metaPlanejada,
    metaProdEnabled,
    metaProdutoMap,
    regrasCommission,
    getProdutoPorId,
    getRegraProduto,
    getRegraProdutoPacote,
    tipoIdFromProduto,
    buildCommissionBucketKey,
  ]);

  const calcularPctParaProduto = useCallback(
    (prodId: string, tipoPacote?: string | null) => {
      const aggregates = commissionAggregates;
      if (!aggregates) return 0;
      const produto = getProdutoPorId(prodId);
      if (!produto) return 0;
      const baseMetaPorProduto = aggregates.baseMetaPorProduto[prodId] || 0;
      const regraPacote = getRegraProdutoPacote(prodId, tipoPacote, produto);
      const regraProdBase = getRegraProduto(prodId, produto);
      let regraProd = regraPacote || regraProdBase;
      if (produto.regra_comissionamento === "diferenciado") {
        if (!regraProd) return 0;
        const produtoTipoId = tipoIdFromProduto(produto);
        const metaProdValor =
          metaProdutoMap[prodId] ||
          (produtoTipoId ? metaProdutoMap[produtoTipoId] : 0) ||
          0;
        const temMetaProd = metaProdValor > 0;
        const pctMetaProd = temMetaProd
          ? (baseMetaPorProduto / metaProdValor) * 100
          : 0;
        const pctReferencia = temMetaProd ? pctMetaProd : aggregates.pctMetaGeral;
        return calcularPctFixoProduto(regraProd, pctReferencia);
      }
      let pct = 0;
      let usouFixo = false;

      if (regraProd && !regraProd.rule_id) {
        if (regraProdutoTemFixo(regraProd)) {
          pct = calcularPctFixoProduto(regraProd, aggregates.pctMetaGeral);
          usouFixo = true;
        } else if (regraPacote && regraProd === regraPacote) {
          regraProd = regraProdBase;
        }
      }

      if (!usouFixo) {
        const regraId = regraProd?.rule_id;
        const regra = regraId ? regrasCommission[regraId] : undefined;
        if (!regra) return 0;
        pct = calcularPctPorRegra(regra, aggregates.pctMetaGeral);
      }
      if (
        metaProdEnabled &&
        produto.usa_meta_produto &&
        produto.meta_produto_valor &&
        produto.comissao_produto_meta_pct
      ) {
        const atingiuMetaProd =
          produto.meta_produto_valor > 0 &&
          baseMetaPorProduto >= produto.meta_produto_valor;
        if (atingiuMetaProd) {
          const baseCom = aggregates.baseComPorProduto[prodId] || 0;
          if (baseCom > 0) {
            const valMetaProd =
              baseCom *
              ((produto.comissao_produto_meta_pct || 0) / 100);
            const valGeral = baseCom * (pct / 100);
            const diffValor =
              produto.descontar_meta_geral === false
                ? valMetaProd
                : Math.max(valMetaProd - valGeral, 0);
            if (diffValor > 0) {
              pct += (diffValor / baseCom) * 100;
            }
          }
        }
      }
      return pct;
    },
    [
      commissionAggregates,
      metaProdEnabled,
      metaProdutoMap,
      tipoProdutoMap,
      regraProdutoMap,
      regraProdutoPacoteMap,
      regrasCommission,
      tipoIdFromProduto,
      getProdutoPorId,
      getRegraProduto,
      getRegraProdutoPacote,
    ]
  );

  const calcularComissaoRecibo = useCallback(
    (recibo: ReciboEnriquecido) => {
      const aggregates = commissionAggregates;
      if (!aggregates) return 0;
      const params = parametrosComissao || {
        usar_taxas_na_meta: true,
        foco_valor: "bruto",
        foco_faturamento: "bruto",
        conciliacao_regra_ativa: false,
        conciliacao_tipo: "GERAL",
        conciliacao_meta_nao_atingida: null,
        conciliacao_meta_atingida: null,
        conciliacao_super_meta: null,
        conciliacao_tiers: [],
        conciliacao_faixas_loja: [],
      };
      if (isStatusCancelado(recibo.status, recibo.venda_cancelada)) return 0;
      if (!reciboDentroDoPeriodo(recibo, dataInicio, dataFim)) return 0;
      const prodId =
        recibo.produto_comissao_id || recibo.produto_tipo_id || recibo.produto_id || "";
      if (!prodId) return 0;
      const liquido = getLiquidoComissionavel(recibo);
      // Espelha operacao/comissionamento: comissão em valor usa sempre base líquida.
      const baseCom = liquido;
      if (baseCom <= 0) return 0;
      const conciliacaoSelection =
        hasConciliacaoOverride(recibo) && hasConciliacaoCommissionRule(params)
          ? resolveConciliacaoCommissionSelection(params, {
              faixa_comissao: recibo.faixa_comissao || null,
              percentual_comissao_loja:
                recibo.percentual_comissao_loja != null
                  ? Number(recibo.percentual_comissao_loja)
                  : null,
              is_seguro_viagem: isSeguroRecibo(recibo),
            })
          : null;
      const pct =
        conciliacaoSelection?.kind === "CONCILIACAO"
          ? calcularPctPorRegra(conciliacaoSelection.rule, aggregates.pctMetaGeral)
          : commissionAggregates.pctByBucket[
              buildCommissionBucketKey(prodId, recibo)
            ] ?? calcularPctParaProduto(prodId, recibo.tipo_pacote || null);
      return baseCom * (pct / 100);
    },
    [
      parametrosComissao,
      commissionAggregates,
      calcularPctParaProduto,
      dataInicio,
      dataFim,
      buildCommissionBucketKey,
    ]
  );

  const calcularPercentualComissaoRecibo = useCallback(
    (recibo: ReciboEnriquecido) => {
      const aggregates = commissionAggregates;
      if (!aggregates) return 0;
      const params = parametrosComissao || {
        usar_taxas_na_meta: true,
        foco_valor: "bruto",
        foco_faturamento: "bruto",
        conciliacao_regra_ativa: false,
        conciliacao_tipo: "GERAL",
        conciliacao_meta_nao_atingida: null,
        conciliacao_meta_atingida: null,
        conciliacao_super_meta: null,
        conciliacao_tiers: [],
        conciliacao_faixas_loja: [],
      };
      if (isStatusCancelado(recibo.status, recibo.venda_cancelada)) return 0;
      if (!reciboDentroDoPeriodo(recibo, dataInicio, dataFim)) return 0;
      const prodId =
        recibo.produto_comissao_id || recibo.produto_tipo_id || recibo.produto_id || "";
      if (!prodId) return 0;
      const liquido = getLiquidoComissionavel(recibo);
      // Espelha operacao/comissionamento: comissão em valor usa sempre base líquida.
      const baseCom = liquido;
      if (baseCom <= 0) return 0;
      const conciliacaoSelection =
        hasConciliacaoOverride(recibo) && hasConciliacaoCommissionRule(params)
          ? resolveConciliacaoCommissionSelection(params, {
              faixa_comissao: recibo.faixa_comissao || null,
              percentual_comissao_loja:
                recibo.percentual_comissao_loja != null
                  ? Number(recibo.percentual_comissao_loja)
                  : null,
              is_seguro_viagem: isSeguroRecibo(recibo),
            })
          : null;
      const pct =
        conciliacaoSelection?.kind === "CONCILIACAO"
          ? calcularPctPorRegra(conciliacaoSelection.rule, aggregates.pctMetaGeral)
          : commissionAggregates.pctByBucket[
              buildCommissionBucketKey(prodId, recibo)
            ] ?? calcularPctParaProduto(prodId, recibo.tipo_pacote || null);
      return Number.isFinite(pct) ? pct : 0;
    },
    [
      parametrosComissao,
      commissionAggregates,
      calcularPctParaProduto,
      dataInicio,
      dataFim,
      buildCommissionBucketKey,
    ]
  );

  const percentualComissaoPorRecibo = useMemo(() => {
    const mapa = new Map<string, number>();
    recibosFiltrados.forEach((recibo) => {
      mapa.set(recibo.id, calcularPercentualComissaoRecibo(recibo));
    });
    return mapa;
  }, [recibosFiltrados, calcularPercentualComissaoRecibo]);

  const comissaoPorRecibo = useMemo(() => {
    const mapa = new Map<string, number>();
    recibosFiltrados.forEach((recibo) => {
      mapa.set(recibo.id, calcularComissaoRecibo(recibo));
    });
    return mapa;
  }, [recibosFiltrados, calcularComissaoRecibo]);

  const somaComissao = useMemo(
    () =>
      recibosResumoFiltrados.reduce(
        (acc, recibo) => acc + calcularComissaoRecibo(recibo),
        0
      ),
    [recibosResumoFiltrados, calcularComissaoRecibo]
  );

  async function carregarVendas(pageOverride?: number) {
    if (!userCtx) return;
    try {
      setLoading(true);
      setErro(null);

      const paginaAtual = Math.max(1, pageOverride ?? page);
      const tamanhoPagina = Math.max(1, pageSize);

      const vendedorIdsFiltro =
        userCtx.papel === "ADMIN"
          ? []
          : (userCtx.papel === "GESTOR" || userCtx.papel === "MASTER") &&
            !isTodosFiltro(vendedorFiltro)
          ? [vendedorFiltro]
          : userCtx.vendedorIds;

      if (userCtx.papel !== "ADMIN" && (!vendedorIdsFiltro || vendedorIdsFiltro.length === 0)) {
        setVendas([]);
        setVendasResumoData([]);
        setPagamentosResumoData(new Map());
        setResumoDataKey("");
        setVendasBaseComissaoData([]);
        setPagamentosBaseComissaoData(new Map());
        setRecibosBaseComissaoKey("");
        setTotalVendasDb(0);
        setCarregouTodos(false);
        return;
      }

      const { items, total, pagamentosNaoComissionaveis } = await fetchRelatorioVendas({
        dataInicio: dataInicio || "",
        dataFim: dataFim || "",
        status: statusFiltro,
        clienteId: clienteSelecionado?.id || null,
        valorMin,
        valorMax,
        vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
        page: paginaAtual,
        pageSize: tamanhoPagina,
        all: filtrosLocaisAtivos,
        includePagamentos: true,
        cacheRevision: getVendasCacheVersion(),
      });

      const vendasData = items as Venda[];
      const vendaIds = vendasData.map((v) => v.id).filter(Boolean);
      const pagamentosMapFromApi = pagamentosMapFromPayload(pagamentosNaoComissionaveis);
      const pagamentosMap = pagamentosMapFromApi.size
        ? pagamentosMapFromApi
        : await carregarPagamentosNaoComissionaveis(vendaIds, supabase);
      if (pagamentosNaoComissionaveis && Object.keys(pagamentosNaoComissionaveis).length > 0) {
        setPagamentosNaoComissionaveis(pagamentosMap);
      } else {
        setPagamentosNaoComissionaveis(pagamentosMap);
      }
      setVendas(vendasData);
      if (filtrosLocaisAtivos) {
        setCarregouTodos(true);
        setTotalVendasDb(total || vendasData.length);
      } else {
        setCarregouTodos(false);
        setTotalVendasDb(total || vendasData.length);
      }

      const vendedorIdsKey = (vendedorIdsFiltro || []).join(",");
      const resumoKey = [
        dataInicio || "",
        dataFim || "",
        statusFiltro || "todos",
        clienteSelecionado?.id || "",
        valorMin || "",
        valorMax || "",
        vendedorIdsKey,
      ].join("|");
      const baseComissaoKey = [
        dataInicio || "",
        dataFim || "",
        vendedorIdsKey,
      ].join("|");

      if (resumoKey !== resumoDataKey) {
        if (filtrosLocaisAtivos) {
          setVendasResumoData(vendasData);
          setPagamentosResumoData(new Map(pagamentosMap));
        } else {
          const resumoFull = await fetchRelatorioVendas({
            dataInicio: dataInicio || "",
            dataFim: dataFim || "",
            status: statusFiltro,
            clienteId: clienteSelecionado?.id || null,
            valorMin,
            valorMax,
            vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
            page: 1,
            pageSize: 1000,
            all: true,
            includePagamentos: true,
            cacheRevision: getVendasCacheVersion(),
          });
          const vendasResumo = resumoFull.items as Venda[];
          const resumoVendaIds = vendasResumo.map((v) => v.id).filter(Boolean);
          const pagamentosResumoFromApi = pagamentosMapFromPayload(
            resumoFull.pagamentosNaoComissionaveis
          );
          const pagamentosResumo = pagamentosResumoFromApi.size
            ? pagamentosResumoFromApi
            : await carregarPagamentosNaoComissionaveis(resumoVendaIds, supabase);
          setVendasResumoData(vendasResumo);
          setPagamentosResumoData(new Map(pagamentosResumo));
        }
        setResumoDataKey(resumoKey);
      }

      // A coluna % da comissão deve respeitar o contexto completo do período/filtros,
      // não apenas os itens exibidos/filtrados na tela atual.
      if (baseComissaoKey !== recibosBaseComissaoKey) {
        const full = await fetchRelatorioVendas({
          dataInicio: dataInicio || "",
          dataFim: dataFim || "",
          vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
          page: 1,
          pageSize: 1000,
          all: true,
          includePagamentos: true,
          cacheRevision: getVendasCacheVersion(),
        });
        const vendasComissao = full.items as Venda[];
        const fullVendaIds = vendasComissao.map((v) => v.id).filter(Boolean);
        const pagamentosFullFromApi = pagamentosMapFromPayload(full.pagamentosNaoComissionaveis);
        const pagamentosComissao = pagamentosFullFromApi.size
          ? pagamentosFullFromApi
          : await carregarPagamentosNaoComissionaveis(fullVendaIds, supabase);

        setVendasBaseComissaoData(vendasComissao);
        setPagamentosBaseComissaoData(new Map(pagamentosComissao));
        setRecibosBaseComissaoKey(baseComissaoKey);
      }
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar vendas para o relatório. Confira o schema e filtros.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarVendasParaExport(): Promise<{
    vendas: Venda[];
    pagamentosMap: Map<string, number> | null;
  }> {
    if (!userCtx) {
      return { vendas: [], pagamentosMap: null };
    }
    const pageSizeExport = 1000;
    let pagina = 0;
    const todas: Venda[] = [];
    const pagamentosMap = new Map<string, number>();

    while (true) {
      const inicio = pagina * pageSizeExport;
      const fim = inicio + pageSizeExport - 1;

        const vendedorIdsFiltro =
          userCtx.papel === "ADMIN"
            ? []
            : (userCtx.papel === "GESTOR" || userCtx.papel === "MASTER") &&
              !isTodosFiltro(vendedorFiltro)
            ? [vendedorFiltro]
            : userCtx.vendedorIds;

        if (userCtx.papel !== "ADMIN" && (!vendedorIdsFiltro || vendedorIdsFiltro.length === 0)) {
          return [];
        }

        const { items, pagamentosNaoComissionaveis } = await fetchRelatorioVendas({
          dataInicio: dataInicio || "",
          dataFim: dataFim || "",
          status: statusFiltro,
          clienteId: clienteSelecionado?.id || null,
          valorMin,
          valorMax,
          vendedorIds: vendedorIdsFiltro && vendedorIdsFiltro.length > 0 ? vendedorIdsFiltro : null,
          page: pagina + 1,
          pageSize: pageSizeExport,
          noCache: true,
          includePagamentos: true,
        });

        const rows = items as Venda[];
        todas.push(...rows);

        if (pagamentosNaoComissionaveis) {
          Object.entries(pagamentosNaoComissionaveis).forEach(([id, value]) => {
            const nextValue = Number(value || 0);
            if (!Number.isFinite(nextValue)) return;
            pagamentosMap.set(id, (pagamentosMap.get(id) || 0) + nextValue);
          });
        }

        if (rows.length < pageSizeExport) break;
      pagina += 1;
    }

    return { vendas: todas, pagamentosMap: pagamentosMap.size ? pagamentosMap : null };
  }

  async function prepararRecibosParaExport(): Promise<ReciboEnriquecido[]> {
    if (exportando) return [];
    if (!userCtx) {
      showToast("Aguarde o carregamento do usuário antes de exportar.", "warning");
      return [];
    }
    try {
      setExportando(true);
      const exportResult = await carregarVendasParaExport();
      const vendasExport = exportResult.vendas;
      const vendaIds = vendasExport.map((v) => v.id).filter(Boolean);
      const pagamentosMap = exportResult.pagamentosMap
        ? exportResult.pagamentosMap
        : await carregarPagamentosNaoComissionaveis(vendaIds, supabase);
      const recibosExport = construirRecibosEnriquecidos(vendasExport, pagamentosMap);
      return filtrarRecibos(recibosExport);
    } catch (e) {
      console.error("Erro ao preparar exportação:", e);
      showToast("Erro ao preparar exportação.", "error");
      return [];
    } finally {
      setExportando(false);
    }
  }

  useEffect(() => {
    if (userCtx && !filtrosLocaisAtivos) {
      carregarVendas();
    }
  }, [userCtx, page, pageSize]);

  function aplicarPeriodoPreset(tipo: "hoje" | "7" | "30" | "mes_atual" | "mes_anterior" | "limpar") {
    setPeriodoPreset(tipo);
    const hoje = new Date();

    if (tipo === "limpar") {
      setDataInicio("");
      setDataFim("");
      return;
    }

    if (tipo === "hoje") {
      const iso = hojeISO();
      setDataInicio(iso);
      setDataFim(iso);
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
  }

  async function exportarCSV() {
    const recibosParaExportar = await prepararRecibosParaExport();
    if (recibosParaExportar.length === 0) {
      showToast("Não há dados para exportar.", "warning");
      return;
    }

	    const header = [
	      "numero_recibo",
	      "cliente",
	      "cpf",
	      "tipo_pacote",
	      "cidade",
	      "produto",
	      "data_venda",
	      "data_embarque",
	      "valor_total",
        "valor_liquido",
        "comissao",
        "percentual_comissao",
	    ];

    const linhas = recibosParaExportar.map((r) => [
      r.numero_recibo || "",
      r.cliente_nome,
      r.cliente_cpf || "",
	      cleanTipoPacoteForRule(r.tipo_pacote) || r.tipo_pacote || "",
	      r.cidade_nome,
	      r.produto_nome,
	      r.data_venda || "",
	      r.data_embarque || "",
        (getBrutoRecibo(r) ?? 0).toString().replace(".", ","),
      getLiquidoComissionavel(r).toString().replace(".", ","),
      calcularComissaoRecibo(r).toString().replace(".", ","),
      formatNumberBR(calcularPercentualComissaoRecibo(r), 4),
	    ]);

    const all = [header, ...linhas]
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
    link.setAttribute("download", `relatorio-vendas-${ts}.csv`);
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
	    const recibosParaExportar = await prepararRecibosParaExport();
	    if (recibosParaExportar.length === 0) {
	      showToast("Não há dados para exportar.", "warning");
	      return;
	    }

	    try {
	      const module = await import("xlsx");
	      const XLSX = (module as any).default ?? module;
	      const data = recibosParaExportar.map((r) => ({
	        "Número recibo": r.numero_recibo || "",
	        Cliente: r.cliente_nome,
	        CPF: r.cliente_cpf,
	        "Tipo de pacote": cleanTipoPacoteForRule(r.tipo_pacote) || r.tipo_pacote || "",
	        Cidade: r.cidade_nome,
	        Produto: r.produto_nome,
	        "Data venda": r.data_venda?.slice(0, 10) || "",
	        "Data embarque": r.data_embarque?.slice(0, 10) || "",
          "Valor total": getBrutoRecibo(r),
          "Valor líquido": getLiquidoComissionavel(r),
          Comissão: calcularComissaoRecibo(r),
          "% Comissão": `${formatNumberBR(calcularPercentualComissaoRecibo(r), 4)}%`,
	      }));

	      const ws = XLSX.utils.json_to_sheet(data);
	      const wb = XLSX.utils.book_new();
	      XLSX.utils.book_append_sheet(wb, ws, "Vendas");

	      const ts = new Date().toISOString().replace(/-|:|T/g, "").slice(0, 12);
	      XLSX.writeFile(wb, `relatorio-vendas-${ts}.xlsx`);
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
    const recibosParaExportar = await prepararRecibosParaExport();
    if (recibosParaExportar.length === 0) {
      showToast("Não há dados para exportar.", "warning");
      return;
    }

	    const headers = [
	      "Data venda",
	      "Nº Recibo",
	      "Cliente",
	      "CPF",
	      "Tipo de pacote",
      "Cidade",
      "Produto",
      "Data embarque",
      "Valor total",
      "Taxas",
      "Valor líquido",
      "Comissão",
      "%",
    ];
    const rows = recibosParaExportar.map((r) => {
	    const valorTotal = getBrutoRecibo(r);
	    const valorTaxas = getTaxasEfetivas(r);
	    const valorLiquido = getLiquidoComissionavel(r);
	      const comissao = calcularComissaoRecibo(r);
        const percentual = calcularPercentualComissaoRecibo(r);

	      return [
	        r.data_venda?.slice(0, 10) || "",
	        r.numero_recibo || "",
	        r.cliente_nome,
	        r.cliente_cpf,
        cleanTipoPacoteForRule(r.tipo_pacote) || r.tipo_pacote || "",
        r.cidade_nome,
        r.produto_nome,
        r.data_embarque?.slice(0, 10) || "",
	      formatCurrency(valorTotal),
	      formatCurrency(valorTaxas),
	      formatCurrency(valorLiquido),
        formatCurrency(comissao),
        `${formatNumberBR(percentual, 4)}%`,
      ];
    });

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

    rows.push([
      "Totais",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      formatCurrency(somaValores),
      formatCurrency(somaTaxas),
      formatCurrency(somaLiquido),
      formatCurrency(somaComissao),
      "",
    ]);

    try {
      await exportTableToPDF({
        title: "Relatório de Vendas",
        subtitle,
        headers,
        rows,
        fileName: "relatorio-vendas",
        orientation: "landscape",
      });
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      showToast("Não foi possível exportar PDF. Recarregue a página e tente novamente.", "error");
    }
  }

  function exportarSelecionado() {
    if (exportTipo === "csv") {
      exportarCSV();
      return;
    }
    if (exportTipo === "excel") {
      exportarExcel();
      return;
    }
    exportarPDF();
  }

  const exportDisabled =
    (exportTipo === "excel" && !exportFlags.excel) ||
    (exportTipo === "pdf" && !exportFlags.pdf);
  const todosValue = userCtx?.papel === "MASTER" ? "all" : "todos";
  if (loadingUser) return <LoadingUsuarioContext />;

  const aplicarFiltrosRelatorio = () => {
    setPage(1);
    carregarVendas(1);
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
        ? "Relatório limitado ao seu portfólio."
        : "Relatório limitado à suas vendas."
      : null;

  const renderClienteField = () => (
    <div className="vtur-city-picker">
      <AppField
        label="Cliente"
        value={clienteBusca}
        onChange={(e) => {
          setClienteBusca(e.target.value);
          setClienteSelecionado(null);
        }}
        placeholder="Nome ou CPF..."
      />
      {clienteBusca && !clienteSelecionado ? (
        <div className="vtur-city-dropdown vtur-quote-client-dropdown">
          {clientesFiltrados.length === 0 ? (
            <div className="vtur-subdivisao-helper">Nenhum cliente encontrado.</div>
          ) : (
            clientesFiltrados.slice(0, 12).map((cliente) => (
              <AppButton
                key={cliente.id}
                type="button"
                variant="ghost"
                className="vtur-city-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setClienteSelecionado(cliente);
                  setClienteBusca(cliente.nome);
                }}
              >
                <span className="vtur-choice-button-content">
                  <span className="vtur-choice-button-title">{cliente.nome}</span>
                  <span>{cliente.cpf || "Sem CPF"}</span>
                </span>
              </AppButton>
            ))
          )}
        </div>
      ) : null}
      {clienteSelecionado ? (
        <p className="vtur-report-selection-note">
          Selecionado: <strong>{clienteSelecionado.nome}</strong>
        </p>
      ) : null}
    </div>
  );

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
            setMostrarSugestoesCidade(true);
          }
        }}
        onFocus={() => {
          if (cidadeNomeInput.trim().length >= 2) {
            setMostrarSugestoesCidade(true);
          }
        }}
        onBlur={() => {
          setTimeout(() => setMostrarSugestoesCidade(false), 150);
          if (!cidadeNomeInput.trim()) {
            setCidadeFiltro("");
            return;
          }
          const match = cidades.find(
            (cidade) => normalizeText(cidade.nome) === normalizeText(cidadeNomeInput)
          );
          if (match) {
            setCidadeFiltro(match.id);
            setCidadeNomeInput(match.nome);
          }
        }}
      />
      {mostrarSugestoesCidade && cidadeNomeInput.trim().length >= 1 ? (
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
                  setMostrarSugestoesCidade(false);
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
        { id: "7", label: "Últimos 7 dias" },
        { id: "mes_atual", label: "Este mês" },
        { id: "mes_anterior", label: "Mês anterior" },
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
      <AppButton type="button" variant="primary" onClick={aplicarFiltrosRelatorio}>
        Aplicar filtros
      </AppButton>
      <AppButton type="button" variant="secondary" onClick={() => setShowExport(true)}>
        Exportar
      </AppButton>
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
            value={vendedorFiltro || todosValue}
            onChange={(e) => setVendedorFiltro(e.target.value)}
            options={[
              { label: "Todos", value: todosValue },
              ...vendedoresEquipe.map((vendedor) => ({
                label: vendedor.nome_completo,
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
        {renderClienteField()}
        {renderCidadeField()}
        <AppField
          as="select"
          label="Tipo produto"
          value={tipoSelecionadoId}
          onChange={(e) => setTipoSelecionadoId(e.target.value)}
          options={[
            { label: "Todos os tipos", value: "" },
            ...tiposProdutos.map((tipo) => ({
              label: tipo.nome || tipo.tipo || `(ID: ${tipo.id})`,
              value: tipo.id,
            })),
          ]}
        />
        <AppField
          label="Produto"
          value={destinoBusca}
          onChange={(e) => setDestinoBusca(e.target.value)}
          placeholder="Nome do produto..."
        />
      </div>
      <div style={{ marginTop: 16 }}>{renderPeriodButtons()}</div>
    </>
  );

  return (
    <AppPrimerProvider>
      <div className="relatorio-vendas-page page-content-wrap">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        <AppCard
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Relatório de vendas"
          subtitle={`Gerencie indicadores de vendas com visao de CRM. Periodo: ${periodoResumo}. ${filtrosLocaisAtivos ? "Filtros locais ativos." : "Sem filtros locais de cliente, cidade ou produto."}`}
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton
                type="button"
                variant="secondary"
                className="vtur-relatorio-vendas-filters-mobile"
                onClick={() => setShowFilters(true)}
              >
                Filtros
              </AppButton>
            </div>
          }
        >
          <div className="vtur-relatorio-vendas-filters-inline">{renderFiltersGrid()}</div>
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
                subtitle="Ajuste datas, escopo, cliente, cidade, tipo de produto e faixas de valor."
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

        <AppCard
          className="mb-3"
          title="Resumo do relatório"
          subtitle="Volume total de recibos e base financeira do período selecionado, independente da pagina atual."
        >
          <div className="vtur-quote-summary-grid">
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Recibos</span>
              <strong>{totalRecibos}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Base bruta</span>
              <strong>{formatCurrency(somaValores)}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Taxas</span>
              <strong>{formatCurrency(somaTaxas)}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Base líquida</span>
              <strong>{formatCurrency(somaLiquido)}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Ticket médio</span>
              <strong>{formatCurrency(ticketMedio)}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Comissão</span>
              <strong>{formatCurrency(somaComissao)}</strong>
            </div>
          </div>
        </AppCard>

        <AppCard
          title="Recibos encontrados"
          subtitle="Listagem consolidada com produto, cidade, embarque, valores, taxas e comissão por recibo."
        >
          <div className="mb-3">
            <PaginationControls
              page={paginaAtual}
              pageSize={pageSize}
              totalItems={totalItems}
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
                <th>Data venda</th>
                <th>Nº Recibo</th>
                <th>Cliente</th>
                <th>CPF</th>
                <th>Tipo de pacote</th>
                <th>Cidade</th>
                <th>Produto</th>
                <th>Data embarque</th>
                <th>Valor total</th>
                <th>Taxas</th>
                <th>Valor líquido</th>
                <th>Comissão</th>
                <th>%</th>
              </tr>
            }
            loading={loading}
            loadingMessage="Carregando vendas..."
            empty={!loading && recibosExibidos.length === 0}
            emptyMessage={
              <EmptyState
                title="Nenhum recibo encontrado"
                description="Ajuste datas, escopo ou filtros locais para ampliar o recorte do relatório."
              />
            }
            colSpan={13}
            className="table-header-blue table-mobile-cards min-w-[1100px]"
          >
            {recibosExibidos.map((recibo) => {
              const comissao = comissaoPorRecibo.get(recibo.id) ?? 0;
              const percentualComissao = percentualComissaoPorRecibo.get(recibo.id) ?? 0;
              return (
                <tr key={recibo.id}>
                  <td data-label="Data venda">{recibo.data_venda ? formatDateBR(recibo.data_venda) : "-"}</td>
                  <td data-label="Nº Recibo">{recibo.numero_recibo || "-"}</td>
                  <td data-label="Cliente">{recibo.cliente_nome}</td>
                  <td data-label="CPF">{recibo.cliente_cpf}</td>
                  <td data-label="Tipo de pacote">
                    {cleanTipoPacoteForRule(recibo.tipo_pacote) || recibo.tipo_pacote || "-"}
                  </td>
                  <td data-label="Cidade">{recibo.cidade_nome || "-"}</td>
                  <td data-label="Produto">{recibo.produto_nome}</td>
                  <td data-label="Data embarque">
                    {recibo.data_embarque ? formatDateBR(recibo.data_embarque) : "-"}
                  </td>
                  <td data-label="Valor total">{formatCurrency(getBrutoRecibo(recibo))}</td>
                  <td data-label="Taxas">{formatCurrency(getTaxasEfetivas(recibo))}</td>
                  <td data-label="Valor líquido">{formatCurrency(getLiquidoComissionavel(recibo))}</td>
                  <td data-label="Comissão">{formatCurrency(comissao)}</td>
                  <td data-label="%">{`${formatNumberBR(percentualComissao, 4)}%`}</td>
                </tr>
              );
            })}
          </DataTable>
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}
