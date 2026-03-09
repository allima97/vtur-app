import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { registrarLog } from "../../lib/logs";
import { normalizeText } from "../../lib/normalizeText";
import { formatNumberBR } from "../../lib/format";
import { normalizeMoneyInput, sanitizeMoneyInput, selectAllInputOnFocus } from "../../lib/inputNormalization";
import { matchesCpfSearch, onlyDigits } from "../../lib/searchNormalization";
import { carregarTermosNaoComissionaveis, isFormaNaoComissionavel } from "../../lib/pagamentoUtils";
import CalculatorModal from "../ui/CalculatorModal";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { AlertTriangle } from "lucide-react";

const STORAGE_BUCKET = "viagens";

type Cliente = { id: string; nome: string; cpf?: string | null };
type Cidade = { id: string; nome: string };
type CidadeSugestao = { id: string; nome: string; subdivisao_nome?: string | null; pais_nome?: string | null };
type CidadePrefill = { id: string; nome: string };
type Produto = {
  id: string;
  nome: string;
  cidade_id: string | null;
  tipo_produto: string | null;
  isVirtual?: boolean;
  todas_as_cidades?: boolean;
};
type TipoPacote = {
  id: string;
  nome: string;
  ativo?: boolean | null;
};

async function fetchVendasCadastroBase(params?: { noCache?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.noCache) qs.set("no_cache", "1");
  const resp = await fetch(`/api/v1/vendas/cadastro-base?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json() as Promise<{
    user: {
      id: string;
      papel: string;
      company_id: string | null;
      uso_individual: boolean;
      is_gestor: boolean;
    };
    vendedoresEquipe: VendedorOption[];
    clientes: Cliente[];
    cidades: Cidade[];
    produtos: Produto[];
    tipos: { id: string; nome: string | null; tipo?: string | null }[];
    tiposPacote: TipoPacote[];
    formasPagamento: FormaPagamento[];
  }>;
}

async function fetchCidadesSugestoes(params: {
  query: string;
  limite?: number;
  signal?: AbortSignal;
}) {
  const qs = new URLSearchParams();
  qs.set("q", params.query);
  qs.set("limite", String(params.limite ?? 10));
  const resp = await fetch(`/api/v1/vendas/cidades-busca?${qs.toString()}`,
    { signal: params.signal }
  );
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  const payload = await resp.json();
  return Array.isArray(payload) ? payload : [];
}

type FormaPagamento = {
  id: string;
  nome: string;
  paga_comissao: boolean;
  permite_desconto: boolean;
  desconto_padrao_pct: number | null;
};

type PagamentoParcela = {
  numero: string;
  valor: string;
  vencimento: string;
};

type PagamentoVenda = {
  id?: string;
  forma_id: string;
  forma_nome: string;
  operacao: string;
  plano: string;
  valor_bruto: string;
  desconto_valor: string;
  valor_total: string;
  parcelas: PagamentoParcela[];
};

type VendedorOption = {
  id: string;
  nome_completo: string | null;
};

type FormVenda = {
  vendedor_id: string;
  cliente_id: string;
  destino_id: string;
  data_lancamento: string;
  data_venda: string;
  data_embarque: string;
  data_final: string;
  desconto_comercial_aplicado: boolean;
  desconto_comercial_valor: string;
};

type FormRecibo = {
  id?: string;
  tipo_produto_id: string;
  produto_id: string;
  produto_resolvido_id?: string;
  numero_recibo: string;
  numero_reserva?: string;
  tipo_pacote?: string;
  valor_total: string;
  valor_taxas: string;
  valor_du: string;
  valor_rav: string;
  data_inicio: string;
  data_fim: string;
  principal: boolean;
  contrato_file?: File | null;
  contrato_url?: string | null;
  contrato_path?: string | null;
};

const initialVenda: FormVenda = {
  vendedor_id: "",
  cliente_id: "",
  destino_id: "",
  data_lancamento: new Date().toISOString().substring(0, 10),
  data_venda: new Date().toISOString().substring(0, 10),
  data_embarque: "",
  data_final: "",
  desconto_comercial_aplicado: false,
  desconto_comercial_valor: "",
};

const initialRecibo: FormRecibo = {
  tipo_produto_id: "",
  produto_id: "",
  produto_resolvido_id: "",
  numero_recibo: "",
  numero_reserva: "",
  tipo_pacote: "",
  valor_total: "",
  valor_taxas: "0",
  valor_du: "0",
  valor_rav: "0",
  data_inicio: "",
  data_fim: "",
  principal: false,
  contrato_file: null,
  contrato_url: null,
  contrato_path: null,
};

const initialPagamento: PagamentoVenda = {
  forma_id: "",
  forma_nome: "",
  operacao: "",
  plano: "",
  valor_bruto: "",
  desconto_valor: "",
  valor_total: "",
  parcelas: [],
};

function formatarValorDigitado(valor: string) {
  return sanitizeMoneyInput(valor);
}

function formatarNumeroComoMoeda(valor: number | string | null | undefined) {
  const num = Number(valor);
  if (Number.isNaN(num)) return "";
  return formatNumberBR(num, 2);
}

function sanitizeFileName(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function moedaParaNumero(valor: string) {
  if (!valor) return NaN;
  const limpo = valor.replace(/\./g, "").replace(",", ".");
  const num = Number(limpo);
  return num;
}

function dataParaInput(value?: string | Date | null) {
  if (value == null) return "";
  if (typeof value === "string") {
    if (value.includes("T")) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
      }
      return value.split("T")[0];
    }
    return value;
  }
  return value.toISOString().split("T")[0];
}

function parseDateInput(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isEndOnOrAfterStart(start: string, end: string) {
  const startDate = parseDateInput(start);
  const endDate = parseDateInput(end);
  if (!startDate || !endDate) return true;
  return endDate.getTime() >= startDate.getTime();
}


export default function VendasCadastroIsland() {
  // =======================================================
  // PERMISSÕES
  // =======================================================
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;
  const podeVer = can("Vendas");
  const podeCriar = can("Vendas", "create");
  const podeEditar = can("Vendas", "edit");
  const isAdmin = can("Vendas", "admin");

  // =======================================================
  // ESTADOS
  // =======================================================
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tiposPacote, setTiposPacote] = useState<TipoPacote[]>([]);
  const [tipos, setTipos] = useState<
    { id: string; nome: string | null; tipo?: string | null }[]
  >([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [vendedoresEquipe, setVendedoresEquipe] = useState<VendedorOption[]>([]);
  const [isGestorUser, setIsGestorUser] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [usoIndividual, setUsoIndividual] = useState<boolean>(false);

  const [formVenda, setFormVenda] = useState<FormVenda>(initialVenda);
  const [recibos, setRecibos] = useState<FormRecibo[]>([]);
  const [reciboEmEdicao, setReciboEmEdicao] = useState<number | null>(null);
  const [pagamentos, setPagamentos] = useState<PagamentoVenda[]>([]);

  const [editId, setEditId] = useState<string | null>(null);
  const [orcamentoId, setOrcamentoId] = useState<string | null>(null);
  const [cidadePrefill, setCidadePrefill] = useState<CidadePrefill>({ id: "", nome: "" });

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingVenda, setLoadingVenda] = useState(false);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });
  const [showCalculator, setShowCalculator] = useState(false);

  // AUTOCOMPLETE (cliente, cidade de destino, produto)
  const [buscaCliente, setBuscaCliente] = useState("");
  const [mostrarSugestoesCliente, setMostrarSugestoesCliente] = useState(false);
  const [buscaDestino, setBuscaDestino] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [mostrarSugestoesCidade, setMostrarSugestoesCidade] = useState(false);
  const [resultadosCidade, setResultadosCidade] = useState<CidadeSugestao[]>([]);
  const [buscandoCidade, setBuscandoCidade] = useState(false);
  const [erroCidade, setErroCidade] = useState<string | null>(null);
  const [buscaCidadeSelecionada, setBuscaCidadeSelecionada] = useState("");
  const [duplicadoModal, setDuplicadoModal] = useState<{ mensagem: string } | null>(null);
  const [tipoPacoteModal, setTipoPacoteModal] = useState<{ mensagem: string } | null>(null);
  const isReguaTipoPacote = (valor?: string | null) =>
    normalizeText(valor || "", { trim: true, collapseWhitespace: true }).includes("regua abaixo de 10");

  // =======================================================
  // CARREGAR DADOS INICIAIS
  // =======================================================
  async function carregarDados(
    vendaId?: string,
    cidadePrefillParam?: CidadePrefill,
    orcamentoIdParam?: string | null
  ) {
    try {
      setLoading(true);

      const payload = await fetchVendasCadastroBase();
      const user = payload.user;
      setCurrentUserId(user.id || null);
      setCompanyId(user.company_id || null);
      setUsoIndividual(Boolean(user.uso_individual));
      setIsGestorUser(Boolean(user.is_gestor));
      setVendedoresEquipe(payload.vendedoresEquipe || []);

      if (user.id) {
        setFormVenda((prev) => ({
          ...prev,
          vendedor_id: prev.vendedor_id || user.id,
        }));
      }

      setClientes(payload.clientes || []);
      const cidadesLista = (payload.cidades || []) as Cidade[];
      setCidades(cidadesLista);
      const tiposLista = (payload.tipos as any[]) || [];
      const produtosLista = (payload.produtos || []) as Produto[];
      setProdutos(produtosLista);
      setTipos(tiposLista as any);
      setTiposPacote(payload.tiposPacote || []);
      setFormasPagamento(payload.formasPagamento || []);

      if (vendaId) {
        await carregarVenda(vendaId, cidadesLista, produtosLista, cidadePrefillParam, user.company_id || companyId);
      } else if (orcamentoIdParam) {
        await carregarOrcamento(
          orcamentoIdParam,
          cidadesLista,
          produtosLista,
          payload.clientes || [],
          tiposLista as any
        );
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar dados.");
      showToast("Erro ao carregar dados.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function carregarVenda(
    id: string,
    cidadesBase?: Cidade[],
    produtosBase?: Produto[],
    cidadePrefillParam?: CidadePrefill,
    companyIdParam?: string | null
  ) {
    try {
      setLoadingVenda(true);
      const companyIdResolved = companyIdParam ?? companyId;
      if (!companyIdResolved) {
        setErro("Não foi possível determinar sua empresa.");
        return;
      }

      let vendaQuery = supabase
        .from("vendas")
        .select("id, vendedor_id, cliente_id, destino_id, destino_cidade_id, data_lancamento, data_venda, data_embarque, data_final, desconto_comercial_aplicado, desconto_comercial_valor")
        .eq("id", id);
      if (companyIdResolved) {
        vendaQuery = vendaQuery.eq("company_id", companyIdResolved);
      }
      if (usoIndividual && currentUserId) {
        vendaQuery = vendaQuery.eq("vendedor_id", currentUserId);
      }
      const { data: vendaData, error: vendaErr } = await vendaQuery.maybeSingle();

      if (vendaErr) throw vendaErr;
      if (!vendaData) {
        setErro("Venda não encontrada ou sem permissão para edição.");
        return;
      }

      // destino_id na tabela aponta para produto; buscamos cidade desse produto
      let cidadeId = vendaData.destino_cidade_id || "";
      let cidadeNome = "";
      if (cidadeId) {
        const lista = cidadesBase || cidades;
        const cidadeSelecionada = lista.find((c) => c.id === cidadeId);
        if (cidadeSelecionada) cidadeNome = cidadeSelecionada.nome;
      } else if (vendaData.destino_id) {
        const { data: prodData } = await supabase
          .from("produtos")
          .select("id, cidade_id")
          .eq("id", vendaData.destino_id)
          .maybeSingle();
        cidadeId = prodData?.cidade_id || "";
        const lista = cidadesBase || cidades;
        const cidadeSelecionada = lista.find((c) => c.id === cidadeId);
        if (cidadeSelecionada) cidadeNome = cidadeSelecionada.nome;
      }
      if (!cidadeId && cidadePrefillParam?.id) {
        cidadeId = cidadePrefillParam.id;
      }
      if (!cidadeNome && cidadePrefillParam?.nome) {
        cidadeNome = cidadePrefillParam.nome;
      }

      setFormVenda((prev) => ({
        ...prev,
        vendedor_id: vendaData.vendedor_id || prev.vendedor_id || "",
        cliente_id: vendaData.cliente_id,
        destino_id: cidadeId,
        data_lancamento: dataParaInput(vendaData.data_lancamento),
        data_venda: dataParaInput(vendaData.data_venda),
        data_embarque: dataParaInput(vendaData.data_embarque),
        data_final: dataParaInput(vendaData.data_final),
        desconto_comercial_aplicado: Boolean(vendaData.desconto_comercial_aplicado),
        desconto_comercial_valor:
          vendaData.desconto_comercial_valor != null
            ? formatarNumeroComoMoeda(vendaData.desconto_comercial_valor)
            : "",
      }));
      setBuscaDestino(cidadeNome || cidadeId || "");
      setBuscaCidadeSelecionada(cidadeNome || cidadeId || "");

      const { data: recibosData, error: recErr } = await supabase
        .from("vendas_recibos")
        .select("*, produto_resolvido_id")
        .eq("venda_id", id);
      if (recErr) throw recErr;

      const produtosLista = produtosBase || produtos;
      const produtoPrincipalIdDaVenda = vendaData.destino_id;
      const recibosComPrincipal = (recibosData || []).map((r: any) => {
        const produtoResolvidoId = r.produto_resolvido_id || "";
        let produtoSelecionado = produtosLista.find((p) => p.id === produtoResolvidoId);
        if (!produtoSelecionado) {
          produtoSelecionado = produtosLista.find((p) => {
            const ehGlobal = !!p.todas_as_cidades;
            return p.tipo_produto === r.produto_id && (ehGlobal || !cidadeId || p.cidade_id === cidadeId);
          });
        }
        const produtoId = produtoSelecionado?.id || "";
        const tipoProdutoId = r.produto_id || produtoSelecionado?.tipo_produto || "";
        return {
          id: r.id,
          tipo_produto_id: tipoProdutoId,
          produto_id: produtoId,
          produto_resolvido_id: produtoId,
          numero_recibo: r.numero_recibo || "",
          numero_reserva: r.numero_reserva || "",
          tipo_pacote: r.tipo_pacote || "",
          valor_total: r.valor_total != null ? formatarNumeroComoMoeda(r.valor_total) : "",
          valor_taxas: r.valor_taxas != null ? formatarNumeroComoMoeda(r.valor_taxas) : "0,00",
          valor_du: r.valor_du != null ? formatarNumeroComoMoeda(r.valor_du) : "0,00",
          valor_rav: r.valor_rav != null ? formatarNumeroComoMoeda(r.valor_rav) : "0,00",
          data_inicio: dataParaInput(r.data_inicio),
          data_fim: dataParaInput(r.data_fim),
          principal: produtoSelecionado?.id === produtoPrincipalIdDaVenda,
          contrato_url: r.contrato_url || null,
          contrato_path: r.contrato_path || null,
          contrato_file: null,
        };
      });
      setRecibos(garantirReciboPrincipal(recibosComPrincipal));

      const { data: pagamentosData } = await supabase
        .from("vendas_pagamentos")
        .select(
          "id, forma_pagamento_id, forma_nome, operacao, plano, valor_bruto, desconto_valor, valor_total, parcelas"
        )
        .eq("venda_id", id)
        .order("created_at", { ascending: true });
      const pagamentosFormatados = (pagamentosData || []).map((p: any) => ({
        id: p.id,
        forma_id: p.forma_pagamento_id || "",
        forma_nome: p.forma_nome || "",
        operacao: p.operacao || "",
        plano: p.plano || "",
        valor_bruto: p.valor_bruto != null ? formatarNumeroComoMoeda(p.valor_bruto) : "",
        desconto_valor: p.desconto_valor != null ? formatarNumeroComoMoeda(p.desconto_valor) : "",
        valor_total: p.valor_total != null ? formatarNumeroComoMoeda(p.valor_total) : "",
        parcelas: Array.isArray(p.parcelas)
          ? p.parcelas.map((par: any) => ({
              numero: String(par.numero || ""),
              valor: par.valor != null ? formatarNumeroComoMoeda(par.valor) : "",
              vencimento: par.vencimento ? dataParaInput(par.vencimento) : "",
            }))
          : [],
      }));
      setPagamentos(pagamentosFormatados);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar venda para edição.");
      showToast("Erro ao carregar venda para edição.", "error");
    } finally {
      setLoadingVenda(false);
    }
  }

  function formatarValorMoeda(valor?: number | null) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "";
  return formatNumberBR(valor, 2);
}

  function gerarNumeroRecibo(orcamentoId: string, index: number) {
    const prefixo = (orcamentoId || "").replace(/-/g, "").slice(0, 6).toUpperCase();
    const sequencia = String(index + 1).padStart(2, "0");
    return `ORC-${prefixo}-${sequencia}`;
  }

  function resolverTipoId(tipoLabel: string, tiposBase: { id: string; nome: string | null; tipo?: string | null }[]) {
    const normalized = normalizeText(tipoLabel || "");
    if (!normalized) return "";
    const match = tiposBase.find((t) => {
      if (normalizeText(t.nome || "") === normalized) return true;
      if (normalizeText(t.tipo || "") === normalized) return true;
      return false;
    });
    return match?.id || "";
  }

  async function carregarOrcamento(
    id: string,
    cidadesBase?: Cidade[],
    produtosBase?: Produto[],
    clientesBase?: Cliente[],
    tiposBase?: { id: string; nome: string | null; tipo?: string | null }[]
  ) {
    try {
      const { data: orcamento, error } = await supabase
        .from("quote")
        .select(
          "id, client_id, client_name, destino_cidade_id, data_embarque, data_final, quote_item (id, item_type, title, product_name, total_amount, taxes_amount, start_date, end_date, cidade_id, order_index)"
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!orcamento) {
        setErro("Orcamento nao encontrado para conversao.");
        showToast("Orcamento nao encontrado.", "error");
        return;
      }

      const clientesLista = clientesBase || clientes;
      const cidadesLista = cidadesBase || cidades;
      const produtosLista = produtosBase || produtos;
      const tiposLista = tiposBase || tipos;

      let clienteId = orcamento.client_id || "";
      if (!clienteId && orcamento.client_name) {
        const match = clientesLista.find(
          (c) => normalizeText(c.nome) === normalizeText(orcamento.client_name || "")
        );
        if (match) clienteId = match.id;
        else setBuscaCliente(orcamento.client_name);
      }
      if (clienteId) {
        setBuscaCliente("");
      }

      let destinoId = orcamento.destino_cidade_id || "";
      if (!destinoId) {
        const firstItemCity = (orcamento.quote_item || []).find((item: any) => item?.cidade_id)?.cidade_id;
        destinoId = firstItemCity || "";
      }
      const destinoCidade = cidadesLista.find((c) => c.id === destinoId);
      if (destinoCidade) {
        setBuscaDestino(destinoCidade.nome);
        setBuscaCidadeSelecionada(destinoCidade.nome);
      }

      setFormVenda((prev) => ({
        ...prev,
        cliente_id: clienteId,
        destino_id: destinoId,
        data_embarque: dataParaInput(orcamento.data_embarque),
        data_final: dataParaInput(orcamento.data_final),
      }));

      const itensOrdenados = [...(orcamento.quote_item || [])].sort(
        (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      const produtosAtualizados = [...produtosLista];
      const recibosGerados = itensOrdenados.map((item: any, index: number) => {
        const nomeItem = (item.product_name || item.title || item.item_type || "").trim();
        const nomeNormalizado = normalizeText(nomeItem);
        const cidadeBaseId = item.cidade_id || destinoId || "";
        const tipoId = resolverTipoId(item.item_type || "", tiposLista);

        let produtoMatch =
          produtosAtualizados.find(
            (p) =>
              normalizeText(p.nome) === nomeNormalizado &&
              (!cidadeBaseId || p.cidade_id === cidadeBaseId || p.todas_as_cidades)
          ) ||
          (tipoId
            ? produtosAtualizados.find(
                (p) =>
                  p.tipo_produto === tipoId &&
                  (!cidadeBaseId || p.cidade_id === cidadeBaseId || p.todas_as_cidades)
              )
            : null);

        let produtoId = produtoMatch?.id || "";
        if (!produtoId && nomeItem) {
          const virtualId = `virtual-${tipoId || "sem-tipo"}-${index + 1}`;
          produtosAtualizados.push({
            id: virtualId,
            nome: nomeItem,
            cidade_id: cidadeBaseId || null,
            tipo_produto: tipoId || null,
            todas_as_cidades: false,
            isVirtual: true,
          });
          produtoId = virtualId;
        }

        const dataInicio = dataParaInput(item.start_date || orcamento.data_embarque);
        const dataFim = dataParaInput(
          item.end_date || orcamento.data_final || item.start_date || orcamento.data_embarque
        );

        return {
          ...initialRecibo,
          tipo_produto_id: tipoId || "",
          produto_id: produtoId,
          numero_recibo: gerarNumeroRecibo(orcamento.id, index),
          data_inicio: dataInicio,
          data_fim: dataFim,
          valor_total: formatarValorMoeda(Number(item.total_amount || 0)),
          valor_taxas: formatarValorMoeda(Number(item.taxes_amount || 0)),
          valor_rav: "0,00",
          principal: index === 0,
        };
      });

      if (recibosGerados.length) {
        setRecibos(garantirReciboPrincipal(recibosGerados));
      }
      setPagamentos([]);
      if (produtosAtualizados.length !== produtosLista.length) {
        setProdutos(produtosAtualizados);
      }
    } catch (err) {
      console.error(err);
      setErro("Erro ao carregar orcamento para conversao.");
      showToast("Erro ao carregar orcamento.", "error");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) setEditId(idParam);
    const orcamentoParam = params.get("orcamentoId");
    if (orcamentoParam && !idParam) setOrcamentoId(orcamentoParam);
    const cidadeIdParam = params.get("cidadeId") || "";
    const cidadeNomeParam = params.get("cidadeNome") || "";
    if (cidadeIdParam || cidadeNomeParam) {
      setCidadePrefill({ id: cidadeIdParam, nome: cidadeNomeParam });
    }
  }, []);

  useEffect(() => {
    if (!loadPerm && podeVer) carregarDados(editId || undefined, cidadePrefill, orcamentoId);
  }, [loadPerm, podeVer, editId, cidadePrefill, orcamentoId]);

  // Busca cidade (autocomplete)
  useEffect(() => {
    if (buscaDestino.trim().length < 2) {
      setResultadosCidade([]);
      setMostrarSugestoesCidade(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBuscandoCidade(true);
      setErroCidade(null);
      try {
        const data = await fetchCidadesSugestoes({
          query: buscaDestino.trim(),
          limite: 10,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResultadosCidade((data as CidadeSugestao[]) || []);
          setErroCidade(null);
        }
      } finally {
        if (!controller.signal.aborted) setBuscandoCidade(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [buscaDestino]);

  // =======================================================
  // AUTOCOMPLETE
  // =======================================================
  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return [];
    const t = normalizeText(buscaCliente);
    return clientes.filter((c) => {
      if (normalizeText(c.nome).includes(t)) return true;
      if (matchesCpfSearch(c.cpf || "", buscaCliente)) return true;
      return false;
    }).slice(0, 10);
  }, [clientes, buscaCliente]);
  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === formVenda.cliente_id) || null,
    [clientes, formVenda.cliente_id]
  );

  const cidadesFiltradas = useMemo(() => {
    if (!buscaDestino.trim()) return cidades;
    const t = normalizeText(buscaDestino);
    return cidades.filter((c) => normalizeText(c.nome).includes(t));
  }, [cidades, buscaDestino]);

  function filtrarProdutos(termo: string, tipoId?: string) {
    let base = formVenda.destino_id
      ? produtos.filter((p) => p.todas_as_cidades || p.cidade_id === formVenda.destino_id)
      : produtos.filter((p) => p.todas_as_cidades);

    if (tipoId) {
      base = base.filter((p) => p.tipo_produto === tipoId);
    }

    if (!termo.trim()) return base;
    const term = normalizeText(termo);
    return base.filter((c) => normalizeText(c.nome).includes(term));
  }

  function existeProdutoGlobalParaTipo(tipoId?: string) {
    if (!tipoId) return false;
    return produtos.some((p) => p.todas_as_cidades && p.tipo_produto === tipoId);
  }

  const cidadeObrigatoria = useMemo(() => recibos.length > 0, [recibos.length]);

  function handleClienteInputChange(value: string) {
    setBuscaCliente(value);
    const normalized = normalizeText(value);
    const cpfValue = onlyDigits(value);
    const match = clientes.find((c) => {
      const cpf = onlyDigits(c.cpf || "");
      return (
        normalizeText(c.nome) === normalized ||
        (cpfValue && cpf === cpfValue)
      );
    });
    setFormVenda((prev) => ({
      ...prev,
      cliente_id: match ? match.id : "",
    }));
  }

  function handleCidadeDestino(valor: string) {
    setBuscaDestino(valor);
    const cidadeAtual = cidades.find((c) => c.id === formVenda.destino_id);
    const valorNormalizado = normalizeText(valor);
    const cidadeAtualNome = normalizeText(cidadeAtual?.nome || "");
    const cidadeSelecionada = normalizeText(buscaCidadeSelecionada);
    const valorMantemCidade =
      (!!cidadeAtualNome &&
        (valorNormalizado === cidadeAtualNome ||
          valorNormalizado.startsWith(cidadeAtualNome))) ||
      (!!cidadeSelecionada && valorNormalizado === cidadeSelecionada);
    if (!cidadeAtual || !valorMantemCidade) {
      setFormVenda((prev) => ({ ...prev, destino_id: "" }));
    }
    setMostrarSugestoesCidade(true);
  }

function garantirReciboPrincipal(recibos: FormRecibo[]): FormRecibo[] {
  if (recibos.length === 0) return [];
  const principalComProduto = recibos.findIndex(
    (r) => r.principal && r.produto_id
  );
  if (principalComProduto >= 0) {
    return recibos.map((r, idx) => ({ ...r, principal: idx === principalComProduto }));
  }
  const comProduto = recibos.findIndex((r) => r.produto_id);
  if (comProduto >= 0) {
    return recibos.map((r, idx) => ({ ...r, principal: idx === comProduto }));
  }
  const principalAtual = recibos.findIndex((r) => r.principal);
  if (principalAtual >= 0) {
    return recibos.map((r, idx) => ({ ...r, principal: idx === principalAtual }));
  }
  return recibos.map((r, idx) => ({ ...r, principal: idx === 0 }));
}

// =======================================================
// HANDLERS
// =======================================================
  function addRecibo() {
    setRecibos((prev) => {
      const novo = [...prev, { ...initialRecibo }];
      return garantirReciboPrincipal(novo);
    });
  }

  function updateRecibo(index: number, campo: string, valor: string) {
    setRecibos((prev) => {
      const novo = [...prev];
      const atualizado = { ...(novo[index] as any), [campo]: valor };
      if (campo === "data_inicio") {
        if (atualizado.data_fim && atualizado.data_fim < valor) {
          atualizado.data_fim = valor;
        }
      }
      if (campo === "data_fim") {
        if (atualizado.data_inicio && atualizado.data_fim < atualizado.data_inicio) {
          atualizado.data_fim = atualizado.data_inicio;
        }
      }
      novo[index] = atualizado;
      return novo;
    });
  }

  function updateReciboMonetario(
    index: number,
    campo: "valor_total" | "valor_taxas" | "valor_du" | "valor_rav",
    valor: string
  ) {
    updateRecibo(index, campo, formatarValorDigitado(valor));
  }

  function hasRavValue(valor?: string) {
    if (!valor) return false;
    const num = moedaParaNumero(valor);
    return Number.isFinite(num) && num > 0;
  }

  function definirProdutoRecibo(index: number, produtoId: string) {
    setRecibos((prev) => {
      const next = [...prev];
      const atual = { ...(next[index] as any), produto_id: produtoId };
      const produto = produtos.find((p) => p.id === produtoId);
      if (produto?.tipo_produto) {
        atual.tipo_produto_id = produto.tipo_produto;
      }
      next[index] = atual;
      return garantirReciboPrincipal(next);
    });
  }

  function handleTipoReciboChange(index: number, tipoId: string) {
    const produtoAtualId = recibos[index]?.produto_id || "";
    setRecibos((prev) => {
      const next = [...prev];
      const atual = { ...(next[index] as any), tipo_produto_id: tipoId };
      if (!tipoId) {
        atual.produto_id = "";
        atual.produto_resolvido_id = "";
      } else if (produtoAtualId) {
        const prod = produtos.find((p) => p.id === produtoAtualId);
        if (prod?.tipo_produto && prod.tipo_produto !== tipoId) {
          atual.produto_id = "";
          atual.produto_resolvido_id = "";
        }
      }
      next[index] = atual;
      return garantirReciboPrincipal(next);
    });

    if (produtoAtualId && produtoAtualId.startsWith("virtual-") && tipoId) {
      setProdutos((prev) =>
        prev.map((p) => (p.id === produtoAtualId ? { ...p, tipo_produto: tipoId } : p))
      );
    }

    setBuscaProduto("");
  }

  function addPagamento() {
    setPagamentos((prev) => [...prev, { ...initialPagamento }]);
  }

  function updatePagamento(index: number, campo: keyof PagamentoVenda, valor: string) {
    setPagamentos((prev) => {
      const next = [...prev];
      const atual = { ...next[index], [campo]: valor } as PagamentoVenda;
      next[index] = atual;
      return next;
    });
  }

  function updatePagamentoMonetario(index: number, campo: "valor_bruto" | "desconto_valor" | "valor_total", valor: string) {
    updatePagamento(index, campo, formatarValorDigitado(valor));
  }

  function removerPagamento(index: number) {
    setPagamentos((prev) => prev.filter((_, i) => i !== index));
  }

  function addParcelaPagamento(index: number) {
    setPagamentos((prev) => {
      const next = [...prev];
      const parcelas = [...(next[index]?.parcelas || [])];
      parcelas.push({ numero: String(parcelas.length + 1), valor: "", vencimento: "" });
      next[index] = { ...next[index], parcelas };
      return next;
    });
  }

  function updateParcelaPagamento(index: number, parcelaIndex: number, campo: keyof PagamentoParcela, valor: string) {
    setPagamentos((prev) => {
      const next = [...prev];
      const parcelas = [...(next[index]?.parcelas || [])];
      const parcelaAtual = { ...(parcelas[parcelaIndex] || { numero: "", valor: "", vencimento: "" }) };
      parcelaAtual[campo] = valor as any;
      parcelas[parcelaIndex] = parcelaAtual;
      next[index] = { ...next[index], parcelas };
      return next;
    });
  }

  function removerParcelaPagamento(index: number, parcelaIndex: number) {
    setPagamentos((prev) => {
      const next = [...prev];
      const parcelas = [...(next[index]?.parcelas || [])].filter((_, i) => i !== parcelaIndex);
      next[index] = { ...next[index], parcelas };
      return next;
    });
  }

  useEffect(() => {
    // Ao trocar a cidade, limpa buscas e produtos que não pertencem a ela
    if (!formVenda.destino_id) return;
    setBuscaProduto("");
    setRecibos((prev) => {
      const atualizado = prev.map((r) => {
        const prod = produtos.find((p) => p.id === r.produto_id);
        const ehGlobal = !!prod?.todas_as_cidades;
        if (prod && (ehGlobal || prod.cidade_id === formVenda.destino_id)) return r;
        return { ...r, produto_id: "", principal: false };
      });
      return garantirReciboPrincipal(atualizado);
    });
  }, [formVenda.destino_id, produtos]);

  function removerRecibo(index: number) {
    setRecibos((prev) => {
      const novo = prev.filter((_, i) => i !== index);
      return garantirReciboPrincipal(novo);
    });
  }

  function marcarReciboPrincipal(index: number) {
    setRecibos((prev) =>
      prev.map((recibo, i) => ({
        ...recibo,
        principal: i === index,
      }))
    );
  }

  function resetFormAndGoToConsulta() {
    setFormVenda({
      ...initialVenda,
      vendedor_id: currentUserId || "",
      data_lancamento: new Date().toISOString().substring(0, 10),
    });
    setRecibos([]);
    setPagamentos([]);
    setEditId(null);
    setCidadePrefill({ id: "", nome: "" });
    setBuscaCliente("");
    setBuscaDestino("");
    setBuscaProduto("");
    setBuscaCidadeSelecionada("");
    setResultadosCidade([]);
    setErro(null);
    window.location.href = "/vendas/consulta";
  }

  function cancelarCadastro() {
    setFormVenda({
      ...initialVenda,
      vendedor_id: currentUserId || "",
    });
    setRecibos([]);
    setEditId(null);
    setCidadePrefill({ id: "", nome: "" });
    setBuscaCliente("");
    setBuscaDestino("");
    setBuscaProduto("");
    setBuscaCidadeSelecionada("");
    setResultadosCidade([]);
    setErro(null);
    window.location.href = "/vendas/consulta";
  }

  // =======================================================
  // SALVAR VENDA COMPLETA (VENDA + RECIBOS)
  // =======================================================
  async function salvarVenda(e: React.FormEvent) {
    e.preventDefault();

    if (!podeCriar && !isAdmin) {
      setErro("Você não possui permissão para cadastrar vendas.");
      showToast("Você não possui permissão para cadastrar vendas.", "error");
      return;
    }

    if (recibos.length === 0) {
      setErro("Uma venda precisa ter ao menos 1 recibo.");
      showToast("Inclua ao menos um recibo na venda.", "error");
      return;
    }

    const clienteId = formVenda.cliente_id.trim();
    if (!clienteId) {
      setErro("Selecione um cliente valido antes de salvar.");
      showToast("Selecione um cliente valido antes de salvar.", "error");
      return;
    }

    if (formVenda.data_embarque && formVenda.data_final && !isEndOnOrAfterStart(formVenda.data_embarque, formVenda.data_final)) {
      setErro("A data final deve ser igual ou após a data de embarque.");
      showToast("A data final deve ser igual ou após a data de embarque.", "error");
      return;
    }
    if (!formVenda.data_venda) {
      setErro("Informe a data da venda (Systur).");
      showToast("Informe a data da venda (Systur).", "error");
      return;
    }
    for (let i = 0; i < recibos.length; i += 1) {
      const recibo = recibos[i];
      if (!recibo.tipo_produto_id) {
        const msg = `Recibo ${i + 1}: selecione o tipo de produto.`;
        setErro(msg);
        showToast(msg, "error");
        return;
      }
      if (!normalizeText(recibo.tipo_pacote || "")) {
        setTipoPacoteModal({
          mensagem: "É obrigatório a escolha de um tipo de pacote.",
        });
        return;
      }
      if (recibo.data_inicio && recibo.data_fim && !isEndOnOrAfterStart(recibo.data_inicio, recibo.data_fim)) {
        const msg = `Recibo ${i + 1}: a data fim deve ser igual ou após a data início.`;
        setErro(msg);
        showToast(msg, "error");
        return;
      }
    }

    try {
      setSalvando(true);
      setErro(null);

      const userId = currentUserId;
      if (!userId) {
        setErro("Usuário não autenticado.");
        showToast("Usuário não autenticado.", "error");
        setSalvando(false);
        return;
      }
      const vendedorResponsavel = formVenda.vendedor_id || userId;
      if (isGestorUser && !formVenda.vendedor_id) {
        setErro("Selecione o vendedor responsável pela venda.");
        showToast("Selecione o vendedor responsável pela venda.", "error");
        setSalvando(false);
        return;
      }

      const usoIndividualUser = Boolean(usoIndividual);
      if (!companyId) {
        throw new Error("Seu usuário precisa estar vinculado a uma empresa para cadastrar viagens.");
      }
      if (usoIndividualUser && vendedorResponsavel !== userId) {
        setErro("Uso individual: você só pode salvar vendas no seu próprio usuário.");
        showToast("Uso individual: selecione apenas seu usuário.", "error");
        setSalvando(false);
        return;
      }

      if (!recibos.length) {
        setErro("Uma venda precisa ter ao menos 1 recibo.");
        showToast("Inclua ao menos um recibo na venda.", "error");
        setSalvando(false);
        return;
      }

      const principalIndex = recibos.findIndex((r) => r.principal);
      const principalRecibo = principalIndex >= 0 ? recibos[principalIndex] : recibos[0];
      const produtoDestinoIdRaw = principalRecibo?.produto_id;
      if (!produtoDestinoIdRaw) {
        setErro("Selecione um produto para o recibo principal da venda.");
        showToast("Selecione o produto principal antes de salvar.", "error");
        setSalvando(false);
        return;
      }

      const possuiProdutoLocal = recibos.some((r) => {
        const prod = produtos.find((p) => p.id === r.produto_id);
        const ehGlobal =
          !!prod?.todas_as_cidades || (r.produto_id || "").startsWith("virtual-");
        return prod?.cidade_id && !ehGlobal;
      });

      if (possuiProdutoLocal && !formVenda.destino_id) {
        setErro("Selecione a cidade de destino para vendas com produtos vinculados a cidade.");
        showToast("Selecione a cidade de destino.", "error");
        setSalvando(false);
        return;
      }

      async function resolverProdutoId(recibo: FormRecibo): Promise<string> {
        const atualId = recibo.produto_id;
        const existente = produtos.find((p) => p.id === atualId);
        if (existente && !existente.isVirtual) return existente.id;

        const tipoId =
          recibo.tipo_produto_id ||
          existente?.tipo_produto ||
          (atualId?.startsWith("virtual-") ? atualId.replace("virtual-", "") : "");

        if (!tipoId) throw new Error("Selecione o tipo de produto do recibo.");

        const cidadeDestino = formVenda.destino_id;
        if (!cidadeDestino) throw new Error("Selecione a cidade de destino para usar produtos globais.");

        const tipoInfo = tipos.find((t) => t.id === tipoId);
        const isGlobalTipo = produtos.some((p) => p.tipo_produto === tipoId && !!p.todas_as_cidades);

        const produtoDaCidade = produtos.find(
          (p) => p.tipo_produto === tipoId && p.cidade_id === cidadeDestino && !p.todas_as_cidades
        );
        if (produtoDaCidade) return produtoDaCidade.id;

        if (isGlobalTipo) {
          const produtoGlobal = produtos.find((p) => p.tipo_produto === tipoId && !!p.todas_as_cidades);
          if (produtoGlobal) return produtoGlobal.id;
          const { data: globalDb, error: globalErr } = await supabase
            .from("produtos")
            .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
            .eq("tipo_produto", tipoId)
            .eq("todas_as_cidades", true)
            .limit(1)
            .maybeSingle();
          if (globalErr) throw globalErr;
          if (globalDb?.id) {
            setProdutos((prev) => {
              if (prev.some((p) => p.id === globalDb.id)) return prev;
              return [
                ...prev,
                {
                  id: globalDb.id,
                  nome: globalDb.nome,
                  cidade_id: globalDb.cidade_id,
                  tipo_produto: globalDb.tipo_produto,
                  todas_as_cidades: !!globalDb.todas_as_cidades,
                },
              ];
            });
            return globalDb.id;
          }
          throw new Error(
            "Produto global selecionado não possui cadastro na tabela de Produtos; cadastre o serviço como global antes de continuar.",
          );
        }

        const { data: produtoLocal, error: produtoLocalErr } = await supabase
          .from("produtos")
          .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
          .eq("tipo_produto", tipoId)
          .eq("cidade_id", cidadeDestino)
          .limit(1)
          .maybeSingle();
        if (produtoLocalErr) throw produtoLocalErr;
        if (produtoLocal?.id) {
          setProdutos((prev) => {
            if (prev.some((p) => p.id === produtoLocal.id)) return prev;
            return [
              ...prev,
              {
                id: produtoLocal.id,
                nome: produtoLocal.nome,
                cidade_id: produtoLocal.cidade_id,
                tipo_produto: produtoLocal.tipo_produto,
                todas_as_cidades: !!produtoLocal.todas_as_cidades,
              },
            ];
          });
          return produtoLocal.id;
        }

        const nomeProd = tipoInfo?.nome || "Produto";
        const { data: novo, error } = await supabase
          .from("produtos")
          .insert({
            nome: nomeProd,
            destino: nomeProd,
            cidade_id: cidadeDestino,
            tipo_produto: tipoId,
            ativo: true,
            todas_as_cidades: false,
          })
          .select("id")
          .single();
        if (error) throw error;
        const novoId = (novo as any)?.id;
        if (novoId) {
          setProdutos((prev) => [
            ...prev,
            {
              id: novoId,
              nome: nomeProd,
              cidade_id: cidadeDestino,
              tipo_produto: tipoId,
              todas_as_cidades: false,
            },
          ]);
          return novoId;
        }
        throw new Error("Não foi possível criar produto local.");
      }

      const produtoIdsResolvidos: string[] = [];
      for (const r of recibos) {
        const idResolvido = await resolverProdutoId(r);
        produtoIdsResolvidos.push(idResolvido);
      }

      const indexPrincipalFinal = principalIndex >= 0 ? principalIndex : 0;
      const produtoDestinoId = produtoIdsResolvidos[indexPrincipalFinal];

      const descontoComercialValor = formVenda.desconto_comercial_aplicado
        ? moedaParaNumero(formVenda.desconto_comercial_valor)
        : 0;
      if (formVenda.desconto_comercial_aplicado && Number.isNaN(descontoComercialValor)) {
        setErro("Desconto comercial inválido.");
        showToast("Informe um desconto comercial válido.", "error");
        setSalvando(false);
        return;
      }

      const totalTaxasRecibos = recibos.reduce((acc, r) => acc + (moedaParaNumero(r.valor_taxas) || 0), 0);
      const totalBrutoRecibos = recibos.reduce((acc, r) => acc + (moedaParaNumero(r.valor_total) || 0), 0);

      const termosNaoComissionaveis = await carregarTermosNaoComissionaveis();
      const formaMap = new Map(formasPagamento.map((f) => [f.id, f]));
      const pagamentosNormalizados = pagamentos.map((p) => {
        const forma = formaMap.get(p.forma_id);
        const formaNome = p.forma_nome || forma?.nome || "";
        const valorBrutoNum = moedaParaNumero(p.valor_bruto) || 0;
        const descontoNum = moedaParaNumero(p.desconto_valor) || 0;
        const totalNum = moedaParaNumero(p.valor_total);
        const totalFinal = Number.isFinite(totalNum) ? totalNum : Math.max(0, valorBrutoNum - descontoNum);
        const parcelas = (p.parcelas || []).map((parcela, idx) => ({
          numero: parcela.numero || String(idx + 1),
          valor: moedaParaNumero(parcela.valor) || 0,
          vencimento: parcela.vencimento || null,
        }));
        return {
          ...p,
          forma,
          valorBrutoNum,
          descontoNum,
          totalFinal,
          parcelas,
          pagaComissao: isFormaNaoComissionavel(formaNome, termosNaoComissionaveis)
            ? false
            : (forma?.paga_comissao ?? true),
        };
      });

      const totalPago = pagamentosNormalizados.reduce((acc, p) => acc + (p.totalFinal || 0), 0);
      const valorNaoComissionado = pagamentosNormalizados.reduce((acc, p) => {
        if (p.pagaComissao === false) return acc + (p.totalFinal || 0);
        return acc;
      }, 0);
      const valorVendaComissionavel = totalPago > 0 ? Math.max(0, totalPago - valorNaoComissionado) : 0;

      const getCidadeNome = (cidadeId?: string | null) =>
        cidades.find((c) => c.id === cidadeId)?.nome || "";

      const recibosPayload = [] as any[];
      for (let idx = 0; idx < recibos.length; idx += 1) {
        const recibo = recibos[idx];
        const produtoIdResolvido = produtoIdsResolvidos[idx];
        const prod = produtos.find((p) => p.id === produtoIdResolvido);
        const tipoId =
          recibo.tipo_produto_id ||
          prod?.tipo_produto ||
          (recibo.produto_id?.startsWith("virtual-") ? recibo.produto_id.replace("virtual-", "") : "");
        if (!tipoId) {
          throw new Error("Produto do recibo não possui tipo vinculado.");
        }
        const valTotalNum = moedaParaNumero(recibo.valor_total);
        const valTaxasNum = moedaParaNumero(recibo.valor_taxas);
        const valDuNum = moedaParaNumero(recibo.valor_du);
        const ravRaw = recibo.valor_rav || "";
        const valRavNum = ravRaw ? moedaParaNumero(ravRaw) : 0;
        if (Number.isNaN(valTotalNum)) {
          throw new Error("Valor total inválido. Digite um valor monetário.");
        }
        if (Number.isNaN(valTaxasNum)) {
          throw new Error("Valor de taxas inválido. Digite um valor monetário.");
        }
        if (Number.isNaN(valDuNum)) {
          throw new Error("Valor de DU inválido. Digite um valor monetário.");
        }
        if (ravRaw && Number.isNaN(valRavNum)) {
          throw new Error("Valor de RAV inválido. Digite um valor monetário.");
        }
        let contratoPath = recibo.contrato_path || null;
        let contratoUrl = recibo.contrato_url || null;
        if (recibo.contrato_file) {
          const safeName = sanitizeFileName(recibo.contrato_file.name || "contrato.pdf");
          const path = `recibos/${editId || "novo"}/${Date.now()}-${safeName}`;
          const upload = await supabase.storage.from(STORAGE_BUCKET).upload(path, recibo.contrato_file, {
            cacheControl: "3600",
            upsert: false,
            contentType: recibo.contrato_file.type || "application/pdf",
          });
          if (upload.error) throw upload.error;
          contratoPath = path;
          contratoUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl || null;
        }
        const cidadeNomeResolvida =
          getCidadeNome(formVenda.destino_id) || getCidadeNome(prod?.cidade_id);
        const tipoNome = tipos.find((t) => t.id === tipoId)?.nome || prod?.nome || "";
        recibosPayload.push({
          produto_id: tipoId,
          produto_resolvido_id: produtoIdResolvido,
          numero_recibo: recibo.numero_recibo.trim(),
          numero_reserva: recibo.numero_reserva?.trim() || null,
          tipo_pacote: recibo.tipo_pacote?.trim() || null,
          valor_total: valTotalNum,
          valor_taxas: valTaxasNum,
          valor_du: valDuNum || 0,
          valor_rav: valRavNum,
          data_inicio: recibo.data_inicio || null,
          data_fim: recibo.data_fim || null,
          contrato_path: contratoPath,
          contrato_url: contratoUrl,
          produto_nome: prod?.nome || null,
          tipo_nome: tipoNome || null,
          cidade_nome: cidadeNomeResolvida || null,
        });
      }

      const vendaPayload = {
        vendedor_id: vendedorResponsavel,
        cliente_id: clienteId,
        destino_id: produtoDestinoId,
        destino_cidade_id: formVenda.destino_id || null,
        data_lancamento: formVenda.data_lancamento,
        data_venda: formVenda.data_venda,
        data_embarque: formVenda.data_embarque || null,
        data_final: formVenda.data_final || null,
        desconto_comercial_aplicado: formVenda.desconto_comercial_aplicado,
        desconto_comercial_valor: descontoComercialValor || null,
        valor_total_bruto: totalBrutoRecibos || null,
        valor_total_pago: totalPago || null,
        valor_total: valorVendaComissionavel || null,
        valor_taxas: totalTaxasRecibos || null,
        valor_nao_comissionado: valorNaoComissionado || null,
      };

      const pagamentosPayload = pagamentosNormalizados.map((pagamento) => ({
        forma_pagamento_id: pagamento.forma?.id || pagamento.forma_id || null,
        forma_nome: pagamento.forma_nome || pagamento.forma?.nome || null,
        operacao: pagamento.operacao || null,
        plano: pagamento.plano || null,
        valor_bruto: pagamento.valorBrutoNum || null,
        desconto_valor: pagamento.descontoNum || null,
        valor_total: pagamento.totalFinal || null,
        parcelas: pagamento.parcelas?.length ? pagamento.parcelas : null,
        parcelas_qtd: pagamento.parcelas?.length || null,
        parcelas_valor: pagamento.parcelas?.length === 1 ? pagamento.parcelas[0].valor : null,
        vencimento_primeira: pagamento.parcelas?.[0]?.vencimento || null,
        paga_comissao: pagamento.pagaComissao,
      }));

      const resp = await fetch("/api/v1/vendas/cadastro-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venda_id: editId || null,
          orcamento_id: orcamentoId || null,
          venda: vendaPayload,
          recibos: recibosPayload,
          pagamentos: pagamentosPayload,
        }),
      });

      if (resp.status === 409) {
        const payload = (await resp.json()) as { code?: string };
        const cod = payload?.code || "";
        if (cod === "RECIBO_DUPLICADO" || cod === "RESERVA_DUPLICADA") {
          const alvo = cod === "RECIBO_DUPLICADO" ? "Recibo" : "Reserva";
          setDuplicadoModal({
            mensagem: `${alvo} já foi cadastrado no sistema. Só é possível cadastrar ${alvo.toLowerCase()}s novos.`,
          });
          setErro(null);
          return;
        }
      }

      if (!resp.ok) throw new Error(await resp.text());

      const payload = (await resp.json()) as { venda_id?: string };
      const vendaIdFinal = payload?.venda_id || editId || "";

      if (editId) {
        await registrarLog({
          acao: "venda_atualizada",
          modulo: "Vendas",
          detalhes: { id: editId, venda: formVenda, recibos },
        });
        showToast("Venda atualizada com sucesso!", "success");
      } else {
        await registrarLog({
          acao: "venda_criada",
          modulo: "Vendas",
          detalhes: {
            venda: formVenda,
            recibos,
            id: vendaIdFinal,
          },
        });
        showToast("Venda cadastrada com sucesso!", "success");
      }

      setTimeout(() => resetFormAndGoToConsulta(), 200);
    } catch (e: any) {
      console.error(e);
      const detalhes = e?.message || e?.error?.message || "";
      const cod = e?.code || e?.error?.code || "";
      if (cod === "RECIBO_DUPLICADO" || cod === "RESERVA_DUPLICADA") {
        const alvo = cod === "RECIBO_DUPLICADO" ? "Recibo" : "Reserva";
        setDuplicadoModal({
          mensagem: `${alvo} já foi cadastrado no sistema. Só é possível cadastrar ${alvo.toLowerCase()}s novos.`,
        });
        setErro(null);
      } else {
        setErro(`Erro ao salvar venda.${cod ? ` Código: ${cod}.` : ""}${detalhes ? ` Detalhes: ${detalhes}` : ""}`);
        showToast("Erro ao salvar venda.", "error");
      }
    } finally {
      setSalvando(false);
    }
  }

  // =======================================================
  // BLOQUEIO TOTAL
  // =======================================================
  if (!podeVer) {
    return (
      <div className="card-base card-config">
        <strong>Acesso negado ao módulo de Vendas.</strong>
      </div>
    );
  }

  if (!podeCriar && !isAdmin) {
    return (
      <div className="card-base card-config">
        <strong>Você não possui permissão para cadastrar vendas.</strong>
      </div>
    );
  }

  // =======================================================
  // FORM
  // =======================================================
  return (
    <div className="min-h-screen bg-slate-50 p-2 md:p-6">

      {/* FORM VENDA */}
      <div className="card-base card-green form-card mb-3">
        <h3>{editId ? "Editar venda" : "Cadastro de Venda"}</h3>
        {editId && (
          <small style={{ color: "#0f172a" }}>
            Modo edição — altere cliente, cidade de destino, embarque e recibos.
          </small>
        )}

        {erro && (
          <div className="card-base card-config mb-3">
            <strong>{erro}</strong>
          </div>
        )}

        <form onSubmit={salvarVenda}>
          <div className="flex flex-col md:flex-row md:flex-wrap gap-4">
            {isGestorUser && (
              <div className="form-group flex-1 min-w-[220px]">
                <label className="form-label">Vendedor *</label>
                <select
                  className="form-select"
                  value={formVenda.vendedor_id}
                  onChange={(e) =>
                    setFormVenda((prev) => ({ ...prev, vendedor_id: e.target.value }))
                  }
                  required
                >
                  {vendedoresEquipe.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome_completo || "Vendedor"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* CLIENTE */}
            <div className="form-group flex-1 min-w-[220px] relative">
              <label className="form-label">Cliente *</label>
              <input
                className="form-input"
                placeholder="Buscar cliente..."
                autoComplete="off"
                value={buscaCliente || clienteSelecionado?.nome || ""}
                onChange={(e) => handleClienteInputChange(e.target.value)}
                onFocus={() => setMostrarSugestoesCliente(true)}
                onBlur={() => {
                  setTimeout(() => setMostrarSugestoesCliente(false), 150);
                  if (!buscaCliente.trim()) return;
                  const texto = normalizeText(buscaCliente);
                  const cpfTexto = onlyDigits(buscaCliente);
                  const achado = clientes.find((c) => {
                    const cpf = onlyDigits(c.cpf || "");
                    return (
                      normalizeText(c.nome) === texto ||
                      (cpfTexto && cpf === cpfTexto)
                    );
                  });
                  if (achado) {
                    setFormVenda({ ...formVenda, cliente_id: achado.id });
                    setBuscaCliente("");
                  }
                }}
                required
              />
              {mostrarSugestoesCliente && buscaCliente.trim().length >= 1 && (
                <div
                  className="card-base card-config"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    maxHeight: 200,
                    overflowY: "auto",
                    zIndex: 20,
                    padding: "4px 0",
                  }}
                >
                  {clientesFiltrados.length === 0 ? (
                    <div style={{ padding: "6px 12px", color: "#94a3b8" }}>
                      Nenhum cliente encontrado.
                    </div>
                  ) : (
                    clientesFiltrados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="btn btn-ghost w-full text-left"
                        style={{ padding: "6px 12px" }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFormVenda((prev) => ({ ...prev, cliente_id: c.id }));
                          setBuscaCliente("");
                          setMostrarSugestoesCliente(false);
                        }}
                      >
                        {c.nome}
                        {c.cpf ? (
                          <span style={{ color: "#6b7280", marginLeft: 6 }}>
                            • {c.cpf}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* CIDADE DE DESTINO */}
            <div className="form-group flex-1 min-w-[220px] relative">
              <label className="form-label">Cidade de Destino *</label>
              <input
                className="form-input"
                placeholder="Digite o nome da cidade"
                value={buscaDestino}
                onChange={(e) => handleCidadeDestino(e.target.value)}
                onFocus={() => setMostrarSugestoesCidade(true)}
                onBlur={() => setTimeout(() => setMostrarSugestoesCidade(false), 150)}
                required={cidadeObrigatoria}
                style={{ marginBottom: 6 }}
              />
              {mostrarSugestoesCidade && (buscandoCidade || buscaDestino.trim().length >= 2) && (
                <div
                  className="card-base card-config"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    maxHeight: 160,
                    overflowY: "auto",
                    zIndex: 20,
                    padding: "4px 0",
                  }}
                >
                  {buscandoCidade && (
                    <div style={{ padding: "6px 12px", color: "#64748b" }}>
                      Buscando cidades...
                    </div>
                  )}
                  {!buscandoCidade && erroCidade && (
                    <div style={{ padding: "6px 12px", color: "#dc2626" }}>{erroCidade}</div>
                  )}
                  {!buscandoCidade && !erroCidade && resultadosCidade.length === 0 && (
                    <div style={{ padding: "6px 12px", color: "#94a3b8" }}>
                      Nenhuma cidade encontrada.
                    </div>
                  )}
                  {!buscandoCidade && !erroCidade && resultadosCidade.map((c) => {
                    const label = c.subdivisao_nome ? `${c.nome} (${c.subdivisao_nome})` : c.nome;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="btn btn-ghost w-full text-left"
                        style={{ padding: "6px 12px" }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFormVenda((prev) => ({ ...prev, destino_id: c.id }));
                          setBuscaDestino(label);
                          setBuscaCidadeSelecionada(label);
                          setMostrarSugestoesCidade(false);
                          setResultadosCidade([]);
                        }}
                      >
                        {label}
                        {c.pais_nome ? <span style={{ color: "#6b7280", marginLeft: 6 }}>• {c.pais_nome}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* LANÇADA EM */}
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">Lançada em</label>
              <input
                className="form-input w-full"
                type="date"
                value={formVenda.data_lancamento}
                onFocus={selectAllInputOnFocus}
                onChange={(e) =>
                  setFormVenda((prev) => ({ ...prev, data_lancamento: e.target.value }))
                }
              />
            </div>

            {/* DATA VENDA */}
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">
                Data da venda *
                <span
                  title="Informe a data da venda conforme no Systur, usada para emissão de NF."
                  style={{ marginLeft: 6, color: '#0ea5e9', cursor: 'help' }}
                >
                  ?
                </span>
              </label>
              <input
                className="form-input w-full"
                type="date"
                value={formVenda.data_venda}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => setFormVenda((prev) => ({ ...prev, data_venda: e.target.value }))}
                required
              />
            </div>

            {/* EMBARQUE */}
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">Data de embarque</label>
              <input
                className="form-input w-full"
                type="date"
                value={formVenda.data_embarque}
                onFocus={selectAllInputOnFocus}
                onChange={(e) =>
                  setFormVenda((prev) => {
                    const proximaData = e.target.value;
                    const minDataFinal = proximaData || "";
                    const dataFinalAtualizada =
                      prev.data_final && minDataFinal && prev.data_final < minDataFinal
                        ? minDataFinal
                        : prev.data_final;
                    return {
                      ...prev,
                      data_embarque: proximaData,
                      data_final: dataFinalAtualizada,
                    };
                  })
                }
              />
            </div>
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">Data final</label>
              <input
                className="form-input w-full"
                type="date"
                value={formVenda.data_final}
                min={formVenda.data_embarque || undefined}
                onFocus={selectAllInputOnFocus}
                onChange={(e) =>
                  setFormVenda({
                    ...formVenda,
                    data_final:
                      formVenda.data_embarque && e.target.value && e.target.value < formVenda.data_embarque
                        ? formVenda.data_embarque
                        : e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">Aplicar desconto comercial?</label>
              <select
                className="form-select"
                value={formVenda.desconto_comercial_aplicado ? "sim" : "nao"}
                onChange={(e) =>
                  setFormVenda((prev) => ({
                    ...prev,
                    desconto_comercial_aplicado: e.target.value === "sim",
                    desconto_comercial_valor:
                      e.target.value === "sim" ? prev.desconto_comercial_valor : "",
                  }))
                }
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </div>
            {formVenda.desconto_comercial_aplicado && (
              <div className="form-group flex-1 min-w-[180px]">
                <label className="form-label">Valor do desconto</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={formVenda.desconto_comercial_valor}
                  onFocus={selectAllInputOnFocus}
                  onChange={(e) =>
                    setFormVenda((prev) => ({
                      ...prev,
                      desconto_comercial_valor: formatarValorDigitado(e.target.value),
                    }))
                  }
                  onBlur={() =>
                    setFormVenda((prev) => ({
                      ...prev,
                      desconto_comercial_valor: normalizeMoneyInput(prev.desconto_comercial_valor),
                    }))
                  }
                />
              </div>
            )}
          </div>

          {/* RECIBOS */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-lg">Recibos da Venda</h4>
            <button
              type="button"
              className="btn btn-light w-full sm:w-auto"
              style={{ marginLeft: "auto" }}
              onClick={() => setShowCalculator(true)}
            >
              Calculadora
            </button>
          </div>

          {recibos.map((r, i) => {
            const produtoSelecionado = produtos.find((p) => p.id === r.produto_id);
            const nomeProdutoAtual = produtoSelecionado?.nome || "";
            const produtosFiltrados = filtrarProdutos(buscaProduto, r.tipo_produto_id);
            const existeProdutoGlobal = existeProdutoGlobalParaTipo(r.tipo_produto_id);
            const produtoDesabilitado =
              !r.tipo_produto_id || (!formVenda.destino_id && !existeProdutoGlobal);
            const placeholderProduto = !r.tipo_produto_id
              ? "Selecione o tipo de produto primeiro..."
              : existeProdutoGlobal
                ? "Escolha uma cidade ou selecione um produto global..."
                : "Selecione uma cidade primeiro e busque o produto...";
            return (
              <div key={i} className="card-base mb-2">
                <div className="flex flex-col md:flex-row md:flex-wrap gap-4">
                  {/* TIPO DE PRODUTO */}
                  <div className="form-group flex-1 min-w-[180px]">
                    <label className="form-label">Tipo de Produto *</label>
                    <select
                      className="form-select"
                      value={r.tipo_produto_id}
                      onChange={(e) => handleTipoReciboChange(i, e.target.value)}
                      required
                      disabled={tipos.length === 0}
                    >
                      <option value="">Selecione</option>
                      {tipos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome || t.tipo || "Tipo"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* PRODUTO */}
                  <div className="form-group flex-1 min-w-[180px]">
                    <label className="form-label">Produto *</label>
                    <input
                      className="form-input"
                      list={`listaProdutos-${i}`}
                      placeholder={placeholderProduto}
                      value={
                        reciboEmEdicao === i
                          ? buscaProduto || nomeProdutoAtual
                          : nomeProdutoAtual
                      }
                      onFocus={() => {
                        setReciboEmEdicao(i);
                        setBuscaProduto("");
                      }}
                      onChange={(e) => setBuscaProduto(e.target.value)}
                      onBlur={() => {
                        const texto = buscaProduto.trim();
                        if (!texto) {
                          updateRecibo(i, "produto_id", "");
                        } else {
                          const achado = produtosFiltrados.find(
                            (p) => p.nome.toLowerCase() === texto.toLowerCase()
                          );
                          if (achado) {
                            definirProdutoRecibo(i, achado.id);
                          }
                        }
                        setReciboEmEdicao(null);
                        setBuscaProduto("");
                      }}
                      required
                      disabled={produtoDesabilitado}
                    />
                    <datalist id={`listaProdutos-${i}`}>
                      {produtosFiltrados.map((p) => (
                        <option key={p.id} value={p.nome} />
                      ))}
                    </datalist>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="recibo-principal"
                          checked={r.principal}
                          onChange={() => marcarReciboPrincipal(i)}
                          className="form-radio h-4 w-4 text-sky-600"
                        />
                        <span className="font-semibold text-[11px]">Produto principal</span>
                      </label>
                      <span>Define o produto principal usado nos relatórios.</span>
                    </div>
                  </div>

                  {/* NÚMERO */}
                  <div className="form-group flex-1 min-w-[120px]">
                    <label className="form-label">Número recibo *</label>
                    <input
                      className="form-input"
                      value={r.numero_recibo}
                      onChange={(e) =>
                        updateRecibo(i, "numero_recibo", e.target.value)
                      }
                      required
                    />
                  </div>

                  {/* RESERVA */}
                  <div className="form-group flex-1 min-w-[140px]">
                    <label className="form-label">Reserva</label>
                    <input
                      className="form-input"
                      value={r.numero_reserva || ""}
                      onChange={(e) => updateRecibo(i, "numero_reserva", e.target.value)}
                    />
                  </div>

                  {/* TIPO PACOTE */}
                  <div className="form-group flex-1 min-w-[180px]">
                    <label className="form-label">Tipo de Pacote</label>
                    <select
                      className="form-select"
                      value={r.tipo_pacote || ""}
                      onChange={(e) => updateRecibo(i, "tipo_pacote", e.target.value)}
                      disabled={tiposPacote.length === 0}
                      style={
                        isReguaTipoPacote(r.tipo_pacote)
                          ? { color: "#b91c1c", fontWeight: 700 }
                          : undefined
                      }
                    >
                      <option value="">Selecione</option>
                      {tiposPacote.map((tipo) => {
                        const label = tipo.nome || "";
                        const isRegua = isReguaTipoPacote(label);
                        return (
                          <option
                            key={tipo.id}
                            value={label}
                            style={isRegua ? { color: "#b91c1c", fontWeight: 600 } : undefined}
                          >
                            {label}
                          </option>
                        );
                      })}
                      {r.tipo_pacote &&
                        !tiposPacote.some(
                          (tipo) => normalizeText(tipo.nome) === normalizeText(r.tipo_pacote || "")
                        ) && (
                          <option value={r.tipo_pacote}>{`${r.tipo_pacote} (não cadastrado)`}</option>
                        )}
                    </select>
                    {tiposPacote.length === 0 && (
                      <input
                        className="form-input mt-2"
                        value={r.tipo_pacote || ""}
                        onChange={(e) => updateRecibo(i, "tipo_pacote", e.target.value)}
                        placeholder="Ex: Somente Hotel"
                      />
                    )}
                  </div>

                  {/* DATA INÍCIO */}
                  <div className="form-group flex-1 min-w-[160px]">
                    <label className="form-label">Início *</label>
                    <input
                      className="form-input w-full"
                      type="date"
                      value={r.data_inicio}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updateRecibo(i, "data_inicio", e.target.value)}
                      required
                    />
                  </div>

                  {/* DATA FIM */}
                  <div className="form-group flex-1 min-w-[160px]">
                    <label className="form-label">Fim *</label>
                    <input
                      className="form-input w-full"
                      type="date"
                      value={r.data_fim}
                      min={r.data_inicio || undefined}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updateRecibo(i, "data_fim", e.target.value)}
                      required
                    />
                  </div>

                  {/* VALOR */}
                  <div className="form-group flex-1 min-w-[120px]">
                    <label className="form-label">Valor total *</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9,.]*"
                      placeholder="0,00"
                      value={r.valor_total}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updateReciboMonetario(i, "valor_total", e.target.value)}
                      onBlur={() => updateRecibo(i, "valor_total", normalizeMoneyInput(r.valor_total))}
                      required
                    />
                  </div>

                  {/* TAXAS */}
                  <div className="form-group flex-1 min-w-[120px]">
                    <label className="form-label">Taxas</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9,.]*"
                      placeholder="0,00"
                      value={r.valor_taxas}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updateReciboMonetario(i, "valor_taxas", e.target.value)}
                      onBlur={() => updateRecibo(i, "valor_taxas", normalizeMoneyInput(r.valor_taxas))}
                    />
                  </div>

                  {/* DU */}
                  <div className="form-group flex-1 min-w-[120px]">
                    <label className="form-label">DU</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9,.]*"
                      placeholder="0,00"
                      value={r.valor_du}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updateReciboMonetario(i, "valor_du", e.target.value)}
                      onBlur={() => updateRecibo(i, "valor_du", normalizeMoneyInput(r.valor_du))}
                    />
                  </div>

                  {/* RAV */}
                  <div className="form-group flex-1 min-w-[120px]">
                    <label
                      className="form-label"
                      title="Se possui RAV, informe o valor total somado ao RAV. O sistema desconta o RAV nos calculos de meta e comissao."
                    >
                      RAV
                    </label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9,.]*"
                      placeholder="0,00"
                      value={r.valor_rav}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updateReciboMonetario(i, "valor_rav", e.target.value)}
                      onBlur={() => updateRecibo(i, "valor_rav", normalizeMoneyInput(r.valor_rav))}
                    />
                    {hasRavValue(r.valor_rav) && (
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                        Total deve incluir o RAV. O sistema desconta o RAV no calculo de meta/comissao.
                      </div>
                    )}
                  </div>

                  {/* REMOVER */}
                  <div className="form-group flex-none w-20 flex items-end">
                    <button
                      type="button"
                      className="btn-icon btn-danger mt-2"
                      onClick={() => removerRecibo(i)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: 8 }}>
                  <div className="form-group flex-1 min-w-[220px]">
                    <label className="form-label">Contrato (PDF)</label>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="form-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setRecibos((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], contrato_file: file, contrato_url: next[i].contrato_url };
                          return next;
                        });
                      }}
                    />
                    {r.contrato_url && (
                      <div style={{ marginTop: 6 }}>
                        <a className="link" href={r.contrato_url} target="_blank" rel="noreferrer">
                          Ver contrato anexado
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* PAGAMENTOS */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-lg">Formas de Pagamento</h4>
          </div>

          {pagamentos.map((p, idx) => {
            const formaSelecionada = formasPagamento.find((f) => f.id === p.forma_id);
            return (
              <div key={`pag-${idx}`} className="card-base mb-2">
                <div className="flex flex-col md:flex-row md:flex-wrap gap-4">
                  <div className="form-group flex-1 min-w-[180px]">
                    <label className="form-label">Forma *</label>
                    <select
                      className="form-select"
                      value={p.forma_id}
                      onChange={(e) => {
                        const value = e.target.value;
                        const match = formasPagamento.find((f) => f.id === value);
                        setPagamentos((prev) => {
                          const next = [...prev];
                          next[idx] = {
                            ...next[idx],
                            forma_id: value,
                            forma_nome: match?.nome || next[idx].forma_nome,
                          };
                          return next;
                        });
                      }}
                    >
                      <option value="">Selecione</option>
                      {formasPagamento.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                    {!p.forma_id && (
                      <input
                        className="form-input mt-2"
                        placeholder="Nome da forma"
                        value={p.forma_nome}
                        onChange={(e) => updatePagamento(idx, "forma_nome", e.target.value)}
                      />
                    )}
                    {formaSelecionada && (
                      <small style={{ color: "#64748b" }}>
                        Comissão: {formaSelecionada.paga_comissao ? "Sim" : "Não"}
                      </small>
                    )}
                  </div>

                  <div className="form-group flex-1 min-w-[160px]">
                    <label className="form-label">Operação</label>
                    <input
                      className="form-input"
                      value={p.operacao}
                      onChange={(e) => updatePagamento(idx, "operacao", e.target.value)}
                    />
                  </div>

                  <div className="form-group flex-1 min-w-[140px]">
                    <label className="form-label">Plano</label>
                    <input
                      className="form-input"
                      value={p.plano}
                      onChange={(e) => updatePagamento(idx, "plano", e.target.value)}
                    />
                  </div>

                  <div className="form-group flex-1 min-w-[140px]">
                    <label className="form-label">Valor</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={p.valor_bruto}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updatePagamentoMonetario(idx, "valor_bruto", e.target.value)}
                      onBlur={() => updatePagamento(idx, "valor_bruto", normalizeMoneyInput(p.valor_bruto))}
                    />
                  </div>

                  <div className="form-group flex-1 min-w-[140px]">
                    <label className="form-label">Desconto</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={p.desconto_valor}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updatePagamentoMonetario(idx, "desconto_valor", e.target.value)}
                      onBlur={() => updatePagamento(idx, "desconto_valor", normalizeMoneyInput(p.desconto_valor))}
                    />
                  </div>

                  <div className="form-group flex-1 min-w-[140px]">
                    <label className="form-label">Total</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={p.valor_total}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => updatePagamentoMonetario(idx, "valor_total", e.target.value)}
                      onBlur={() => updatePagamento(idx, "valor_total", normalizeMoneyInput(p.valor_total))}
                    />
                  </div>

                  <div className="form-group flex-none w-20 flex items-end">
                    <button
                      type="button"
                      className="btn-icon btn-danger mt-2"
                      onClick={() => removerPagamento(idx)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="flex items-center gap-2">
                    <strong>Parcelas</strong>
                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() => addParcelaPagamento(idx)}
                    >
                      + Parcela
                    </button>
                  </div>
                  {(p.parcelas || []).length === 0 ? (
                    <div style={{ color: "#94a3b8", marginTop: 6 }}>Nenhuma parcela informada.</div>
                  ) : (
                    <div className="table-container overflow-x-auto" style={{ marginTop: 8 }}>
                      <table className="table-default table-compact table-mobile-cards">
                        <thead>
                          <tr>
                            <th>Parcela</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th className="th-actions">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.parcelas.map((parcela, parcelaIdx) => (
                            <tr key={`parcela-${idx}-${parcelaIdx}`}>
                              <td data-label="Parcela">
                                <input
                                  className="form-input"
                                  value={parcela.numero}
                                  onChange={(e) =>
                                    updateParcelaPagamento(idx, parcelaIdx, "numero", e.target.value)
                                  }
                                />
                              </td>
                              <td data-label="Valor">
                                <input
                                  className="form-input"
                                  value={parcela.valor}
                                  onFocus={selectAllInputOnFocus}
                                  onChange={(e) =>
                                    updateParcelaPagamento(
                                      idx,
                                      parcelaIdx,
                                      "valor",
                                      formatarValorDigitado(e.target.value)
                                    )
                                  }
                                  onBlur={() =>
                                    updateParcelaPagamento(
                                      idx,
                                      parcelaIdx,
                                      "valor",
                                      normalizeMoneyInput(parcela.valor)
                                    )
                                  }
                                />
                              </td>
                              <td data-label="Vencimento">
                                <input
                                  className="form-input"
                                  type="date"
                                  value={parcela.vencimento}
                                  onFocus={selectAllInputOnFocus}
                                  onChange={(e) =>
                                    updateParcelaPagamento(idx, parcelaIdx, "vencimento", e.target.value)
                                  }
                                />
                              </td>
                              <td className="th-actions" data-label="Ações">
                                <div className="action-buttons">
                                  <button
                                    type="button"
                                    className="btn-icon btn-danger"
                                    onClick={() => removerParcelaPagamento(idx, parcelaIdx)}
                                    title="Remover parcela"
                                    aria-label="Remover parcela"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-light w-full sm:w-auto"
              onClick={addPagamento}
            >
              ➕ Adicionar pagamento
            </button>
          </div>

          <div className="mt-3 mobile-stack-buttons">
            <button
              type="button"
              className="btn btn-primary w-full sm:w-auto"
              onClick={addRecibo}
            >
              ➕ Adicionar recibo
            </button>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto"
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Salvar venda"}
            </button>
            <button
              type="button"
              className="btn btn-light w-full sm:w-auto"
              onClick={cancelarCadastro}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
      {duplicadoModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Duplicidade de recibo"
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header">
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>{duplicadoModal.mensagem}</p>
            </div>
            <div className="modal-footer mobile-stack-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDuplicadoModal(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {tipoPacoteModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Tipo de pacote obrigatório"
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header">
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>{tipoPacoteModal.mensagem}</p>
            </div>
            <div className="modal-footer mobile-stack-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setTipoPacoteModal(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <CalculatorModal
        open={showCalculator}
        onClose={() => setShowCalculator(false)}
      />
    </div>
  );
}
