import { Dialog } from "../ui/primer/legacyCompat";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import CalculatorModal from "../ui/CalculatorModal";
import AlertMessage from "../ui/AlertMessage";
import { formatCurrencyBRL, formatNumberBR } from "../../lib/format";
import { calcularPctFixoProduto, regraProdutoTemFixo } from "../../lib/comissaoUtils";
import { carregarTermosNaoComissionaveis, calcularNaoComissionavelPorVenda } from "../../lib/pagamentoUtils";
import { normalizeText } from "../../lib/normalizeText";
import { fetchGestorEquipeIdsComGestor } from "../../lib/gestorEquipe";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type Parametros = {
  usar_taxas_na_meta: boolean;
  foco_valor: "bruto" | "liquido";
  foco_faturamento: "bruto" | "liquido";
};

type UserCtx = {
  id: string;
  nome: string;
  tipo?: string;
  companyId?: string | null;
  isAdmin?: boolean;
  isMaster?: boolean;
  isGestor?: boolean;
  isVendedor?: boolean;
  equipeIds?: string[];
};

type MetaVendedor = {
  id: string;
  meta_geral: number;
};

type MetaProduto = {
  produto_id: string;
  valor: number;
};

type Regra = {
  id: string;
  tipo: "GERAL" | "ESCALONAVEL";
  meta_nao_atingida: number | null;
  meta_atingida: number | null;
  super_meta: number | null;
  commission_tier?: Tier[];
};

type RegraProduto = {
  produto_id: string;
  rule_id: string | null;
  fix_meta_nao_atingida: number | null;
  fix_meta_atingida: number | null;
  fix_super_meta: number | null;
};

type Produto = {
  id: string;
  nome: string | null;
  regra_comissionamento: string;
  soma_na_meta: boolean;
  usa_meta_produto?: boolean | null;
  meta_produto_valor?: number | null;
  comissao_produto_meta_pct?: number | null;
  descontar_meta_geral?: boolean | null;
  exibe_kpi_comissao?: boolean | null;
};

type Recibo = {
  valor_total: number | null;
  valor_taxas: number | null;
  valor_du?: number | null;
  valor_rav?: number | null;
  produto_id: string | null;
  tipo_pacote?: string | null;
  tipo_produtos?: Produto | null;
  regra_produto?: RegraProduto | null;
};

type Tier = {
  faixa: "PRE" | "POS";
  de_pct: number;
  ate_pct: number;
  inc_pct_meta: number;
  inc_pct_comissao: number;
};

type Venda = {
  id: string;
  data_venda: string;
  cancelada: boolean | null;
  valor_nao_comissionado?: number | null;
  valor_total_bruto?: number | null;
  valor_total_pago?: number | null;
  vendas_recibos: Recibo[];
};

const PERIODO_OPCOES = [
  { id: "mes", label: "Mês" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "trim", label: "Trimestral" },
  { id: "sem", label: "Semestral" },
  { id: "ano", label: "Anual" },
  { id: "personalizado", label: "Personalizar data" },
];

function addMonths(base: Date, delta: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function formatISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function calcPeriodo(preset: string) {
  const hoje = new Date();
  let inicio: Date;
  switch (preset) {
    case "mes_anterior": {
      const firstPrev = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const lastPrev = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { inicio: formatISODate(firstPrev), fim: formatISODate(lastPrev) };
    }
    case "trim":
      inicio = addMonths(hoje, -3);
      break;
    case "sem":
      inicio = addMonths(hoje, -6);
      break;
    case "ano":
      inicio = addMonths(hoje, -12);
      break;
    case "mes":
    default:
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      break;
  }
  return { inicio: formatISODate(inicio), fim: formatISODate(hoje) };
}

async function carregarPagamentosNaoComissionaveis(vendaIds: string[]) {
  if (!vendaIds.length) return new Map<string, number>();
  const { data, error } = await supabase
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

function formatPeriodoLabel(value: string) {
  if (!value) return "-";
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const partes = value.split("-");
  if (partes.length < 3) return value;
  const [ano, mes, dia] = partes;
  const mesIdx = Number(mes) - 1;
  const mesLabel = meses[mesIdx] || mes;
  return `${dia}-${mesLabel}-${ano}`;
}

function isSeguroProduto(produto?: Produto | null) {
  const nome = (produto?.nome || "").toLowerCase();
  return nome.includes("seguro");
}

function formatPct(value: number) {
  return `${formatNumberBR(value, 2)}%`;
}

function formatPctList(values: number[]) {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (!filtered.length) return "";
  return filtered.map((v) => formatPct(v)).join(", ");
}

function buildKpiLabel(base: string, values: number[]) {
  const list = formatPctList(values);
  return list ? `${base} (${list})` : base;
}

function buildKpiLabelFromList(base: string, values: string[]) {
  const list = values.filter(Boolean).join(", ");
  return list ? `${base} (${list})` : base;
}

export default function ComissionamentoIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Vendas");
  const metaProdEnabled = import.meta.env.PUBLIC_META_PRODUTO_ENABLED !== "false";
  const isMaster = /MASTER/i.test(String(userType || ""));
  const masterScope = useMasterScope(Boolean(isMaster && !loadingPerm));
  const [userCtx, setUserCtx] = useState<UserCtx | null>(null);
  const [vendedoresDisponiveis, setVendedoresDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>("");
  const [parametros, setParametros] = useState<Parametros | null>(null);
  const [metaGeral, setMetaGeral] = useState<MetaVendedor | null>(null);
  const [metaIds, setMetaIds] = useState<string[]>([]);
  const [metasProduto, setMetasProduto] = useState<MetaProduto[]>([]);
  const [regras, setRegras] = useState<Record<string, Regra>>({});
  const [regraProdutoMap, setRegraProdutoMap] = useState<Record<string, RegraProduto>>({});
  const [regraProdutoPacoteMap, setRegraProdutoPacoteMap] = useState<Record<string, Record<string, RegraProduto>>>({});
  const [produtos, setProdutos] = useState<Record<string, Produto>>({});
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [pagamentosNaoComissionaveis, setPagamentosNaoComissionaveis] = useState<Map<string, number>>(new Map());
  const [suportaExibeKpi, setSuportaExibeKpi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [preset, setPreset] = useState<string>("mes");
  const [periodo, setPeriodo] = useState(() => calcPeriodo("mes"));
  const [showCalculator, setShowCalculator] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const vendedorFiltroSelecionado = userCtx?.isMaster
    ? masterScope.vendedorSelecionado
    : vendedorSelecionado;
  const setVendedorFiltroSelecionado = (value: string) => {
    if (userCtx?.isMaster) {
      masterScope.setVendedorSelecionado(value);
    } else {
      setVendedorSelecionado(value);
    }
  };
  const isTodosFiltro = (value?: string) =>
    !value || value === "todos" || value === "all";

  useEffect(() => {
    if (loadingPerm || !podeVer) return;
    carregarContexto();
  }, [loadingPerm, podeVer]);

  useEffect(() => {
    if (preset === "personalizado") return;
    setPeriodo(calcPeriodo(preset));
  }, [preset]);

  useEffect(() => {
    if (loadingPerm || !podeVer || !userCtx) return;
    if (!vendedorFiltroSelecionado) return;
    carregarTudo();
  }, [
    loadingPerm,
    podeVer,
    userCtx,
    preset,
    periodo.inicio,
    periodo.fim,
    vendedorSelecionado,
    masterScope.vendedorSelecionado,
    masterScope.vendedorIds,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
  ]);

  async function carregarContexto() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;
      if (!userId) {
        setErro("Usuário não autenticado.");
        return;
      }

      const { data: usuarioDb } = await supabase
        .from("users")
        .select("id, nome_completo, company_id, user_types(name)")
        .eq("id", userId)
        .maybeSingle();

      const tipoUser = String(usuarioDb?.user_types?.name || "").toUpperCase();
      const isAdmin = tipoUser.includes("ADMIN");
      const isMasterRole = tipoUser.includes("MASTER");
      const isGestor = tipoUser.includes("GESTOR");
      const isVendedor = tipoUser.includes("VENDEDOR");
      const companyId = (usuarioDb as any)?.company_id || null;

      let equipeIds: string[] = [userId];
      if (isMasterRole) {
        equipeIds = masterScope.vendedorIds;
      } else if (isGestor) {
        equipeIds = await fetchGestorEquipeIdsComGestor(userId);
      } else if (isAdmin) {
        equipeIds = [];
      }

      let vendedores: { id: string; nome: string }[] = [];
      if (isMasterRole) {
        vendedores = masterScope.vendedoresDisponiveis.map((v) => ({
          id: v.id,
          nome: v.nome_completo || "",
        }));
      } else if (isGestor && equipeIds.length > 0) {
        const { data: vendedoresData } = await supabase
          .from("users")
          .select("id, nome_completo")
          .in("id", equipeIds)
          .order("nome_completo");
        vendedores = (vendedoresData || []).map((v: any) => ({
          id: v.id,
          nome: v.nome_completo || "",
        }));
      } else if (isAdmin) {
        let usuariosQuery = supabase
          .from("users")
          .select("id, nome_completo, user_types(name)");
        if (companyId) {
          usuariosQuery = usuariosQuery.eq("company_id", companyId);
        }
        const { data: usuariosData } = await usuariosQuery;
        const lista = (usuariosData || []).filter((u: any) =>
          String(u?.user_types?.name || "").toUpperCase().includes("VENDEDOR")
        );
        vendedores = lista.map((u: any) => ({
          id: u.id,
          nome: u.nome_completo || "",
        }));
      } else if (isVendedor) {
        vendedores = [
          {
            id: userId,
            nome: usuarioDb?.nome_completo || auth?.user?.email || "",
          },
        ];
      }

      setUserCtx({
        id: userId,
        nome: usuarioDb?.nome_completo || auth?.user?.email || "",
        tipo: tipoUser,
        companyId,
        isAdmin,
        isMaster: isMasterRole,
        isGestor,
        isVendedor,
        equipeIds,
      });
      setVendedoresDisponiveis(vendedores);

      if (!vendedorSelecionado && !isMasterRole) {
        if (isVendedor && !isGestor && !isAdmin) {
          setVendedorSelecionado(userId);
        } else {
          setVendedorSelecionado("todos");
        }
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar contexto do usuário.");
    }
  }

  useEffect(() => {
    if (!userCtx?.isMaster) return;
    setVendedoresDisponiveis(
      masterScope.vendedoresDisponiveis.map((v) => ({
        id: v.id,
        nome: v.nome_completo || "",
      }))
    );
    setUserCtx((prev) =>
      prev ? { ...prev, equipeIds: masterScope.vendedorIds } : prev
    );
  }, [masterScope.vendedoresDisponiveis, masterScope.vendedorIds, userCtx?.isMaster]);

  async function carregarTudo() {
    try {
      setLoading(true);
      setErro(null);
      if (!userCtx) {
        setErro("Usuário não autenticado.");
        return;
      }
      const userId = userCtx.id;
      const periodoAtual = preset === "personalizado" ? periodo : calcPeriodo(preset);

      const companyIdFiltro = userCtx.isMaster
        ? masterScope.empresaSelecionada !== "all"
          ? masterScope.empresaSelecionada
          : null
        : userCtx.companyId;

      const paramsCols = "usar_taxas_na_meta, foco_valor, foco_faturamento";
      let paramsData: any = null;
      if (companyIdFiltro) {
        const { data } = await supabase
          .from("parametros_comissao")
          .select(paramsCols)
          .eq("company_id", companyIdFiltro)
          .maybeSingle();
        paramsData = data;
      }
      if (!paramsData) {
        const { data } = await supabase
          .from("parametros_comissao")
          .select(paramsCols)
          .is("company_id", null)
          .maybeSingle();
        paramsData = data;
      }

      const periodoMeta = periodoAtual.inicio.slice(0, 7) + "-01";
      let vendedorFiltro: string[] | null = null;
      if (userCtx.isMaster) {
        if (!isTodosFiltro(vendedorFiltroSelecionado)) {
          vendedorFiltro = [vendedorFiltroSelecionado];
        } else {
          vendedorFiltro = userCtx.equipeIds || [];
        }
      } else if (userCtx.isGestor) {
        if (!isTodosFiltro(vendedorFiltroSelecionado)) {
          vendedorFiltro = [vendedorFiltroSelecionado];
        } else {
          vendedorFiltro = userCtx.equipeIds || [];
        }
      } else if (userCtx.isAdmin) {
        if (!isTodosFiltro(vendedorFiltroSelecionado)) {
          vendedorFiltro = [vendedorFiltroSelecionado];
        } else {
          vendedorFiltro = null;
        }
      } else {
        vendedorFiltro = [userId];
      }

      if (!userCtx.isAdmin && (!vendedorFiltro || vendedorFiltro.length === 0)) {
        setMetaIds([]);
        setMetaGeral(null);
        setMetasProduto([]);
        setVendas([]);
        setProdutos({});
        setRegraProdutoMap({});
        setRegras({});
        return;
      }

      let metasQuery = supabase
        .from("metas_vendedor")
        .select("id, meta_geral")
        .eq("periodo", periodoMeta)
        .eq("scope", "vendedor");
      if (vendedorFiltro && vendedorFiltro.length > 0) {
        metasQuery = metasQuery.in("vendedor_id", vendedorFiltro);
      }
      const { data: metasData, error: metasError } = await metasQuery;
      if (metasError) throw metasError;
      const metasList = (metasData || []) as MetaVendedor[];
      const metaIds = metasList.map((m) => m.id);
      const metaSum = metasList.reduce((sum, m) => sum + (m.meta_geral || 0), 0);
      setMetaIds(metaIds);
      setMetaGeral(metaIds.length > 0 ? { id: metaIds[0], meta_geral: metaSum } : null);

      const tipoProdBaseCols =
        "id, nome, regra_comissionamento, soma_na_meta, usa_meta_produto, meta_produto_valor, comissao_produto_meta_pct, descontar_meta_geral";

      const tentarSelectProdutos = async (incluiExibe: boolean) => {
        const cols = incluiExibe ? `${tipoProdBaseCols}, exibe_kpi_comissao` : tipoProdBaseCols;
        return supabase.from("tipo_produtos").select(cols);
      };

      let produtosDataRes = await tentarSelectProdutos(true);
      let suportaKpi = true;
      if (produtosDataRes.error && produtosDataRes.error.message?.toLowerCase().includes("exibe_kpi_comissao")) {
        suportaKpi = false;
        produtosDataRes = await tentarSelectProdutos(false);
      }

      const nestedTipoProdCols = suportaKpi
        ? "id, nome, regra_comissionamento, soma_na_meta, usa_meta_produto, meta_produto_valor, comissao_produto_meta_pct, descontar_meta_geral, exibe_kpi_comissao"
        : "id, nome, regra_comissionamento, soma_na_meta, usa_meta_produto, meta_produto_valor, comissao_produto_meta_pct, descontar_meta_geral";

	      let vendasQuery = supabase
	        .from("vendas")
	        .select(
	          `
	          id,
	          data_venda,
	          cancelada,
	          valor_nao_comissionado,
	          valor_total_bruto,
	          valor_total_pago,
            vendas_recibos!inner (
              data_venda,
	            valor_total,
	            valor_taxas,
              valor_du,
              valor_rav,
	            produto_id,
	            tipo_pacote,
	            tipo_produtos (
	              ${nestedTipoProdCols}
	            )
	          )
	        `
	        )
	        .eq("cancelada", false)
          .gte("vendas_recibos.data_venda", periodoAtual.inicio)
          .lte("vendas_recibos.data_venda", periodoAtual.fim);
	      if (vendedorFiltro && vendedorFiltro.length > 0) {
	        vendasQuery = vendasQuery.in("vendedor_id", vendedorFiltro);
	      }
	      let vendasDataRes = await vendasQuery;

      if (vendasDataRes.error && vendasDataRes.error.message?.toLowerCase().includes("exibe_kpi_comissao")) {
	        let fallbackQuery = supabase
	          .from("vendas")
	          .select(
	          `
	          id,
	          data_venda,
	          cancelada,
	          valor_nao_comissionado,
	          valor_total_bruto,
	          valor_total_pago,
            vendas_recibos!inner (
              data_venda,
	            valor_total,
	            valor_taxas,
              valor_du,
              valor_rav,
	            produto_id,
	            tipo_pacote,
	            tipo_produtos (
	              ${tipoProdBaseCols}
	            )
	          )
	        `
	          )
	          .eq("cancelada", false)
            .gte("vendas_recibos.data_venda", periodoAtual.inicio)
            .lte("vendas_recibos.data_venda", periodoAtual.fim);
	        if (vendedorFiltro && vendedorFiltro.length > 0) {
	          fallbackQuery = fallbackQuery.in("vendedor_id", vendedorFiltro);
	        }
	        vendasDataRes = await fallbackQuery;
        suportaKpi = false;
      }

      const metasProdPromise =
        metaIds.length > 0
          ? supabase
              .from("metas_vendedor_produto")
              .select("produto_id, valor")
              .in("meta_vendedor_id", metaIds)
          : Promise.resolve({ data: [], error: null as null });

      const [metasProdDataRes, regrasDataRes, regrasProdDataRes, regrasProdPacoteRes] = await Promise.all([
        metasProdPromise,
        supabase
          .from("commission_rule")
          .select("id, tipo, meta_nao_atingida, meta_atingida, super_meta, commission_tier (faixa, de_pct, ate_pct, inc_pct_meta, inc_pct_comissao)"),
        supabase
          .from("product_commission_rule")
          .select("produto_id, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta"),
        supabase
          .from("product_commission_rule_pacote")
          .select("produto_id, tipo_pacote, rule_id, fix_meta_nao_atingida, fix_meta_atingida, fix_super_meta"),
      ]);

      const metasProdData = metasProdDataRes.data;
      const regrasData = regrasDataRes.data;
      const regrasProdData = regrasProdDataRes.data;
      const regrasProdPacoteData = regrasProdPacoteRes.data;
      const produtosData = produtosDataRes.data;
      const vendasData = vendasDataRes.data;

      setSuportaExibeKpi(suportaKpi);

      const regrasMap: Record<string, Regra> = {};
      (regrasData || []).forEach((r: any) => {
        regrasMap[r.id] = {
          id: r.id,
          tipo: (r.tipo || "GERAL") as any,
          meta_nao_atingida: r.meta_nao_atingida,
          meta_atingida: r.meta_atingida,
          super_meta: r.super_meta,
          commission_tier: r.commission_tier || [],
        };
      });

      const regProdMap: Record<string, RegraProduto> = {};
      (regrasProdData || []).forEach((rp: any) => {
        regProdMap[rp.produto_id] = {
          produto_id: rp.produto_id,
          rule_id: rp.rule_id,
          fix_meta_nao_atingida: rp.fix_meta_nao_atingida,
          fix_meta_atingida: rp.fix_meta_atingida,
          fix_super_meta: rp.fix_super_meta,
        };
      });

      const regProdPacoteMap: Record<string, Record<string, RegraProduto>> = {};
      (regrasProdPacoteData || []).forEach((rp: any) => {
        const produtoId = rp.produto_id;
        const tipoPacoteKey = normalizeText(rp.tipo_pacote || "", { trim: true, collapseWhitespace: true });
        if (!produtoId || !tipoPacoteKey) return;
        if (!regProdPacoteMap[produtoId]) regProdPacoteMap[produtoId] = {};
        regProdPacoteMap[produtoId][tipoPacoteKey] = {
          produto_id: produtoId,
          rule_id: rp.rule_id,
          fix_meta_nao_atingida: rp.fix_meta_nao_atingida,
          fix_meta_atingida: rp.fix_meta_atingida,
          fix_super_meta: rp.fix_super_meta,
        };
      });

      const prodMap: Record<string, Produto> = {};
      (produtosData || []).forEach((p: any) => {
        prodMap[p.id] = {
          id: p.id,
          nome: p.nome,
          regra_comissionamento: p.regra_comissionamento,
          soma_na_meta: p.soma_na_meta,
          usa_meta_produto: p.usa_meta_produto,
          meta_produto_valor: p.meta_produto_valor,
          comissao_produto_meta_pct: p.comissao_produto_meta_pct,
          descontar_meta_geral: p.descontar_meta_geral,
          exibe_kpi_comissao: suportaKpi ? p.exibe_kpi_comissao : undefined,
        };
      });

      setParametros(
        paramsData
          ? ({
              usar_taxas_na_meta: !!paramsData.usar_taxas_na_meta,
              foco_valor: paramsData.foco_valor === "liquido" ? "liquido" : "bruto",
              foco_faturamento:
                paramsData.foco_faturamento === "liquido" ? "liquido" : "bruto",
            } as Parametros)
          : { usar_taxas_na_meta: true, foco_valor: "bruto", foco_faturamento: "bruto" }
      );
      setMetasProduto((metasProdData || []) as MetaProduto[]);
      setRegras(regrasMap);
      setRegraProdutoMap(regProdMap);
      setRegraProdutoPacoteMap(regProdPacoteMap);
      setProdutos(prodMap);
      const vendasList = (vendasData || []) as Venda[];
      const pagamentosMap = await carregarPagamentosNaoComissionaveis(
        vendasList.map((v) => v.id)
      );
      setPagamentosNaoComissionaveis(pagamentosMap);
      setVendas(vendasList);
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar dados de comissionamento.");
    } finally {
      setLoading(false);
    }
  }

  function calcularPctEscalonavel(regra: Regra, pctMeta: number) {
    const faixa = pctMeta < 100 ? "PRE" : "POS";
    const tiers = (regra.commission_tier || []).filter((t) => t.faixa === faixa);
    const tier = tiers.find((t) => pctMeta >= Number(t.de_pct) && pctMeta <= Number(t.ate_pct));

    const base =
      faixa === "PRE"
        ? regra.meta_nao_atingida ?? regra.meta_atingida ?? 0
        : regra.meta_atingida ?? regra.meta_nao_atingida ?? 0;

    if (!tier) {
      // fallback para fora das faixas: usa base/super_meta
      if (faixa === "POS" && pctMeta >= 120) {
        return regra.super_meta ?? base;
      }
      return base;
    }

    const incMeta = Number(tier.inc_pct_meta || 0);
    const incCom = Number(tier.inc_pct_comissao || 0); // em pontos percentuais

    if (incMeta <= 0) {
      // se não houver incremento definido, usa o inc_pct_comissao como valor absoluto
      return incCom || base;
    }

    const steps = Math.max(0, Math.floor((pctMeta - Number(tier.de_pct)) / incMeta));
    const pct = base + steps * (incCom / 100);
    return pct;
  }

  const resumo = useMemo(() => {
    if (!parametros) return null;

    // Map meta por produto para cálculo de diferenciados
    const metasProdutoMap: Record<string, number> = {};
    metasProduto.forEach((m) => {
      metasProdutoMap[m.produto_id] = m.valor;
    });

    // Agregadores por produto
    const baseMetaPorProduto: Record<string, number> = {};
    const brutoPorProduto: Record<string, number> = {};
    const liquidoPorProduto: Record<string, number> = {};
    const baseComPorProduto: Record<string, number> = {};
    const bucketTotals: Record<string, { prodId: string; tipoPacoteKey: string; baseCom: number; valorLiquido: number }> = {};

    let baseMeta = 0;
    let totalBruto = 0;
    let totalBrutoComissao = 0;
    let totalTaxas = 0;
    let comissaoGeral = 0;
    let comissaoDif = 0;
    const pctComissaoGeralSet = new Set<number>();
    const pctPassagemFacialSet = new Set<number>();
    const pctSeguroFormulaSet = new Set<string>();
    const comissaoDifDetalhe: Record<string, number> = {};
    const produtosDiferenciados: string[] = [];
    let comissaoFixaProdutos = 0;
    let comissaoMetaProd = 0;
    const comissaoMetaProdDetalhe: Record<string, number> = {};
    let comissaoPassagemFacial = 0;
    let comissaoSeguroViagem = 0;
    let totalValorMetaDiferenciada = 0;
    let totalValorMetaEscalonavel = 0;
    let totalValorMetaGeral = 0;
    // Comissão em valor: sempre usa base líquida.
    
    // Rastreia produtos por tipo de KPI para validação de exibe_kpi_comissao
    const produtosDiferenciadosSet = new Set<string>();
    const produtosMetaGeralSet = new Set<string>();

    Object.values(produtos).forEach((p) => {
      if (p.regra_comissionamento === "diferenciado") {
        produtosDiferenciados.push(p.id);
        comissaoDifDetalhe[p.id] = 0; // garante cartão mesmo sem recibos
      }
      if (p.usa_meta_produto) {
        comissaoMetaProdDetalhe[p.id] = 0;
      }
    });

    // 1) Agrega totais por produto e base de meta
    vendas.forEach((v) => {
      const recibosVenda = v.vendas_recibos || [];
      recibosVenda.forEach((r) => {
        const prodId = r.tipo_produtos?.id || r.produto_id || "";
        const prod = produtos[prodId];
        if (!prod) return;
        // Regra (conforme cadastro):
        // - `valor_total` já inclui taxas + RAV.
        // - O atingimento de meta considera o valor total vendido.
        // - RAV (valor_rav) não entra na base de comissão.
        // - Taxas não comissionam, exceto DU (valor_du), que é parte comissionável das taxas.
        const brutoTotal = Math.max(0, Number(r.valor_total || 0));
        const brutoSemRav = Math.max(0, Number(r.valor_total || 0) - Number(r.valor_rav || 0));
        const taxasEfetivas = Math.max(0, Number(r.valor_taxas || 0) - Number(r.valor_du || 0));
        const liquido = Math.max(0, brutoSemRav - taxasEfetivas);

        // Para meta: prioriza foco_valor; no modo bruto considera o valor total vendido.
        const valParaMeta =
          parametros.foco_valor === "liquido"
            ? liquido
            : parametros.usar_taxas_na_meta
              ? brutoTotal
              : liquido;
        // Para comissão (valor): sempre usa o líquido.
        const baseCom = liquido;
        const tipoPacoteKey = normalizeText(r.tipo_pacote || "", { trim: true, collapseWhitespace: true });
        const bucketKey = `${prodId}::${tipoPacoteKey || "default"}`;

        brutoPorProduto[prodId] = (brutoPorProduto[prodId] || 0) + brutoTotal;
        liquidoPorProduto[prodId] = (liquidoPorProduto[prodId] || 0) + liquido;
        baseMetaPorProduto[prodId] = (baseMetaPorProduto[prodId] || 0) + valParaMeta;
        baseComPorProduto[prodId] = (baseComPorProduto[prodId] || 0) + baseCom;

        const bucket = bucketTotals[bucketKey] || {
          prodId,
          tipoPacoteKey,
          baseCom: 0,
          valorLiquido: 0,
        };
        bucket.baseCom += baseCom;
        bucket.valorLiquido += liquido;
        bucketTotals[bucketKey] = bucket;

        if (prod.soma_na_meta) baseMeta += valParaMeta;
        totalBruto += brutoTotal;
        totalBrutoComissao += brutoSemRav;
        totalTaxas += taxasEfetivas;
      });
    });

    const totalLiquido = totalBrutoComissao - totalTaxas;
    const pctMetaGeral =
      metaGeral?.meta_geral && metaGeral.meta_geral > 0 ? (baseMeta / metaGeral.meta_geral) * 100 : 0;

    // 2) Calcula comissões com base nos agregados e por tipo de pacote
    const getRegraPacote = (prodId: string, tipoPacoteKey: string) => {
      const porPacote = regraProdutoPacoteMap[prodId];
      if (!porPacote) return null;
      return porPacote[tipoPacoteKey] || null;
    };

    Object.values(bucketTotals).forEach((bucket) => {
      const prodId = bucket.prodId;
      const prod = produtos[prodId];
      if (!prod) return;
      const valorLiquidoProduto = bucket.valorLiquido;
      const baseComBucket = bucket.baseCom;
      if (baseComBucket <= 0) return;

      const nomeProdNormalizado = (prod.nome || "").toLowerCase().replace(/\s+/g, " ").trim();
      const isPassagemFacial = nomeProdNormalizado.includes("passagem facial");
      const isSeguro = isSeguroProduto(prod);
      const regProdPacote = getRegraPacote(prodId, bucket.tipoPacoteKey);
      const regProdBase = regraProdutoMap[prodId];
      let regProd = regProdPacote || regProdBase;

      if (prod.regra_comissionamento === "diferenciado") {
        totalValorMetaDiferenciada += valorLiquidoProduto;
        produtosDiferenciadosSet.add(prodId);
        if (!regProd) return;
        const metaProd = metasProdutoMap[prodId] || 0;
        const baseMetaProd = baseMetaPorProduto[prodId] || 0;
        const temMetaProd = metaProd > 0;
        const pctMetaProd = temMetaProd ? (baseMetaProd / metaProd) * 100 : 0;
        const pctCom = temMetaProd
          ? baseMetaProd < metaProd
            ? 0
            : pctMetaProd >= 120
            ? regProd.fix_super_meta ?? regProd.fix_meta_atingida ?? regProd.fix_meta_nao_atingida ?? 0
            : regProd.fix_meta_atingida ?? regProd.fix_meta_nao_atingida ?? 0
          : regProd.fix_meta_nao_atingida ?? regProd.fix_meta_atingida ?? regProd.fix_super_meta ?? 0;
        const val = baseComBucket * (pctCom / 100);
        comissaoFixaProdutos += val;
        const jogaParaGeral = prod.soma_na_meta && !prod.usa_meta_produto;
        if (jogaParaGeral && pctCom > 0) {
          if (isPassagemFacial) {
            pctPassagemFacialSet.add(pctCom);
          } else {
            pctComissaoGeralSet.add(pctCom);
          }
        }
        if (jogaParaGeral) {
          if (isPassagemFacial) {
            comissaoPassagemFacial += val;
          } else {
            comissaoGeral += val;
          }
        } else {
          comissaoDif += val;
        }
        comissaoDifDetalhe[prodId] = (comissaoDifDetalhe[prodId] || 0) + val;
        return;
      }

      let pctCom = 0;
      let usouFixo = false;

      if (regProdPacote && !regProdPacote.rule_id) {
        if (regraProdutoTemFixo(regProdPacote)) {
          pctCom = calcularPctFixoProduto(regProdPacote, pctMetaGeral);
          usouFixo = true;
        } else {
          regProd = regProdBase;
        }
      }

      const ruleId = regProd?.rule_id || null;
      const reg = ruleId ? regras[ruleId] : undefined;
      if (reg?.tipo === "ESCALONAVEL") {
        totalValorMetaEscalonavel += valorLiquidoProduto;
      } else {
        totalValorMetaGeral += valorLiquidoProduto;
        produtosMetaGeralSet.add(prodId);
      }
      if (!usouFixo && reg) {
        if (reg.tipo === "ESCALONAVEL") {
          pctCom = calcularPctEscalonavel(reg, pctMetaGeral);
        } else {
          if (pctMetaGeral < 100) pctCom = reg.meta_nao_atingida || 0;
          else if (pctMetaGeral >= 120) pctCom = reg.super_meta ?? reg.meta_atingida ?? reg.meta_nao_atingida ?? 0;
          else pctCom = reg.meta_atingida ?? reg.meta_nao_atingida ?? 0;
        }
      }

      let extraPct = 0;
      if (
        metaProdEnabled &&
        prod.usa_meta_produto &&
        prod.meta_produto_valor &&
        prod.comissao_produto_meta_pct
      ) {
        const baseMetaProd = baseMetaPorProduto[prodId] || 0;
        const atingiuMetaProd = baseMetaProd >= prod.meta_produto_valor;
        if (atingiuMetaProd) {
          const baseComProd = baseComPorProduto[prodId] || 0;
          if (baseComProd > 0) {
            const valMetaProd = baseComProd * ((prod.comissao_produto_meta_pct || 0) / 100);
            const valGeral = baseComProd * (pctCom / 100);
            const diffValor =
              prod.descontar_meta_geral === false
                ? valMetaProd
                : Math.max(valMetaProd - valGeral, 0);
            if (diffValor > 0) {
              extraPct = (diffValor / baseComProd) * 100;
              const extraVal = baseComBucket * (extraPct / 100);
              comissaoMetaProd += extraVal;
              comissaoMetaProdDetalhe[prodId] = (comissaoMetaProdDetalhe[prodId] || 0) + extraVal;
              if (isSeguro) {
                comissaoSeguroViagem += extraVal;
                const metaPct = Number(prod.comissao_produto_meta_pct || 0);
                const basePct = prod.descontar_meta_geral === false ? 0 : Number(pctCom || 0);
                const diffPct = Math.max(metaPct - basePct, 0);
                if (metaPct > 0) {
                  pctSeguroFormulaSet.add(formatPct(diffPct));
                }
              }
            }
          }
        }
      }

      const pctComFinal = pctCom + extraPct;
      const valGeral = baseComBucket * (pctComFinal / 100);
      if (pctComFinal > 0) {
        if (isPassagemFacial) {
          pctPassagemFacialSet.add(pctComFinal);
        } else {
          pctComissaoGeralSet.add(pctComFinal);
        }
      }
      if (isPassagemFacial) {
        comissaoPassagemFacial += valGeral;
      } else {
        comissaoGeral += valGeral;
      }
    });

    const totalComissao = metaProdEnabled
      ? comissaoGeral + comissaoDif + comissaoMetaProd + comissaoPassagemFacial
      : comissaoGeral + comissaoDif + comissaoPassagemFacial;
    const totalComissaoKpi = comissaoGeral + comissaoFixaProdutos;
    const totalComissaoKpiSeguro = totalComissaoKpi + comissaoSeguroViagem;

    // Verifica se deve exibir KPIs baseado na flag exibe_kpi_comissao
    const deveExibirDiferenciadas = suportaExibeKpi
      ? Array.from(produtosDiferenciadosSet).some((id) => produtos[id]?.exibe_kpi_comissao === true)
      : false;
    
    const deveExibirMetaGeral = suportaExibeKpi
      ? Array.from(produtosMetaGeralSet).some((id) => produtos[id]?.exibe_kpi_comissao === true)
      : false;

    return {
      baseMeta,
      totalBruto,
      totalTaxas,
      totalLiquido,
      totalValorMetaDiferenciada,
      totalValorMetaEscalonavel,
      totalValorMetaGeral,
      pctMetaGeral,
      comissaoGeral,
      comissaoDif,
      comissaoMetaProd: metaProdEnabled ? comissaoMetaProd : 0,
      comissaoPassagemFacial,
      comissaoSeguroViagem,
      pctComissaoGeral: Array.from(pctComissaoGeralSet),
      pctPassagemFacial: Array.from(pctPassagemFacialSet),
      pctSeguroFormula: Array.from(pctSeguroFormulaSet),
      totalComissaoKpi,
      totalComissaoKpiSeguro,
      totalComissao,
      comissaoDifDetalhe,
      comissaoMetaProdDetalhe: metaProdEnabled ? comissaoMetaProdDetalhe : {},
      produtosDiferenciados,
      totalVendas: vendas.length,
      deveExibirDiferenciadas,
      deveExibirMetaGeral,
    };
  }, [
    vendas,
    pagamentosNaoComissionaveis,
    parametros,
    produtos,
    regraProdutoMap,
    regraProdutoPacoteMap,
    metasProduto,
    metaGeral,
    regras,
    metaProdEnabled,
    suportaExibeKpi,
  ]);

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard title="Acesso ao módulo de vendas" subtitle="Seu perfil não possui permissão para consultar comissionamento.">
          <p>Solicite ao gestor ou ao master a liberação do acesso ao módulo.</p>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  const labelComissao = resumo
    ? buildKpiLabel("Comissão", resumo.pctComissaoGeral || [])
    : "Comissão";
  const labelPassagemFacial = resumo
    ? buildKpiLabel("Passagem Facial", resumo.pctPassagemFacial || [])
    : "Passagem Facial";
  const labelSeguro = resumo
    ? buildKpiLabelFromList("Seguro Viagem", resumo.pctSeguroFormula || [])
    : "Seguro Viagem";
  const todosValue = userCtx?.isMaster ? "all" : "todos";
  const vendedorSelectValue = vendedorFiltroSelecionado || todosValue;

  const exibeFiltroVendedor = Boolean(userCtx?.isGestor || userCtx?.isAdmin || userCtx?.isMaster);
  const exibeValoresReceber = !!resumo;
  const periodoEditavel = preset === "personalizado";
  const periodoResumo = `${formatPeriodoLabel(periodo.inicio)} a ${formatPeriodoLabel(periodo.fim)}`;
  const periodoSubtitulo = periodoEditavel
    ? "Período personalizado em análise."
    : `Período consolidado: ${periodoResumo}.`;

  const filtrosFields = (
    <>
      {userCtx?.isMaster ? (
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

      {exibeFiltroVendedor ? (
        <AppField
          as="select"
          label="Vendedor"
          value={vendedorSelectValue}
          onChange={(e) => setVendedorFiltroSelecionado(e.target.value)}
          options={[
            { label: "Todos", value: todosValue },
            ...vendedoresDisponiveis.map((vendedor) => ({
              label: vendedor.nome || "Vendedor",
              value: vendedor.id,
            })),
          ]}
        />
      ) : null}

      <AppField
        as="select"
        label="Período"
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
        options={PERIODO_OPCOES.map((opcao) => ({
          label: opcao.label,
          value: opcao.id,
        }))}
      />

      <AppField
        label="Data Início"
        type="date"
        value={periodo.inicio}
        readOnly={!periodoEditavel}
        onChange={(e) => {
          if (!periodoEditavel) return;
          setPeriodo((prev) => ({ ...prev, inicio: e.target.value }));
        }}
      />

      <AppField
        label="Data Final"
        type="date"
        value={periodo.fim}
        readOnly={!periodoEditavel}
        onChange={(e) => {
          if (!periodoEditavel) return;
          setPeriodo((prev) => ({ ...prev, fim: e.target.value }));
        }}
      />
    </>
  );

  return (
    <AppPrimerProvider>
      <div className="comissionamento-page page-content-wrap">
        <AppCard
          tone="info"
          className="mb-3 list-toolbar-sticky"
          title="Comissionamento"
          subtitle={`Gerencie metas e comissoes com visao de CRM. ${periodoSubtitulo}`}
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton type="button" variant="secondary" className="sm:hidden" onClick={() => setShowFilters(true)}>
                Filtros
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                className="btn-calculator-trigger"
                onClick={() => setShowCalculator(true)}
                aria-label="Calculadora"
                title="Calculadora"
                icon="pi pi-calculator"
              />
            </div>
          }
        >
          <div className="hidden sm:block">
            <div className="vtur-commission-filters-grid">{filtrosFields}</div>
          </div>
        </AppCard>

        {showFilters ? (
          <Dialog
            title="Filtros de comissionamento"
            width="large"
            onClose={() => setShowFilters(false)}
            footerButtons={[
              {
                content: "Fechar",
                buttonType: "default",
                onClick: () => setShowFilters(false),
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                title="Refine a leitura do período"
                subtitle="Ajuste filial, equipe, vendedor e recorte de datas para recalcular a comissão."
              >
                <div className="vtur-commission-filters-grid">{filtrosFields}</div>
                <div className="vtur-form-actions" style={{ marginTop: 16 }}>
                  <AppButton type="button" variant="primary" onClick={() => setShowFilters(false)}>
                    Aplicar filtros
                  </AppButton>
                </div>
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        {erro ? (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        ) : null}

        {loading ? (
          <AppCard
            className="mb-3"
            title="Carregando dados de comissionamento"
            subtitle="O CRM está consolidando metas, vendas, taxas e regras do período selecionado."
          >
            <p className="vtur-commission-loading">
              Aguarde alguns instantes. Assim que o cálculo terminar, os indicadores e valores a receber serão exibidos.
            </p>
          </AppCard>
        ) : null}

        {!loading && resumo ? (
          <>
            <AppCard
              className="mb-3"
              title="Como está seu progresso"
              subtitle="Evolução da meta e da base usada no comissionamento do período selecionado."
            >
              <div className="vtur-commission-kpi-grid">
                <div className="vtur-commission-kpi-card vtur-commission-kpi-positive">
                  <span className="vtur-commission-kpi-label">Meta do mês</span>
                  <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(metaGeral?.meta_geral || 0)}</strong>
                </div>
                <div className="vtur-commission-kpi-card vtur-commission-kpi-warning">
                  <span className="vtur-commission-kpi-label">{`Vendas para meta (${resumo.pctMetaGeral.toFixed(2).replace(".", ",")}%)`}</span>
                  <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.totalBruto)}</strong>
                </div>
                <div className="vtur-commission-kpi-card vtur-commission-kpi-info">
                  <span className="vtur-commission-kpi-label">Taxas</span>
                  <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.totalTaxas)}</strong>
                </div>
                <div className="vtur-commission-kpi-card vtur-commission-kpi-accent">
                  <span className="vtur-commission-kpi-label">Base líquida comissão</span>
                  <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.totalLiquido)}</strong>
                </div>
                <div className="vtur-commission-kpi-card vtur-commission-kpi-neutral">
                  <span className="vtur-commission-kpi-label">Vendas</span>
                  <strong className="vtur-commission-kpi-value">{resumo.totalVendas}</strong>
                </div>
              </div>
            </AppCard>

            {exibeValoresReceber ? (
              <AppCard
                title="Seus valores a receber"
                subtitle="Consolidado da comissão geral, produtos especiais e total previsto para o período."
              >
                <div className="vtur-commission-kpi-grid">
                  <div className="vtur-commission-kpi-card">
                    <span className="vtur-commission-kpi-label">{labelComissao}</span>
                    <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.comissaoGeral)}</strong>
                  </div>
                  <div className="vtur-commission-kpi-card">
                    <span className="vtur-commission-kpi-label">{labelPassagemFacial}</span>
                    <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.comissaoPassagemFacial)}</strong>
                  </div>
                  <div className="vtur-commission-kpi-card">
                    <span className="vtur-commission-kpi-label">Comissão total</span>
                    <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.totalComissaoKpi)}</strong>
                  </div>
                  <div className="vtur-commission-kpi-card">
                    <span className="vtur-commission-kpi-label">{labelSeguro}</span>
                    <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.comissaoSeguroViagem)}</strong>
                  </div>
                  <div className="vtur-commission-kpi-card vtur-commission-kpi-highlight">
                    <span className="vtur-commission-kpi-label">Comissão + seguro</span>
                    <strong className="vtur-commission-kpi-value">{formatCurrencyBRL(resumo.totalComissaoKpiSeguro)}</strong>
                  </div>
                </div>
              </AppCard>
            ) : null}
          </>
        ) : null}

        {!loading && !resumo ? (
          <AppCard
            title="Sem dados para o período"
            subtitle="Não houve dados suficientes para consolidar o comissionamento no recorte atual."
          >
            <p className="vtur-commission-loading">
              Ajuste filial, vendedor ou período para revisar outra janela de desempenho.
            </p>
          </AppCard>
        ) : null}

        <CalculatorModal open={showCalculator} onClose={() => setShowCalculator(false)} />
      </div>
    </AppPrimerProvider>
  );
}
