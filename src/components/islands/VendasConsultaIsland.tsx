import React, { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { registrarLog } from "../../lib/logs";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import { buildQueryLiteKey, invalidateQueryLiteByPrefix, queryLite } from "../../lib/queryLite";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { construirLinkWhatsApp } from "../../lib/whatsapp";
import { normalizeText } from "../../lib/normalizeText";
import { buildMonthOptionsYYYYMM, formatCurrencyBRL, formatDateBR, formatMonthYearBR, formatNumberBR } from "../../lib/format";
import { buildReciboSearchTokens, matchesReciboSearch } from "../../lib/searchNormalization";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import { ToastStack, useToastQueue } from "../ui/Toast";
import PaginationControls from "../ui/PaginationControls";
import { fetchGestorEquipeIdsComGestor } from "../../lib/gestorEquipe";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

function formatarDataCorretamente(dataString: string | null | undefined): string {
  if (!dataString) return "-";
  return formatDateBR(dataString);
}

function formatCurrency(value: number) {
  return formatCurrencyBRL(value);
}

type PeriodoPreset = "todos" | "mes_atual" | "mes_anterior" | "mes" | "dia";
type PeriodoFiltro = { kind: "all" } | { kind: "range"; inicio: string; fim: string };

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateToISODateLocal(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthValueLocal(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function getMonthBounds(monthValue: string): { inicio: string; fim: string } | null {
  const m = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (!Number.isFinite(year) || monthIdx < 0 || monthIdx > 11) return null;
  const inicioDate = new Date(year, monthIdx, 1);
  const fimDate = new Date(year, monthIdx + 1, 0);
  return { inicio: dateToISODateLocal(inicioDate), fim: dateToISODateLocal(fimDate) };
}

function isSeguroRecibo(recibo: Recibo) {
  const tipo = recibo.tipo_produtos?.tipo?.toLowerCase() || "";
  const nome = (recibo.tipo_produtos?.nome || recibo.produto_nome || "").toLowerCase();
  return tipo.includes("seguro") || nome.includes("seguro");
}

function obterResumoReciboComplementar(recibo?: Recibo, venda?: Venda) {
  const numero = recibo?.numero_recibo ? `Recibo ${recibo.numero_recibo}` : "Recibo";
  const cliente = venda?.cliente_nome || "Cliente";
  const titulo = `${numero} - ${cliente}`.trim();
  const produto = recibo?.produto_nome || "";
  const destino = venda?.destino_cidade_nome || venda?.destino_nome || "";
  const valor = typeof recibo?.valor_total === "number" ? formatCurrency(recibo.valor_total) : "";
  const detalhes = [produto, destino, valor].filter(Boolean).join(" - ");
  return { titulo, detalhes };
}

function criarChaveBuscaReciboComplementar(recibo?: Recibo, venda?: Venda) {
  const reciboTokens = buildReciboSearchTokens(recibo?.numero_recibo).join(" ");
  const texto = [
    recibo?.numero_recibo,
    reciboTokens,
    recibo?.id,
    recibo?.produto_nome,
    venda?.cliente_nome,
    venda?.destino_nome,
    venda?.destino_cidade_nome,
    venda?.id,
  ]
    .filter(Boolean)
    .join(" ");
  return normalizeText(texto);
}

function stripLeadingProdutoCodigo(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/^\s*\d{5,}\s*[-‐‑‒–—―−﹣－]\s*/, "").trim();
  return stripped || trimmed;
}

function getFornecedorProdutoNome(fornecedor: any) {
  const tipo = normalizeText(fornecedor?.tipo_servico || "");
  const categoria = normalizeText(fornecedor?.categoria || "");
  if (tipo.includes("receptivo") || categoria.includes("receptivo")) {
    const base = stripLeadingProdutoCodigo(fornecedor?.servico || fornecedor?.descricao || fornecedor?.nome || null);
    return base || null;
  }
  return fornecedor?.nome || null;
}

type PagamentoVenda = {
  id: string;
  venda_id: string;
  forma_pagamento_id?: string | null;
  forma_nome?: string | null;
  operacao?: string | null;
  plano?: string | null;
  valor_bruto?: number | null;
  desconto_valor?: number | null;
  valor_total?: number | null;
  parcelas?: any[] | null;
  parcelas_qtd?: number | null;
  parcelas_valor?: number | null;
  vencimento_primeira?: string | null;
  paga_comissao?: boolean | null;
};


type Venda = {
  id: string;
  vendedor_id?: string | null;
  vendedor_nome?: string;
  cliente_id: string;
  destino_id: string;
  destino_cidade_id?: string | null;
  company_id?: string | null;
  data_lancamento: string;
  data_venda: string;
  data_embarque: string | null;
  data_final?: string | null;
  valor_total?: number | null;
  cliente_nome?: string;
  destino_nome?: string;
  destino_cidade_nome?: string;
  clientes?: { whatsapp?: string | null } | null;
};

type Recibo = {
  id: string;
  venda_id: string;
  produto_id: string | null;
  produto_resolvido_id?: string | null;
  numero_recibo: string | null;
  numero_reserva?: string | null;
  tipo_pacote?: string | null;
  valor_total: number | null;
  valor_taxas: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  produto_nome?: string | null;
  tipo_produtos?: { id: string; nome?: string | null; tipo?: string | null } | null;
  contrato_url?: string | null;
};

type ReciboComplementar = {
  id: string;
  venda_id: string;
  recibo_id: string;
};

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

type UserCtx = {
  usuarioId: string;
  papel: Papel;
  vendedorIds: string[];
  companyId?: string | null;
  usoIndividual?: boolean | null;
};

type CampoBusca =
  | "todos"
  | "cliente"
  | "vendedor"
  | "destino"
  | "produto"
  | "recibo";

export default function VendasConsultaIsland() {
  // ================================
  // PERMISSÕES
  // ================================
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;

  const podeVer = can("Vendas");
  const podeCriar = can("Vendas", "create");
  const podeEditar = can("Vendas", "edit");
  const podeExcluir = can("Vendas", "delete");
  const isAdmin = can("Vendas", "admin");

  // ================================
  // ESTADOS
  // ================================
  const [userCtx, setUserCtx] = useState<UserCtx | null>(null);
  const isMaster = /MASTER/i.test(String(userType || ""));
  const masterScope = useMasterScope(Boolean(isMaster && ready));
  const [loadingUser, setLoadingUser] = useState(true);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [recibosComplementares, setRecibosComplementares] = useState<ReciboComplementar[]>([]);
  const [busca, setBusca] = useState("");
  const [campoBusca, setCampoBusca] = useState<CampoBusca>("todos");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  const podeFiltrarVendedor = userCtx?.papel === "GESTOR" || userCtx?.papel === "MASTER";

  // modal
  const [modalVenda, setModalVenda] = useState<Venda | null>(null);
  const [recibosNotas, setRecibosNotas] = useState<Record<string, any>>({});
  const [modalReciboDetalhe, setModalReciboDetalhe] = useState<{ reciboId: string; notas: any } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [excluindoRecibo, setExcluindoRecibo] = useState<string | null>(null);
  const [buscaReciboComplementar, setBuscaReciboComplementar] = useState("");
  const [mostrarComplementares, setMostrarComplementares] = useState(false);
  const [vinculandoComplementar, setVinculandoComplementar] = useState(false);
  const [removendoComplementar, setRemovendoComplementar] = useState<string | null>(null);
  const [mergeVendas, setMergeVendas] = useState<Venda[]>([]);
  const [mergeBusca, setMergeBusca] = useState("");
  const [mergeSelecionadas, setMergeSelecionadas] = useState<string[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeExecutando, setMergeExecutando] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState<{
    vendaId: string;
    mergeIds: string[];
  } | null>(null);
  const [confirmVendaCancelamento, setConfirmVendaCancelamento] = useState<Venda | null>(null);
  const [confirmReciboExclusao, setConfirmReciboExclusao] = useState<{ id: string; vendaId: string } | null>(
    null
  );
  const [confirmComplementarRemover, setConfirmComplementarRemover] = useState<ReciboComplementar | null>(
    null
  );
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });
  const [kpiMesAtual, setKpiMesAtual] = useState({
    totalVendas: 0,
    totalTaxas: 0,
    totalLiquido: 0,
    totalSeguro: 0,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalVendasDb, setTotalVendasDb] = useState(0);
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("mes_atual");
  const [periodoMes, setPeriodoMes] = useState(() => monthValueLocal(new Date()));
  const [periodoDia, setPeriodoDia] = useState(() => dateToISODateLocal(new Date()));
  const [periodoDiaFim, setPeriodoDiaFim] = useState(() => dateToISODateLocal(new Date()));
  const lastLoadedPeriodoKeyRef = useRef<string>("");

  const monthOptions = useMemo(() => {
    // Limitar para apenas meses até o mês corrente (sem meses futuros)
    const options = buildMonthOptionsYYYYMM({ yearsBack: 10, yearsForward: 0, order: "desc" });
    if (periodoMes && !options.includes(periodoMes)) return [periodoMes, ...options];
    return options;
  }, [periodoMes]);

  const periodoFiltro = useMemo<PeriodoFiltro>(() => {
    const hoje = new Date();
    const hojeISO = dateToISODateLocal(hoje);
    switch (periodoPreset) {
      case "todos": {
        return { kind: "all" };
      }
      case "mes_anterior": {
        const base = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const inicio = dateToISODateLocal(base);
        const fim = dateToISODateLocal(new Date(base.getFullYear(), base.getMonth() + 1, 0));
        return { kind: "range", inicio, fim };
      }
      case "mes": {
        const bounds = getMonthBounds(periodoMes);
        if (bounds) return { kind: "range", inicio: bounds.inicio, fim: bounds.fim };
        const inicio = dateToISODateLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
        return { kind: "range", inicio, fim: hojeISO };
      }
      case "dia": {
        const inicio = periodoDia || hojeISO;
        const fimRaw = periodoDiaFim || inicio;
        const fim = inicio && fimRaw && fimRaw < inicio ? inicio : fimRaw;
        return { kind: "range", inicio, fim };
      }
      case "mes_atual":
      default: {
        const inicio = dateToISODateLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
        return { kind: "range", inicio, fim: hojeISO };
      }
    }
  }, [periodoPreset, periodoMes, periodoDia, periodoDiaFim]);

  const periodoFiltroKey = useMemo(() => {
    if (periodoFiltro.kind === "all") return "all";
    return `range:${periodoFiltro.inicio}:${periodoFiltro.fim}`;
  }, [periodoFiltro]);

  // ================================
  // CONTEXTO DE USUÁRIO (papel/vendedorIds)
  // ================================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) setPendingOpenId(idParam);
  }, []);

  useEffect(() => {
    async function carregarUserCtx() {
      try {
        setErro(null);
        setLoadingUser(true);

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) {
          setErro("Usuário não autenticado.");
          return;
        }

        const { data: usuarioDb } = await supabase
          .from("users")
          .select("id, user_types(name), company_id, uso_individual")
          .eq("id", userId)
          .maybeSingle();

        const tipoName =
          ((usuarioDb as any)?.user_types as any)?.name ||
          (auth?.user?.user_metadata as any)?.name ||
          "";
        const tipoNorm = String(tipoName || "").toUpperCase();
        const usoIndividual = Boolean((usuarioDb as any)?.uso_individual);
        const companyId = (usuarioDb as any)?.company_id || null;

        let papel: Papel = "VENDEDOR";
        if (tipoNorm.includes("ADMIN")) papel = "ADMIN";
        else if (tipoNorm.includes("MASTER")) papel = "MASTER";
        else if (tipoNorm.includes("GESTOR")) papel = "GESTOR";
        else if (tipoNorm.includes("VENDEDOR")) papel = "VENDEDOR";
        else papel = "OUTRO";

        let vendedorIds: string[] = [userId];

        if (usoIndividual) {
          papel = "VENDEDOR";
          vendedorIds = [userId];
          setUserCtx({ usuarioId: userId, papel, vendedorIds, companyId, usoIndividual });
          return;
        }

        if (papel === "MASTER") {
          vendedorIds = masterScope.vendedorIds;
          setUserCtx({ usuarioId: userId, papel, vendedorIds, companyId, usoIndividual });
          return;
        }

        if (papel === "GESTOR") {
          vendedorIds = await fetchGestorEquipeIdsComGestor(userId);
        } else if (papel === "ADMIN") {
          vendedorIds = []; // sem filtro
        }

        setUserCtx({ usuarioId: userId, papel, vendedorIds, companyId, usoIndividual });
      } catch (e) {
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
    if (!podeFiltrarVendedor && campoBusca === "vendedor") {
      setCampoBusca("todos");
    }
  }, [campoBusca, podeFiltrarVendedor]);

  function aplicarFiltroCompany(query: any) {
    if (!userCtx) return query;
    if (userCtx.papel === "MASTER") {
      const empresaSelecionada = masterScope.empresaSelecionada;
      if (empresaSelecionada && empresaSelecionada !== "all") {
        return query.eq("company_id", empresaSelecionada);
      }
      return query;
    }
    if (userCtx.companyId) {
      return query.eq("company_id", userCtx.companyId);
    }
    return query;
  }

  function getCompanyIdParam() {
    if (!userCtx) return "";
    if (userCtx.papel === "MASTER") {
      return masterScope.empresaSelecionada !== "all" ? masterScope.empresaSelecionada : "";
    }
    return String(userCtx.companyId || "");
  }

  // ================================
  // CARREGAR LISTA
  // ================================
  async function carregar(options?: { forceFresh?: boolean }) {
    if (!podeVer || !userCtx) return;

    try {
      setLoading(true);
      const forceFresh = options?.forceFresh === true;
      const buscaAtiva = busca.trim();
      const paginaAtual = Math.max(1, page);
      const tamanhoPagina = Math.max(1, pageSize);
      const openId = pendingOpenId;
      const fetchAll = Boolean(buscaAtiva && !openId);
      const wantKpis = !openId && paginaAtual === 1;
      const kpisParams = new URLSearchParams();

      if (!openId && userCtx.papel !== "ADMIN" && userCtx.vendedorIds.length === 0) {
        setVendas([]);
        setTotalVendasDb(0);
        setKpiMesAtual({ totalVendas: 0, totalTaxas: 0, totalLiquido: 0, totalSeguro: 0 });
        return;
      }

      const params = new URLSearchParams();
      if (openId) {
        params.set("id", openId);
        setCarregouTodos(true);
      } else {
        if (periodoFiltro.kind === "range") {
          params.set("inicio", periodoFiltro.inicio);
          params.set("fim", periodoFiltro.fim);
          kpisParams.set("inicio", periodoFiltro.inicio);
          kpisParams.set("fim", periodoFiltro.fim);
        }

        const companyIdParam =
          userCtx.papel === "MASTER"
            ? masterScope.empresaSelecionada !== "all"
              ? masterScope.empresaSelecionada
              : ""
            : String(userCtx.companyId || "");
        if (companyIdParam) {
          params.set("company_id", companyIdParam);
          kpisParams.set("company_id", companyIdParam);
        }

        if (userCtx.vendedorIds.length > 0) {
          params.set("vendedor_ids", userCtx.vendedorIds.join(","));
          kpisParams.set("vendedor_ids", userCtx.vendedorIds.join(","));
        }

        if (wantKpis) {
          params.set("include_kpis", "1");
        }

        if (fetchAll) {
          params.set("all", "1");
          setCarregouTodos(true);
        } else {
          params.set("page", String(paginaAtual));
          params.set("pageSize", String(tamanhoPagina));
          setCarregouTodos(false);
        }
      }

      if (forceFresh) {
        params.set("no_cache", "1");
        kpisParams.set("no_cache", "1");
      }

      const shouldCacheList = !forceFresh && !openId && !fetchAll;
      const listCacheKey = buildQueryLiteKey(["vendasList", userCtx.usuarioId, params.toString()]);
      const payload = await queryLite(
        listCacheKey,
        async () => {
          const resp = await fetch(`/api/v1/vendas/list?${params.toString()}`, {
            credentials: "same-origin",
          });
          if (!resp.ok) {
            const msg = await resp.text().catch(() => "");
            throw new Error(msg || `HTTP ${resp.status}`);
          }
          return resp.json();
        },
        { ttlMs: shouldCacheList ? 10_000 : 0 }
      );
      const vendasData = (payload?.items || []) as any[];
      const payloadKpis = payload?.kpis;

      if (!openId && !fetchAll) {
        setTotalVendasDb(Number(payload?.total ?? vendasData.length ?? 0));
      }

      const v = (vendasData || []).map((row: any) => {
        const cidadeId = row.destino_cidade_id || row.destinos?.cidade_id || "";
        const cidadeNome =
          row.destino_cidade?.nome || row.destinos?.cidades?.nome || "";
        return {
          id: row.id,
          vendedor_id: row.vendedor_id,
          vendedor_nome: row.vendedor?.nome_completo || "",
          cliente_id: row.cliente_id,
          destino_id: row.destino_id,
          destino_cidade_id: cidadeId,
          company_id: row.company_id,
          data_lancamento: row.data_lancamento,
          data_venda: row.data_venda,
          data_embarque: row.data_embarque,
          data_final: row.data_final,
          valor_total: row.valor_total,
          cliente_nome: row.clientes?.nome || "",
          destino_nome: row.destinos?.nome || "",
          destino_cidade_nome: cidadeNome || "",
          clientes: row.clientes,
        };
      });

      setVendas(v);
      const recibosEnriquecidos =
        (vendasData || []).flatMap((row: any) => {
          const lista = Array.isArray(row.recibos) ? row.recibos : [];
          return lista.map((r: any) => {
            const produtoResolvidoNome = r?.produto_resolvido?.nome || "";
            const tipoNome = r?.tipo_produtos?.nome || "";
            const { produto_resolvido, ...rest } = r || {};
            return {
              ...rest,
              produto_nome: produtoResolvidoNome || tipoNome || "",
              produto_resolvido_id: rest?.produto_resolvido_id ?? null,
            } as any;
          });
        }) || [];

      setRecibos(recibosEnriquecidos);

      const complementaresLista =
        (vendasData || []).flatMap((row: any) =>
          Array.isArray(row.complementares) ? row.complementares : []
        ) || [];
      setRecibosComplementares(complementaresLista as ReciboComplementar[]);

      if (pendingOpenId) {
        const alvo = v.find((i) => i.id === pendingOpenId);
        if (alvo) setModalVenda(alvo);
        setPendingOpenId(null);
      }

      if (wantKpis) {
        const hasKpis =
          payloadKpis &&
          typeof payloadKpis === "object" &&
          ["totalVendas", "totalTaxas", "totalLiquido", "totalSeguro"].every(
            (k) => (payloadKpis as any)[k] !== undefined
          );

        if (hasKpis) {
          setKpiMesAtual({
            totalVendas: Number((payloadKpis as any)?.totalVendas || 0),
            totalTaxas: Number((payloadKpis as any)?.totalTaxas || 0),
            totalLiquido: Number((payloadKpis as any)?.totalLiquido || 0),
            totalSeguro: Number((payloadKpis as any)?.totalSeguro || 0),
          });
        } else if (userCtx.papel !== "ADMIN" && userCtx.vendedorIds.length === 0) {
          setKpiMesAtual({ totalVendas: 0, totalTaxas: 0, totalLiquido: 0, totalSeguro: 0 });
        } else {
          const shouldCacheKpis = !forceFresh;
          const kpisCacheKey = buildQueryLiteKey(["vendasKpis", userCtx.usuarioId, kpisParams.toString()]);
          const kpisData = await queryLite(
            kpisCacheKey,
            async () => {
              const kpisResp = await fetch(`/api/v1/vendas/kpis?${kpisParams.toString()}`, {
                credentials: "same-origin",
              });
              if (!kpisResp.ok) throw new Error("kpis");
              return kpisResp.json();
            },
            { ttlMs: shouldCacheKpis ? 15_000 : 0 }
          ).catch(() => null);
          if (kpisData) {
            setKpiMesAtual({
              totalVendas: Number(kpisData?.totalVendas || 0),
              totalTaxas: Number(kpisData?.totalTaxas || 0),
              totalLiquido: Number(kpisData?.totalLiquido || 0),
              totalSeguro: Number(kpisData?.totalSeguro || 0),
            });
          }
        }
      }

      if (!openId) {
        lastLoadedPeriodoKeyRef.current = periodoFiltroKey;
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar vendas.");
      showToast("Erro ao carregar vendas.", "error");
    } finally {
      setLoading(false);
    }
  }

  function invalidateVendasCaches() {
    if (!userCtx?.usuarioId) return;
    invalidateQueryLiteByPrefix(`vendasList|${userCtx.usuarioId}|`);
    invalidateQueryLiteByPrefix(`vendasKpis|${userCtx.usuarioId}|`);
  }

  useEffect(() => {
    if (loadPerm || !podeVer || !userCtx) return;
    const buscaAtiva = busca.trim();
    if (buscaAtiva) {
      const periodoMudou = lastLoadedPeriodoKeyRef.current !== periodoFiltroKey;
      if (!carregouTodos || periodoMudou) {
        carregar();
      }
      return;
    }
    carregar();
  }, [loadPerm, podeVer, userCtx, page, pageSize, busca, periodoFiltroKey]);

  useEffect(() => {
    setBuscaReciboComplementar("");
    setMostrarComplementares(false);
    setRemovendoComplementar(null);
    setVinculandoComplementar(false);
    setMergeBusca("");
    setMergeSelecionadas([]);
    setMergeVendas([]);
    setMergeLoading(false);
    setConfirmMerge(null);
    if (modalVenda && podeEditar) {
      carregarVendasParaMesclar();
    }
  }, [modalVenda?.id, podeEditar]);

  useEffect(() => {
    if (!modalVenda) {
      setRecibosNotas({});
      setModalReciboDetalhe(null);
      return;
    }
    const params = new URLSearchParams({ venda_id: modalVenda.id });
    fetch(`/api/v1/vendas/recibo-notas?${params.toString()}`)
      .then(async (resp) => {
        if (!resp.ok) throw new Error(await resp.text());
        const payload = (await resp.json()) as { items?: Array<{ recibo_id: string; notas: any }> };
        const map: Record<string, any> = {};
        (payload.items || []).forEach((row) => {
          if (row?.recibo_id) map[row.recibo_id] = row.notas;
        });
        setRecibosNotas(map);
      })
      .catch((error) => {
        console.error(error);
        setRecibosNotas({});
      });
  }, [modalVenda?.id]);

  const placeholderBusca = useMemo(() => {
    switch (campoBusca) {
      case "cliente":
        return "Nome do cliente...";
      case "vendedor":
        return "Nome do vendedor...";
      case "destino":
        return "Destino ou cidade...";
      case "produto":
        return "Produto do recibo...";
      case "recibo":
        return "Numero do recibo...";
      default:
        return "Nome, destino, produto ou recibo...";
    }
  }, [campoBusca]);

  // ================================
  // FILTRO
  // ================================
  const vendasFiltradas = useMemo(() => {
    if (!busca.trim()) return vendas;

    const termoRaw = busca;
    const t = normalizeText(termoRaw);

    const produtosPorVenda = new Map<string, string[]>();
    const recibosPorVenda = new Map<string, string[]>();
    recibos.forEach((recibo) => {
      if (!recibo.venda_id) return;
      const nome = recibo.produto_nome || "";
      if (nome) {
        const lista = produtosPorVenda.get(recibo.venda_id) || [];
        lista.push(nome);
        produtosPorVenda.set(recibo.venda_id, lista);
      }

      const numero = recibo.numero_recibo || "";
      if (numero) {
        const listaNumeros = recibosPorVenda.get(recibo.venda_id) || [];
        listaNumeros.push(numero);
        recibosPorVenda.set(recibo.venda_id, listaNumeros);
      }
    });

    const inclui = (valor?: string | null) => normalizeText(valor || "").includes(t);

    return vendas.filter((v) => {
      const produtos = produtosPorVenda.get(v.id) || [];
      const recibosVenda = recibosPorVenda.get(v.id) || [];
      const matchCliente = inclui(v.cliente_nome);
      const matchVendedor = inclui(v.vendedor_nome);
      const matchDestino = inclui(v.destino_nome) || inclui(v.destino_cidade_nome);
      const matchProduto = produtos.some((p) => normalizeText(p).includes(t));
      const matchRecibo = recibosVenda.some(
        (n) => matchesReciboSearch(n, termoRaw) || normalizeText(n).includes(t)
      );

      switch (campoBusca) {
        case "cliente":
          return matchCliente;
        case "vendedor":
          return podeFiltrarVendedor ? matchVendedor : false;
        case "destino":
          return matchDestino;
        case "produto":
          return matchProduto;
        case "recibo":
          return matchRecibo;
        default:
          return (
            matchCliente ||
            (podeFiltrarVendedor ? matchVendedor : false) ||
            matchDestino ||
            matchProduto ||
            matchRecibo
          );
      }
    });
  }, [vendas, busca, recibos, campoBusca, podeFiltrarVendedor]);
  const usaPaginacaoServidor = !busca.trim() && !carregouTodos;
  const totalVendas = usaPaginacaoServidor ? totalVendasDb : vendasFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalVendas / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPaginas);
  const vendasExibidas = useMemo(() => {
    if (usaPaginacaoServidor) return vendas;
    const inicio = (paginaAtual - 1) * pageSize;
    return vendasFiltradas.slice(inicio, inicio + pageSize);
  }, [usaPaginacaoServidor, vendas, vendasFiltradas, paginaAtual, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [busca, campoBusca, periodoPreset, periodoMes, periodoDia, periodoDiaFim]);

  useEffect(() => {
    if (page > totalPaginas) {
      setPage(totalPaginas);
    }
  }, [page, totalPaginas]);

  const vendasPorId = useMemo(() => {
    return Object.fromEntries(vendas.map((v) => [v.id, v]));
  }, [vendas]);

  const recibosPorId = useMemo(() => {
    return Object.fromEntries(recibos.map((r) => [r.id, r]));
  }, [recibos]);

  const complementaresAtuais = useMemo(() => {
    if (!modalVenda) return [];
    return complementaresDaVenda(modalVenda.id);
  }, [modalVenda, recibosComplementares]);

  const complementaresAtuaisIds = useMemo(() => {
    return new Set(complementaresAtuais.map((item) => item.recibo_id));
  }, [complementaresAtuais]);

  const sugestoesReciboComplementar = useMemo(() => {
    if (!modalVenda) return [];
    const termo = normalizeText(buscaReciboComplementar.trim());
    if (termo.length < 2) return [];
    return recibos
      .filter((r) => r.venda_id !== modalVenda.id)
      .filter((r) => !complementaresAtuaisIds.has(r.id))
      .map((r) => {
        const vendaRef = vendasPorId[r.venda_id];
        return {
          recibo: r,
          venda: vendaRef,
          resumo: obterResumoReciboComplementar(r, vendaRef),
          chaveBusca: criarChaveBuscaReciboComplementar(r, vendaRef),
        };
      })
      .filter((item) => item.chaveBusca.includes(termo))
      .slice(0, 6);
  }, [
    buscaReciboComplementar,
    modalVenda,
    recibos,
    complementaresAtuaisIds,
    vendasPorId,
  ]);

  const mergeSelecionadasSet = useMemo(() => {
    return new Set(mergeSelecionadas);
  }, [mergeSelecionadas]);

  const vendasParaMesclar = useMemo(() => {
    if (!mergeBusca.trim()) return mergeVendas;
    const termo = normalizeText(mergeBusca);
    return mergeVendas.filter((v) => {
      const texto = [
        v.id,
        v.destino_nome,
        v.destino_cidade_nome,
        v.vendedor_nome,
        v.cliente_nome,
        v.data_lancamento,
        v.data_venda,
        v.data_embarque,
      ]
        .filter(Boolean)
        .join(" ");
      return normalizeText(texto).includes(termo);
    });
  }, [mergeBusca, mergeVendas]);

  // ================================
  // RECIBOS POR VENDA
  // ================================
  function recibosDaVenda(id: string) {
    return recibos
      .filter((r) => r.venda_id === id)
      .sort((a, b) => {
        const da = a.data_inicio || "";
        const db = b.data_inicio || "";
        if (da === db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? -1 : 1;
      });
  }

  function complementaresDaVenda(id: string) {
    return recibosComplementares.filter((r) => r.venda_id === id);
  }

  function obterReciboReferenciaDaVenda(venda?: Venda | null) {
    if (!venda) return null;
    const lista = recibosDaVenda(venda.id);
    if (lista.length === 0) return null;
    if (venda.destino_id) {
      const principal = lista.find((r) => r.produto_resolvido_id === venda.destino_id);
      if (principal) return principal;
    }
    return lista[0];
  }

  const textoPeriodoKpi = useMemo(() => {
    if (periodoFiltro.kind === "all") {
      return "Resultados de todas as vendas";
    }
    if (periodoFiltro.inicio === periodoFiltro.fim) {
      return `Resultados do dia ${formatarDataCorretamente(periodoFiltro.inicio)}`;
    }
    return `Resultados de ${formatarDataCorretamente(periodoFiltro.inicio)} até ${formatarDataCorretamente(periodoFiltro.fim)}`;
  }, [periodoFiltro]);

  // ================================
  // CANCELAR VENDA
  // ================================
  async function cancelarVenda(venda: Venda) {
    if (!podeExcluir && !isAdmin) return;
    if (!userCtx) return;
    if (userCtx.usoIndividual && venda.vendedor_id !== userCtx.usuarioId) {
      showToast("Você não tem permissão para cancelar esta venda.", "error");
      return;
    }

    try {
      setCancelando(true);
      const resp = await fetch("/api/v1/vendas/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venda_id: venda.id,
          company_id: getCompanyIdParam(),
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());

      // LOG
      await registrarLog({
        acao: "venda_cancelada",
        modulo: "Vendas",
        detalhes: { id: venda.id },
      });

      invalidateVendasCaches();
      await carregar({ forceFresh: true });
      setModalVenda(null);
      showToast("Venda cancelada.", "success");
    } catch (e) {
      console.error(e);
      setErro("Erro ao cancelar venda.");
      showToast("Erro ao cancelar venda.", "error");
    } finally {
      setCancelando(false);
    }
  }

  function solicitarCancelamentoVenda(venda: Venda) {
    if (!podeExcluir && !isAdmin) return;
    setConfirmVendaCancelamento(venda);
  }

  // ================================
  // EXCLUIR RECIBO
  // ================================
  async function excluirRecibo(id: string, vendaId: string) {
    if (!podeExcluir) return;
    if (!userCtx) return;
    const venda = vendasPorId[vendaId];
    if (!venda) {
      showToast("Venda não encontrada.", "error");
      return;
    }
    if (userCtx.usoIndividual && venda.vendedor_id !== userCtx.usuarioId) {
      showToast("Você não tem permissão para excluir este recibo.", "error");
      return;
    }

    try {
      setExcluindoRecibo(id);
      const resp = await fetch("/api/v1/vendas/recibo-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venda_id: vendaId,
          recibo_id: id,
          company_id: getCompanyIdParam(),
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());

      await registrarLog({
        acao: "recibo_excluido",
        modulo: "Vendas",
        detalhes: { recibo_id: id, venda_id: vendaId },
      });

      invalidateVendasCaches();
      await carregar({ forceFresh: true });
      showToast("Recibo excluído.", "success");
    } catch (e) {
      console.error(e);
      setErro("Erro ao excluir recibo.");
      showToast("Erro ao excluir recibo.", "error");
    } finally {
      setExcluindoRecibo(null);
    }
  }

  function solicitarExclusaoRecibo(id: string, vendaId: string) {
    if (!podeExcluir) return;
    setConfirmReciboExclusao({ id, vendaId });
  }

  // ================================
  // RECIBOS COMPLEMENTARES
  // ================================
  async function vincularReciboComplementar(reciboId: string, vendaId: string) {
    if (!podeEditar) return;
    const recibo = recibosPorId[reciboId];
    if (!recibo) {
      showToast("Recibo não encontrado.", "error");
      return;
    }
    if (recibo.venda_id === vendaId) {
      showToast("Este recibo já pertence a esta venda.", "error");
      return;
    }
    const vendaAtual = vendasPorId[vendaId];
    if (!vendaAtual) {
      showToast("Venda atual não encontrada.", "error");
      return;
    }
    const vendaRecibo = vendasPorId[recibo.venda_id];
    if (!vendaRecibo) {
      showToast("Venda do recibo complementar não encontrada.", "error");
      return;
    }

    // Coleta TODOS os recibos de ambas as vendas para criar links cruzados completos
    const recibosVendaAtual = recibosDaVenda(vendaAtual.id);
    const recibosVendaRecibo = recibosDaVenda(vendaRecibo.id);

    // Todos os recibos da venda do outro cliente → vinculados à venda atual
    const linksParaVendaAtual = recibosVendaRecibo
      .filter((r) => !recibosComplementares.some((c) => c.venda_id === vendaAtual.id && c.recibo_id === r.id))
      .map((r) => ({ venda_id: vendaAtual.id, recibo_id: r.id }));

    // Todos os recibos da venda atual → vinculados à venda do outro cliente
    const linksParaVendaRecibo = recibosVendaAtual
      .filter((r) => !recibosComplementares.some((c) => c.venda_id === vendaRecibo.id && c.recibo_id === r.id))
      .map((r) => ({ venda_id: vendaRecibo.id, recibo_id: r.id }));

    const todosLinks = [...linksParaVendaAtual, ...linksParaVendaRecibo];
    if (todosLinks.length === 0) {
      showToast("Todos os recibos já estão vinculados.", "info");
      return;
    }

    try {
      setVinculandoComplementar(true);
      const resp = await fetch("/api/v1/vendas/recibo-complementar-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_venda_id: vendaAtual.id,
          links: todosLinks,
          company_id: getCompanyIdParam(),
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());

      await registrarLog({
        acao: "recibo_complementar_vinculado",
        modulo: "Vendas",
        detalhes: {
          venda_id: vendaId,
          venda_cruzada_id: vendaRecibo.id,
          total_links: todosLinks.length,
        },
      });

      invalidateVendasCaches();
      await carregar({ forceFresh: true });
      setBuscaReciboComplementar("");
      showToast(`${todosLinks.length} recibo(s) complementar(es) vinculado(s).`, "success");
    } catch (e) {
      console.error(e);
      setErro("Erro ao vincular recibos complementares.");
      showToast("Erro ao vincular recibos complementares.", "error");
    } finally {
      setVinculandoComplementar(false);
    }
  }

  async function removerReciboComplementar(link: ReciboComplementar) {
    if (!podeEditar) return;

    try {
      setRemovendoComplementar(link.id);

      const recibo = recibosPorId[link.recibo_id];
      const vendaAtual = vendasPorId[link.venda_id];
      const vendaRecibo = recibo ? vendasPorId[recibo.venda_id] : undefined;
      const idsParaRemover = new Set([link.id]);

      if (vendaAtual && vendaRecibo) {
        const recibosVendaAtual = new Set(recibosDaVenda(vendaAtual.id).map((r) => r.id));
        const recibosVendaRecibo = new Set(recibosDaVenda(vendaRecibo.id).map((r) => r.id));
        recibosComplementares.forEach((item) => {
          // Direção cruzada: vendaRecibo tem recibos da vendaAtual vinculados
          if (item.venda_id === vendaRecibo.id && recibosVendaAtual.has(item.recibo_id)) {
            idsParaRemover.add(item.id);
          }
          // Direção direta: vendaAtual tem outros recibos da vendaRecibo vinculados
          if (item.venda_id === vendaAtual.id && recibosVendaRecibo.has(item.recibo_id)) {
            idsParaRemover.add(item.id);
          }
        });
      }

      const idsLista = Array.from(idsParaRemover);
      const resp = await fetch("/api/v1/vendas/recibo-complementar-remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsLista }),
      });
      if (!resp.ok) throw new Error(await resp.text());

      await registrarLog({
        acao: "recibo_complementar_removido",
        modulo: "Vendas",
        detalhes: {
          venda_id: link.venda_id,
          recibo_id: link.recibo_id,
          ids_removidos: idsLista,
        },
      });

      invalidateVendasCaches();
      await carregar({ forceFresh: true });
      showToast("Recibo complementar removido.", "success");
    } catch (e) {
      console.error(e);
      setErro("Erro ao remover recibo complementar.");
      showToast("Erro ao remover recibo complementar.", "error");
    } finally {
      setRemovendoComplementar(null);
    }
  }

  function solicitarRemocaoComplementar(link: ReciboComplementar) {
    if (!podeEditar) return;
    setConfirmComplementarRemover(link);
  }

  // ================================
  // MESCLAR VENDAS
  // ================================
  async function carregarVendasParaMesclar() {
    if (!modalVenda || !userCtx) return;

    try {
      setMergeLoading(true);

      const params = new URLSearchParams({
        venda_id: modalVenda.id,
      });
      const companyIdParam = getCompanyIdParam();
      if (companyIdParam) params.set("company_id", companyIdParam);
      if (userCtx.vendedorIds.length > 0) {
        params.set("vendedor_ids", userCtx.vendedorIds.join(","));
      }
      const resp = await fetch(`/api/v1/vendas/merge-candidates?${params.toString()}`);
      if (!resp.ok) throw new Error(await resp.text());
      const payload = (await resp.json()) as { items?: Venda[] };
      setMergeVendas(payload.items || []);
    } catch (e) {
      console.error(e);
      showToast("Erro ao carregar vendas para mesclar.", "error");
    } finally {
      setMergeLoading(false);
    }
  }

  function toggleVendaMescla(id: string) {
    setMergeSelecionadas((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  }

  function solicitarMescla() {
    if (!modalVenda) return;
    const mergeIds = mergeSelecionadas.filter((id) => id !== modalVenda.id);
    if (mergeIds.length === 0) {
      showToast("Selecione ao menos uma venda para mesclar.", "error");
      return;
    }
    setConfirmMerge({ vendaId: modalVenda.id, mergeIds });
  }

  async function mesclarVendasSelecionadas(vendaId: string, mergeIds: string[]) {
    if (!userCtx) return;

    const vendaPrincipalId = vendaId;
    const vendasFilhas = mergeIds.filter((id) => id && id !== vendaPrincipalId);
    if (vendasFilhas.length === 0) return;

    try {
      setMergeExecutando(true);
      setErro(null);

      const resp = await fetch("/api/v1/vendas/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venda_id: vendaPrincipalId,
          merge_ids: vendasFilhas,
          company_id: getCompanyIdParam(),
          vendedor_ids: userCtx.vendedorIds,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const mergePayload = (await resp.json()) as { removed_pagamentos?: number };

      await registrarLog({
        acao: "vendas_mescladas",
        modulo: "Vendas",
        detalhes: {
          venda_principal_id: vendaPrincipalId,
          vendas_mescladas: vendasFilhas,
          pagamentos_duplicados_removidos: Number(mergePayload?.removed_pagamentos || 0),
        },
      });

      invalidateVendasCaches();
      await carregar({ forceFresh: true });
      setModalVenda(null);
      setMergeSelecionadas([]);
      setMergeVendas([]);
      showToast("Vendas mescladas com sucesso.", "success");
    } catch (e) {
      console.error(e);
      setErro("Erro ao mesclar vendas.");
      showToast("Erro ao mesclar vendas.", "error");
    } finally {
      setMergeExecutando(false);
      setConfirmMerge(null);
    }
  }

  // ================================
  // BLOQUEIO TOTAL DE MÓDULO
  // ================================
  if (loadingUser || loadPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Acesso negado ao módulo de Vendas.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  // ================================
  // UI — LISTAGEM
  // ================================
  return (
    <AppPrimerProvider>
      <div className="page-content-wrap vendas-consulta-page">
        <AppCard
          className="mb-3 list-toolbar-sticky"
          tone="info"
          title="Consulta de Vendas"
          subtitle="Gerencie suas vendas com visão de CRM."
          actions={
            <div className="mobile-stack-buttons">
              <AppButton as="a" href="/vendas/importar" type="button" variant="secondary">
                Importar contratos
              </AppButton>
              <AppButton as="a" href="/vendas/cadastro" type="button" variant="primary">
                Nova venda
              </AppButton>
            </div>
          }
        >
          <div className="vtur-form-grid vtur-form-grid-4">
            <AppField
              as="select"
              label="Campo de busca"
              value={campoBusca}
              onChange={(e) => setCampoBusca(e.target.value as CampoBusca)}
              options={[
                { value: "todos", label: "Todos" },
                { value: "cliente", label: "Cliente" },
                ...(podeFiltrarVendedor ? [{ value: "vendedor", label: "Vendedor" }] : []),
                { value: "destino", label: "Destino" },
                { value: "produto", label: "Produto" },
                { value: "recibo", label: "Recibo" },
              ]}
            />
            <AppField
              label="Buscar venda"
              className="w-full search-input-field"
              placeholder={placeholderBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <AppField
              as="select"
              label="Período (data da venda)"
              value={periodoPreset}
              onChange={(e) => setPeriodoPreset(e.target.value as PeriodoPreset)}
              options={[
                { value: "todos", label: "Todos" },
                { value: "mes_atual", label: "Mês atual" },
                { value: "mes_anterior", label: "Mês anterior" },
                { value: "mes", label: "Escolher mês" },
                { value: "dia", label: "Data específica" },
              ]}
            />

            {periodoPreset === "mes" && (
              <AppField
                as="select"
                label="Mês"
                value={periodoMes}
                onChange={(e) => setPeriodoMes(e.target.value)}
                options={monthOptions.map((value) => ({
                  value,
                  label: formatMonthYearBR(value),
                }))}
              />
            )}

            {periodoPreset === "dia" && (
              <>
                <AppField
                  label="Data Início"
                  type="date"
                  value={periodoDia}
                  max={dateToISODateLocal(new Date())}
                  onFocus={selectAllInputOnFocus}
                  onChange={(e) => {
                    const nextInicio = e.target.value;
                    setPeriodoDia(nextInicio);
                    if (periodoDiaFim && nextInicio && periodoDiaFim < nextInicio) {
                      setPeriodoDiaFim(nextInicio);
                    }
                  }}
                />
                <AppField
                  label="Data Final"
                  type="date"
                  value={periodoDiaFim}
                  min={periodoDia || undefined}
                  max={dateToISODateLocal(new Date())}
                  onFocus={selectAllInputOnFocus}
                  onChange={(e) => {
                    const nextFim = e.target.value;
                    const boundedFim = periodoDia && nextFim && nextFim < periodoDia ? periodoDia : nextFim;
                    setPeriodoDiaFim(boundedFim);
                  }}
                />
              </>
            )}
          </div>

          {userCtx?.papel === "MASTER" && (
            <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 12 }}>
              <AppField
                as="select"
                label="Filial"
                value={masterScope.empresaSelecionada}
                onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)}
                options={[
                  { value: "all", label: "Todas" },
                  ...masterScope.empresasAprovadas.map((empresa) => ({
                    value: empresa.id,
                    label: empresa.nome_fantasia,
                  })),
                ]}
              />
              <AppField
                as="select"
                label="Equipe"
                value={masterScope.gestorSelecionado}
                onChange={(e) => masterScope.setGestorSelecionado(e.target.value)}
                options={[
                  { value: "all", label: "Todas" },
                  ...masterScope.gestoresDisponiveis.map((gestor) => ({
                    value: gestor.id,
                    label: gestor.nome_completo,
                  })),
                ]}
              />
              <AppField
                as="select"
                label="Vendedor"
                value={masterScope.vendedorSelecionado}
                onChange={(e) => masterScope.setVendedorSelecionado(e.target.value)}
                options={[
                  { value: "all", label: "Todos" },
                  ...masterScope.vendedoresDisponiveis.map((vendedor) => ({
                    value: vendedor.id,
                    label: vendedor.nome_completo,
                  })),
                ]}
              />
            </div>
          )}

          {userCtx?.papel === "MASTER" && masterScope.empresasAprovadas.length === 0 && (
            <div className="vtur-inline-note" style={{ color: "#b91c1c" }}>
              Nenhuma filial aprovada para este master.
            </div>
          )}
        </AppCard>

        <AppCard className="mb-2" tone="info">
          <div style={{ textAlign: "center", fontWeight: 700 }}>{textoPeriodoKpi}</div>
        </AppCard>

        <div className="dashboard-grid-kpi mb-3">
          <div className="kpi-card kpi-vendas">
            <div style={{ width: "100%", textAlign: "center" }}>
              <div className="kpi-label">Total de Vendas</div>
              <div className="kpi-value">{formatCurrency(kpiMesAtual.totalVendas)}</div>
            </div>
          </div>
          <div className="kpi-card kpi-diferenciado">
            <div style={{ width: "100%", textAlign: "center" }}>
              <div className="kpi-label">Seguro Viagem</div>
              <div className="kpi-value">{formatCurrency(kpiMesAtual.totalSeguro)}</div>
            </div>
          </div>
          <div className="kpi-card kpi-meta">
            <div style={{ width: "100%", textAlign: "center" }}>
              <div className="kpi-label">Taxas</div>
              <div className="kpi-value">{formatCurrency(kpiMesAtual.totalTaxas)}</div>
            </div>
          </div>
          <div className="kpi-card kpi-ticket">
            <div style={{ width: "100%", textAlign: "center" }}>
              <div className="kpi-label">Total Líquido</div>
              <div className="kpi-value">{formatCurrency(kpiMesAtual.totalLiquido)}</div>
            </div>
          </div>
        </div>

        {erro && (
          <div className="mb-3">
            <AlertMessage variant="error">{erro}</AlertMessage>
          </div>
        )}

        <div className="mb-3">
          <PaginationControls
            page={paginaAtual}
            pageSize={pageSize}
            totalItems={totalVendas}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>

        <DataTable
          shellClassName="mb-3"
          className="table-default table-header-green table-mobile-cards min-w-[820px]"
          containerClassName="vtur-scroll-y-65"
          headers={
            <tr>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Destino</th>
              <th>Produto</th>
              <th style={{ textAlign: "center" }}>Embarque</th>
              <th>Valor</th>
              <th>Taxas</th>
              {podeVer && <th className="th-actions" style={{ textAlign: "center" }}>Ações</th>}
            </tr>
          }
          loading={loading}
          loadingMessage="Carregando vendas..."
          empty={!loading && vendasExibidas.length === 0}
          emptyMessage={
            <EmptyState
              title="Nenhuma venda encontrada"
              description={
                busca.trim()
                  ? "Tente ajustar os filtros ou a busca para localizar vendas."
                  : "Ainda não há vendas para o período selecionado."
              }
              action={
                podeCriar ? (
                  <AppButton
                    type="button"
                    variant="primary"
                    onClick={() => {
                      window.location.href = "/vendas/cadastro";
                    }}
                  >
                    Nova venda
                  </AppButton>
                ) : null
              }
            />
          }
          colSpan={podeVer ? 8 : 7}
        >
          {vendasExibidas.map((v) => {
            const totalValor = recibosDaVenda(v.id).reduce((acc, r) => acc + (r.valor_total || 0), 0);
            const totalTaxas = recibosDaVenda(v.id).reduce((acc, r) => acc + (r.valor_taxas || 0), 0);
            const produtosVenda = recibosDaVenda(v.id)
              .map((r) => r.produto_nome || "")
              .filter(Boolean);
            const whatsappLink = construirLinkWhatsApp(v.clientes?.whatsapp);

            return (
              <tr key={v.id}>
                <td data-label="Cliente">{v.cliente_nome}</td>
                <td data-label="Vendedor">{v.vendedor_nome || "-"}</td>
                <td data-label="Destino">{v.destino_cidade_nome || "-"}</td>
                <td data-label="Produto">
                  {produtosVenda.length === 0 ? (
                    "-"
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {produtosVenda.map((p, idx) => (
                        <span key={`${v.id}-prod-${idx}`}>{p}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td data-label="Embarque" style={{ textAlign: "center" }}>
                  {formatarDataCorretamente(v.data_embarque)}
                </td>
                <td data-label="Valor">{formatCurrencyBRL(totalValor)}</td>
                <td data-label="Taxas">{totalTaxas === 0 ? "-" : formatCurrencyBRL(totalTaxas)}</td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    actions={[
                      ...(whatsappLink
                        ? [
                            {
                              key: "whatsapp",
                              label: "WhatsApp",
                              title: "Enviar WhatsApp",
                              onClick: () => window.open(whatsappLink, "_blank", "noopener,noreferrer"),
                              icon: <i className="pi pi-comments" aria-hidden="true" />,
                              variant: "ghost" as const,
                            },
                          ]
                        : []),
                      {
                        key: "details",
                        label: "Detalhes",
                        title: "Ver detalhes",
                        onClick: () => setModalVenda(v),
                        icon: <i className="pi pi-eye" aria-hidden="true" />,
                        variant: "primary" as const,
                      },
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </DataTable>

        {modalReciboDetalhe && (
          <div className="modal-backdrop modal-recibo">
            <div className="modal-panel vtur-modal-panel-shell" style={{ maxWidth: "920px" }}>
              <div className="modal-header vtur-modal-header">
                <div>
                  <div className="modal-title" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                    Visualização completa do recibo
                  </div>
                </div>
                <AppButton type="button" variant="secondary" onClick={() => setModalReciboDetalhe(null)}>
                  Fechar
                </AppButton>
              </div>
              <div className="modal-body vtur-modal-body-stack">
                {modalReciboDetalhe.notas?.servicos_inclusos && (
                  <AppCard title="Serviços inclusos" className="vtur-modal-section-card">
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                      {modalReciboDetalhe.notas.servicos_inclusos.texto}
                    </div>
                  </AppCard>
                )}
                {modalReciboDetalhe.notas?.roteiro_reserva && (
                  <AppCard title="Roteiro da Reserva" className="vtur-modal-section-card">
                    <div className="vtur-modal-detail-grid">
                      <div>
                        <strong>Contratante</strong>
                        <div>Nome: {modalReciboDetalhe.notas.roteiro_reserva.contratante?.nome || "-"}</div>
                        <div>Recibo: {modalReciboDetalhe.notas.roteiro_reserva.contratante?.recibo || "-"}</div>
                        <div>Valor: {formatCurrencyBRL(modalReciboDetalhe.notas.roteiro_reserva.contratante?.valor || 0)}</div>
                        <div>Taxa embarque: {formatCurrencyBRL(modalReciboDetalhe.notas.roteiro_reserva.contratante?.taxa_embarque || 0)}</div>
                        <div>Taxa DU: {formatCurrencyBRL(modalReciboDetalhe.notas.roteiro_reserva.contratante?.taxa_du || 0)}</div>
                      </div>
                      <div>
                        <strong>Roteiro</strong>
                        <div>Descrição: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.descricao || "-"}</div>
                        <div>Tipo de produto: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.tipo_produto || "-"}</div>
                        <div>Número do roteiro: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.numero || "-"}</div>
                        <div>Roteiro Systur: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.systur || "-"}</div>
                        <div>Saída: {formatarDataCorretamente(modalReciboDetalhe.notas.roteiro_reserva.roteiro?.data_saida)}</div>
                        <div>Retorno: {formatarDataCorretamente(modalReciboDetalhe.notas.roteiro_reserva.roteiro?.data_retorno)}</div>
                        <div>Vendedor: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.vendedor || "-"}</div>
                        <div>Office ID: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.office_id || "-"}</div>
                        <div>Voo: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.voo || "-"}</div>
                        <div>Mensagem: {modalReciboDetalhe.notas.roteiro_reserva.roteiro?.mensagem || "-"}</div>
                      </div>
                      <div>
                        <strong>Origem</strong>
                        <div>
                          {(modalReciboDetalhe.notas.roteiro_reserva.origem?.pais || "-")} /{" "}
                          {(modalReciboDetalhe.notas.roteiro_reserva.origem?.estado || "-")} /{" "}
                          {(modalReciboDetalhe.notas.roteiro_reserva.origem?.cidade || "-")}
                        </div>
                      </div>
                      <div>
                        <strong>Destino</strong>
                        <div>
                          {(modalReciboDetalhe.notas.roteiro_reserva.destino?.pais || "-")} /{" "}
                          {(modalReciboDetalhe.notas.roteiro_reserva.destino?.estado || "-")} /{" "}
                          {(modalReciboDetalhe.notas.roteiro_reserva.destino?.cidade || "-")}
                        </div>
                      </div>
                      <div>
                        <strong>Dados da Reserva</strong>
                        <div>Filial: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.filial || "-"}</div>
                        <div>Carrinho ID: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.carrinho_id || "-"}</div>
                        <div>Tipo de venda: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.tipo_venda || "-"}</div>
                        <div>Pedido: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.pedido || "-"}</div>
                        <div>Pedido dinâmico: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.pedido_dinamico || "-"}</div>
                        <div>Número da reserva: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.numero_reserva || "-"}</div>
                        <div>Vendedor da reserva: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.vendedor_reserva || "-"}</div>
                        <div>Data da reserva: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.data_reserva || "-"}</div>
                        <div>Remarcação: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.remarcacao || "-"}</div>
                        <div>Validade: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.validade_reserva || "-"}</div>
                        <div>Tipo reserva: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.tipo_reserva || "-"}</div>
                        <div>Tabela: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.tabela || "-"}</div>
                        <div>Observação: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.observacao || "-"}</div>
                        <div>Operador online: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.operador_online || "-"}</div>
                        <div>Tipo de pacote: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.tipo_pacote || "-"}</div>
                        <div>Desvio loja: {modalReciboDetalhe.notas.roteiro_reserva.dados_reserva?.desvio_loja || "-"}</div>
                      </div>
                      {modalReciboDetalhe.notas.roteiro_reserva.fornecedores?.length > 0 && (
                        <div>
                          <strong>Fornecedores</strong>
                          <div className="vtur-modal-subgrid">
                            {modalReciboDetalhe.notas.roteiro_reserva.fornecedores.map((f: any, i: number) => {
                              const produtoNome = getFornecedorProdutoNome(f);
                              const titulo = produtoNome || f.nome || null;
                              const mostrarFornecedor = Boolean(produtoNome && f.nome && produtoNome !== f.nome);
                              return (
                                <div key={`for-${i}`} className="vtur-modal-list-item">
                                  <div>
                                    <strong>{titulo || "-"}</strong>
                                  </div>
                                  {mostrarFornecedor && <div>Fornecedor: {f.nome || "-"}</div>}
                                  <div>Tipo: {f.tipo_servico || "-"}</div>
                                  <div>Nº acordo: {f.numero_acordo || "-"}</div>
                                  <div>Cidade: {f.cidade || "-"}</div>
                                  <div>Categoria: {f.categoria || "-"}</div>
                                  <div>Serviço: {f.servico || "-"}</div>
                                  <div>Transporte aéreo: {f.transporte_aereo || "-"}</div>
                                  <div>Trecho: {f.trecho || "-"}</div>
                                  <div>Data inicial: {formatarDataCorretamente(f.data_inicial)}</div>
                                  <div>Data final: {formatarDataCorretamente(f.data_final)}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {modalReciboDetalhe.notas.roteiro_reserva.passageiros?.length > 0 && (
                        <div>
                          <strong>Passageiros</strong>
                          <div className="vtur-modal-subgrid">
                            {modalReciboDetalhe.notas.roteiro_reserva.passageiros.map((p: any, i: number) => (
                              <div key={`pax-${i}`} className="vtur-modal-list-item">
                                <div>{[p.sobrenome, p.nome].filter(Boolean).join(" ") || "-"}</div>
                                <div>Nascimento: {formatarDataCorretamente(p.nascimento)}</div>
                                <div>Sexo: {p.sexo || "-"}</div>
                                <div>Idade: {p.idade || "-"}</div>
                                <div>Local embarque: {p.local_embarque || "-"}</div>
                                <div>Documento: {p.documento_numero || "-"}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {modalReciboDetalhe.notas.roteiro_reserva.orcamento && (
                        <div>
                          <strong>Orçamento</strong>
                          <div>Valor total: {formatCurrencyBRL(modalReciboDetalhe.notas.roteiro_reserva.orcamento.valor_total || 0)}</div>
                          <div>Férias protegidas: {formatCurrencyBRL(modalReciboDetalhe.notas.roteiro_reserva.orcamento.valor_ferias_protegidas || 0)}</div>
                          <div>Forma: {modalReciboDetalhe.notas.roteiro_reserva.orcamento.forma_pagamento || "-"}</div>
                          <div>Plano: {modalReciboDetalhe.notas.roteiro_reserva.orcamento.plano || "-"}</div>
                        </div>
                      )}
                      {modalReciboDetalhe.notas.roteiro_reserva.pagamento && (
                        <div>
                          <strong>Pagamento</strong>
                          <div>Forma: {modalReciboDetalhe.notas.roteiro_reserva.pagamento.forma || "-"}</div>
                          <div>Plano: {modalReciboDetalhe.notas.roteiro_reserva.pagamento.plano || "-"}</div>
                          {modalReciboDetalhe.notas.roteiro_reserva.pagamento.parcelas?.length > 0 && (
                            <div className="vtur-modal-subgrid">
                              {modalReciboDetalhe.notas.roteiro_reserva.pagamento.parcelas.map((par: any, i: number) => (
                                <div key={`par-${i}`} className="vtur-modal-list-item">
                                  {par.numero} - {formatCurrencyBRL(par.valor || 0)} {par.vencimento ? `(${formatarDataCorretamente(par.vencimento)})` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </AppCard>
                )}
                {!modalReciboDetalhe.notas && (
                  <AppCard className="vtur-modal-section-card" tone="config">
                    Nenhuma informação adicional encontrada para este recibo.
                  </AppCard>
                )}
              </div>
              <div className="modal-footer">
                <AppButton type="button" variant="secondary" block onClick={() => setModalReciboDetalhe(null)}>
                  Voltar
                </AppButton>
              </div>
            </div>
          </div>
        )}

        {/* ================================
          MODAL DETALHES
      ================================= */}
        {modalVenda && (
        <div className="modal-backdrop modal-venda">
          <div
            className="modal-panel vtur-modal-panel-shell vtur-venda-modal-panel"
            style={{ maxWidth: "min(1100px, 95vw)" }}
          >
            <div className="modal-header vtur-modal-header">
              <div>
                <div
                  className="modal-title"
                  style={{ color: "#16a34a", fontSize: "1.15rem", fontWeight: 800 }}
                >
                  Detalhes da venda
                </div>
              </div>
              <AppButton type="button" variant="secondary" onClick={() => setModalVenda(null)}>
                Fechar
              </AppButton>
            </div>

            <div className="modal-body vtur-modal-body-stack vtur-venda-modal-body">
              <AppCard
                className="mb-3 vtur-modal-section-card"
                tone="info"
                title="Resumo da venda"
                subtitle="Visão consolidada da operação comercial antes de editar, cancelar ou mesclar."
              >
                <div className="vtur-modal-detail-grid">
                  <div>
                    <strong>Vendedor:</strong> {modalVenda.vendedor_nome || "-"}
                  </div>
                  <div>
                    <strong>Cliente:</strong> {modalVenda.cliente_nome || "-"}
                  </div>
                  <div>
                    <strong>Cidade:</strong> {modalVenda.destino_cidade_nome || "Não informada"}
                  </div>
                  <div>
                    <strong>Data da venda:</strong>{" "}
                    {formatarDataCorretamente(modalVenda.data_venda)}
                  </div>
                  <div>
                    <strong>Lançada em:</strong>{" "}
                    {formatarDataCorretamente(modalVenda.data_lancamento)}
                  </div>
                  <div>
                    <strong>Embarque:</strong>{" "}
                    {formatarDataCorretamente(modalVenda.data_embarque)}
                  </div>
                </div>
              </AppCard>

              <AppCard className="vtur-modal-section-card" title="Recibos" subtitle="Itens vinculados a esta venda, com acesso rápido a contrato e ações administrativas.">
              <div className="table-container overflow-x-auto">
                <table
                  className="table-default table-header-green table-mobile-cards"
                  style={{ minWidth: 900 }}
                >
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Reserva</th>
                      <th>Produto</th>
                      <th style={{ textAlign: "center" }}>Data Início</th>
                      <th style={{ textAlign: "center" }}>Data Final</th>
                      <th>Valor</th>
                      <th>Taxas</th>
                      <th>Contrato</th>
                      <th className="th-actions" style={{ textAlign: "center" }}>
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recibosDaVenda(modalVenda.id).map((r) => {
                      const valorFmt = formatCurrencyBRL(r.valor_total || 0);
                      const taxasNum = r.valor_taxas || 0;
                      const taxasFmt = taxasNum === 0 ? "-" : formatCurrencyBRL(taxasNum);

                      const formatarData = (value: string | null | undefined) =>
                        formatarDataCorretamente(value);

                      return (
                        <tr key={r.id}>
                          <td data-label="Número">{r.numero_recibo || "-"}</td>
                          <td data-label="Reserva">{r.numero_reserva || "-"}</td>
                          <td data-label="Produto">{r.produto_nome || "-"}</td>
                          <td data-label="Data Início" style={{ textAlign: "center" }}>
                            {formatarData(r.data_inicio)}
                          </td>
                          <td data-label="Data Final" style={{ textAlign: "center" }}>
                            {formatarData(r.data_fim)}
                          </td>
                          <td data-label="Valor">{valorFmt}</td>
                          <td data-label="Taxas">{taxasFmt}</td>
                          <td data-label="Contrato">
                            {r.contrato_url ? (
                              <a className="link" href={r.contrato_url} target="_blank" rel="noreferrer">
                                Ver
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="th-actions" data-label="Ações">
                            <TableActions
                              className="action-buttons-center"
                              actions={[
                                ...(recibosNotas[r.id]
                                  ? [
                                      {
                                        key: `view-${r.id}`,
                                        label: "Visualização completa",
                                        title: "Visualização completa",
                                        onClick: () => setModalReciboDetalhe({ reciboId: r.id, notas: recibosNotas[r.id] }),
                                        icon: "pi pi-eye",
                                        variant: "light" as const,
                                      },
                                    ]
                                  : []),
                                ...(podeExcluir
                                  ? [
                                      {
                                        key: `delete-${r.id}`,
                                        label: excluindoRecibo === r.id ? "Excluindo..." : "Excluir recibo",
                                        title: "Excluir recibo",
                                        onClick: () => solicitarExclusaoRecibo(r.id, modalVenda.id),
                                        icon: excluindoRecibo === r.id ? "pi pi-spin pi-spinner" : "pi pi-trash",
                                        variant: "danger" as const,
                                        disabled: excluindoRecibo === r.id,
                                      },
                                    ]
                                  : []),
                              ]}
                              show={Boolean(recibosNotas[r.id] || podeExcluir)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </AppCard>

              <AppCard
                className="vtur-modal-section-card"
                title="Recibos complementares"
                subtitle="Conecte recibos relacionados entre vendas e mantenha a visão comercial consolidada."
                actions={
                  <AppButton type="button" variant="secondary" onClick={() => setMostrarComplementares((prev) => !prev)}>
                    {mostrarComplementares ? "Ocultar" : `Mostrar (${complementaresAtuais.length})`}
                  </AppButton>
                }
              >
                {mostrarComplementares && (
                  <div className="vtur-modal-body-stack">
                    {podeEditar && (
                      <div className="vtur-form-grid vtur-form-grid-2">
                        <AppField
                          label="Buscar recibo"
                          placeholder="Número, cliente ou destino..."
                          value={buscaReciboComplementar}
                          onChange={(e) => setBuscaReciboComplementar(e.target.value)}
                          caption="Digite ao menos 2 caracteres para localizar recibos."
                        />
                      </div>
                    )}

                    {podeEditar &&
                      buscaReciboComplementar.trim().length >= 2 &&
                      sugestoesReciboComplementar.length === 0 && (
                        <div className="vtur-inline-note">
                          Nenhum recibo encontrado com essa busca.
                        </div>
                      )}

                    {podeEditar && sugestoesReciboComplementar.length > 0 && (
                      <div className="vtur-modal-list">
                        {sugestoesReciboComplementar.map((item) => {
                          const detalhes = item.resumo.detalhes;
                          return (
                            <AppButton
                              key={item.recibo.id}
                              type="button"
                              variant="secondary"
                              className="vtur-modal-list-button"
                              onClick={() => vincularReciboComplementar(item.recibo.id, modalVenda.id)}
                              disabled={vinculandoComplementar}
                            >
                              <span className="vtur-choice-button-content">
                                <span className="vtur-choice-button-title">{item.resumo.titulo}</span>
                                {detalhes && <span className="vtur-choice-button-caption">{detalhes}</span>}
                              </span>
                              <span className="vtur-modal-action-tag">
                                {vinculandoComplementar ? "Salvando..." : "Adicionar"}
                              </span>
                            </AppButton>
                          );
                        })}
                      </div>
                    )}

                    <div className="vtur-modal-list">
                      {complementaresAtuais.length === 0 && (
                        <div className="vtur-inline-note">
                          Nenhum recibo complementar vinculado.
                        </div>
                      )}

                      {complementaresAtuais.map((link) => {
                        const recibo = recibosPorId[link.recibo_id];
                        const vendaRef = recibo ? vendasPorId[recibo.venda_id] : undefined;
                        const resumo = recibo
                          ? obterResumoReciboComplementar(recibo, vendaRef)
                          : { titulo: "Recibo complementar", detalhes: `ID: ${link.recibo_id}` };
                        return (
                          <div key={link.id} className="vtur-modal-list-item">
                            <div className="vtur-choice-button-content">
                              <span className="vtur-choice-button-title">{resumo.titulo}</span>
                              {resumo.detalhes && <span className="vtur-choice-button-caption">{resumo.detalhes}</span>}
                            </div>
                            {podeEditar && (
                              <AppButton
                                type="button"
                                variant="danger"
                                onClick={() => solicitarRemocaoComplementar(link)}
                                disabled={removendoComplementar === link.id}
                              >
                                {removendoComplementar === link.id ? "Removendo..." : "Remover"}
                              </AppButton>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </AppCard>

              {podeEditar && (
                <AppCard
                  className="vtur-modal-section-card"
                  title="Mesclar vendas"
                  subtitle="Selecione vendas do mesmo cliente e vendedor para unir recibos e deduplicar pagamentos repetidos."
                  actions={
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={carregarVendasParaMesclar}
                      disabled={mergeLoading}
                    >
                      {mergeLoading ? "Carregando..." : "Recarregar vendas"}
                    </AppButton>
                  }
                >
                  <div className="vtur-form-grid vtur-form-grid-2" style={{ marginBottom: 12 }}>
                    <AppField
                      label="Buscar venda"
                      placeholder="Destino, data ou ID..."
                      value={mergeBusca}
                      onChange={(e) => setMergeBusca(e.target.value)}
                    />
                  </div>

                  {mergeLoading && <div className="vtur-inline-note">Carregando vendas...</div>}

                  {!mergeLoading && vendasParaMesclar.length === 0 && (
                    <div className="vtur-inline-note">Nenhuma venda encontrada para mesclar.</div>
                  )}

                  {!mergeLoading && vendasParaMesclar.length > 0 && (
                    <div className="vtur-modal-list">
                      {vendasParaMesclar.map((v) => {
                        const selecionada = mergeSelecionadasSet.has(v.id);
                        const valorInfo =
                          typeof v.valor_total === "number"
                            ? `- ${formatCurrencyBRL(v.valor_total)}`
                            : "";
                        return (
                          <label key={v.id} className={`vtur-modal-checkbox-card${selecionada ? " is-selected" : ""}`}>
                            <input
                              type="checkbox"
                              checked={selecionada}
                              onChange={() => toggleVendaMescla(v.id)}
                            />
                            <div className="vtur-choice-button-content">
                              <span className="vtur-choice-button-title">
                                {v.destino_cidade_nome || v.destino_nome || "Venda"} -{" "}
                                {formatarDataCorretamente(v.data_venda)}
                              </span>
                              <span className="vtur-choice-button-caption">
                                {v.destino_nome || "-"} {valorInfo} - ID: {v.id}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="vtur-inline-note">Selecionadas: {mergeSelecionadas.length}</div>
                </AppCard>
              )}
            </div>

            <div className="modal-footer mobile-stack-buttons">
              {podeEditar && (
                <AppButton
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  style={{ minWidth: 160 }}
                  onClick={() => {
                    const url = `/vendas/cadastro?id=${modalVenda.id}${
                      modalVenda.destino_cidade_id ? `&cidadeId=${modalVenda.destino_cidade_id}` : ""
                    }${
                      modalVenda.destino_cidade_nome
                        ? `&cidadeNome=${encodeURIComponent(modalVenda.destino_cidade_nome)}`
                        : ""
                    }`;
                    window.location.href = url;
                  }}
                >
                  Editar
                </AppButton>
              )}

              {podeEditar && (
                <AppButton
                  type="button"
                  variant="primary"
                  className="w-full sm:w-auto"
                  style={{ minWidth: 160 }}
                  onClick={solicitarMescla}
                  disabled={mergeExecutando || mergeSelecionadas.length === 0}
                >
                  {mergeExecutando ? "Mesclando..." : "Mesclar vendas"}
                </AppButton>
              )}

              {podeExcluir && (
                <AppButton
                  type="button"
                  variant="danger"
                  className="w-full sm:w-auto"
                  style={{ minWidth: 160 }}
                  onClick={() => solicitarCancelamentoVenda(modalVenda)}
                  disabled={cancelando}
                >
                  {cancelando ? "Cancelando..." : "Cancelar Venda"}
                </AppButton>
              )}

              <AppButton
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                style={{ minWidth: 160 }}
                onClick={() => setModalVenda(null)}
              >
                Fechar
              </AppButton>
            </div>
          </div>
        </div>
        )}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <ConfirmDialog
        open={Boolean(confirmVendaCancelamento)}
        title="Cancelar Venda!"
        titleColor="#b91c1c"
        icon={<span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "#fecdd3",
          color: "#b91c1c",
          fontWeight: 800,
          border: "1px solid #fda4af",
          fontSize: 14,
        }}><i className="pi pi-times" aria-hidden="true" /></span>}
        message={(
          <p style={{ margin: 0 }}>
            Tem certeza que deseja cancelar esta venda? Esta ação remove recibos vinculados.
          </p>
        )}
        confirmLabel={cancelando ? "Cancelando..." : "Cancelar venda"}
        confirmVariant="danger"
        confirmDisabled={Boolean(cancelando)}
        onCancel={() => setConfirmVendaCancelamento(null)}
        onConfirm={async () => {
          if (!confirmVendaCancelamento) return;
          await cancelarVenda(confirmVendaCancelamento);
          setConfirmVendaCancelamento(null);
        }}
        />

        <ConfirmDialog
        open={Boolean(confirmReciboExclusao)}
        title="Excluir recibo"
        message="Deseja excluir este recibo?"
        confirmLabel={excluindoRecibo ? "Excluindo..." : "Excluir recibo"}
        confirmVariant="danger"
        confirmDisabled={Boolean(excluindoRecibo)}
        onCancel={() => setConfirmReciboExclusao(null)}
        onConfirm={async () => {
          if (!confirmReciboExclusao) return;
          await excluirRecibo(confirmReciboExclusao.id, confirmReciboExclusao.vendaId);
          setConfirmReciboExclusao(null);
        }}
        />

        <ConfirmDialog
        open={Boolean(confirmComplementarRemover)}
        title="Remover recibo complementar"
        message="Deseja remover este recibo complementar?"
        confirmLabel={removendoComplementar ? "Removendo..." : "Remover"}
        confirmVariant="danger"
        confirmDisabled={Boolean(removendoComplementar)}
        onCancel={() => setConfirmComplementarRemover(null)}
        onConfirm={async () => {
          if (!confirmComplementarRemover) return;
          await removerReciboComplementar(confirmComplementarRemover);
          setConfirmComplementarRemover(null);
        }}
        />
        <ConfirmDialog
        open={Boolean(confirmMerge)}
        title="Mesclar vendas"
        message={`Deseja mesclar ${confirmMerge?.mergeIds.length || 0} venda(s) nesta venda? Esta acao move recibos e pagamentos para a venda principal e remove as vendas selecionadas.`}
        confirmLabel={mergeExecutando ? "Mesclando..." : "Mesclar vendas"}
        confirmVariant="danger"
        confirmDisabled={Boolean(mergeExecutando)}
        onCancel={() => setConfirmMerge(null)}
        onConfirm={async () => {
          if (!confirmMerge) return;
          await mesclarVendasSelecionadas(confirmMerge.vendaId, confirmMerge.mergeIds);
        }}
        />
      </div>
    </AppPrimerProvider>
  );
}
