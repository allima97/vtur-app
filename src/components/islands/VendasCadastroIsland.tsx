import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { fetchApiJsonWithPersistentCache } from "../../lib/apiPersistentCache";
import { fetchCidadesByApiWithCache } from "../../lib/cidadesSearchApiCache";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { registrarLog } from "../../lib/logs";
import { normalizeText } from "../../lib/normalizeText";
import { normalizeTipoPacoteRuleKey } from "../../lib/tipoPacote";
import { formatNumberBR } from "../../lib/format";
import { guessTimeZoneFromCity, setAppTimeZone, toISODateLocal } from "../../lib/dateTime";
import { normalizeMoneyInput, sanitizeMoneyInput, selectAllInputOnFocus } from "../../lib/inputNormalization";
import { cpfDigitsToFormatted, matchesCpfSearch, onlyDigits } from "../../lib/searchNormalization";
import { carregarTermosNaoComissionaveis, isFormaNaoComissionavel } from "../../lib/pagamentoUtils";
import { bumpVendasCacheVersion } from "../../lib/vendasCacheVersion";
import CalculatorModal from "../ui/CalculatorModal";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import FileUploadField from "../ui/primer/FileUploadField";
import AppNoticeDialog from "../ui/primer/AppNoticeDialog";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

const STORAGE_BUCKET = "viagens";

type Cliente = {
  id: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
};
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

async function fetchVendasCadastroBase(params?: { noCache?: boolean; cacheIdentity?: string }) {
  const qs = new URLSearchParams();
  if (params?.noCache) qs.set("no_cache", "1");
  const endpoint = `/api/v1/vendas/cadastro-base?${qs.toString()}`;
  const cacheIdentity = String(params?.cacheIdentity || "anon");
  return fetchApiJsonWithPersistentCache<{
    user: {
      id: string;
      papel: string;
      company_id: string | null;
      uso_individual: boolean;
      is_gestor: boolean;
      can_assign_vendedor?: boolean;
    };
    vendedoresEquipe: VendedorOption[];
    clientes: Cliente[];
    cidades: Cidade[];
    produtos: Produto[];
    tipos: { id: string; nome: string | null; tipo?: string | null }[];
    tiposPacote: TipoPacote[];
    formasPagamento: FormaPagamento[];
  }>({
    endpoint,
    cacheScope: "vendas-cadastro-base",
    cacheKey: `v2:${cacheIdentity}`,
    noCache: Boolean(params?.noCache),
    persistentTtlMs: 10 * 60 * 1000,
    queryLiteTtlMs: 20_000,
  });
}

async function fetchCidadesSugestoes(params: {
  query: string;
  limite?: number;
  signal?: AbortSignal;
}) {
  return fetchCidadesByApiWithCache({
    query: params.query,
    limit: params.limite ?? 60,
    signal: params.signal,
    cacheNamespace: "vendas-cadastro",
    endpoints: ["/api/v1/vendas/cidades-busca"],
    serverNoCache: true,
  });
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
  data_lancamento: toISODateLocal(new Date()),
  data_venda: toISODateLocal(new Date()),
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

function formatDocumentoCliente(value?: string | null): string {
  const digits = onlyDigits(value || "");
  if (!digits) return "Sem documento";
  if (digits.length === 11) return cpfDigitsToFormatted(digits);
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  return digits;
}

function buildClienteInfoResumo(cliente?: Cliente | null): string {
  if (!cliente) return "";
  const documento = formatDocumentoCliente(cliente.cpf);
  const telefone = String(cliente.whatsapp || cliente.telefone || "").trim();
  const email = String(cliente.email || "").trim();
  const extras = [telefone ? `Contato: ${telefone}` : "", email ? `E-mail: ${email}` : ""]
    .filter(Boolean)
    .join(" • ");
  return extras ? `${documento} • ${extras}` : documento;
}

function dataParaInput(value?: string | Date | null) {
  if (value == null) return "";
  if (typeof value === "string") {
    if (value.includes("T")) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return toISODateLocal(parsed);
      }
      return value.split("T")[0];
    }
    return value;
  }
  return toISODateLocal(value);
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
  const { can, loading: loadingPerms, ready, userId } = usePermissoesStore();
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
  const [canAssignVendedor, setCanAssignVendedor] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [usoIndividual, setUsoIndividual] = useState<boolean>(false);

  const [formVenda, setFormVenda] = useState<FormVenda>(initialVenda);
  const [recibos, setRecibos] = useState<FormRecibo[]>([]);
  const [reciboEmEdicao, setReciboEmEdicao] = useState<number | null>(null);
  const [recibosExpandidos, setRecibosExpandidos] = useState<Record<number, boolean>>({});
  const [pagamentos, setPagamentos] = useState<PagamentoVenda[]>([]);
  const [pagamentosExpandidos, setPagamentosExpandidos] = useState<Record<number, boolean>>({});

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
  const resolveTipoPacoteSelectValue = (valor?: string | null) => {
    const key = normalizeTipoPacoteRuleKey(valor || "");
    if (!key) return valor || "";
    const match = tiposPacote.find(
      (tipo) => normalizeTipoPacoteRuleKey(tipo.nome) === key
    );
    return match?.nome || valor || "";
  };

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

      const payload = await fetchVendasCadastroBase({
        cacheIdentity: userId || "anon",
      });
      const user = payload.user;
      setCurrentUserId(user.id || null);
      setCompanyId(user.company_id || null);
      setUsoIndividual(Boolean(user.uso_individual));
      setCanAssignVendedor(Boolean(user.can_assign_vendedor));
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
      const guessedTimeZone = guessTimeZoneFromCity(cidadeNome);
      if (guessedTimeZone) setAppTimeZone(guessedTimeZone);

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
      setRecibosExpandidos({});

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
      setPagamentosExpandidos({});
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
      setRecibosExpandidos({});
      setPagamentos([]);
      setPagamentosExpandidos({});
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
  }, [loadPerm, podeVer, editId, cidadePrefill, orcamentoId, userId]);

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
          limite: 60,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResultadosCidade((data as CidadeSugestao[]) || []);
          setErroCidade(null);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Erro ao buscar cidades:", err);
        setResultadosCidade([]);
        setErroCidade("Erro ao buscar cidades.");
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
    const telefoneBusca = onlyDigits(buscaCliente);
    return clientes.filter((c) => {
      if (normalizeText(c.nome).includes(t)) return true;
      if (matchesCpfSearch(c.cpf || "", buscaCliente)) return true;
      if (normalizeText(c.email || "").includes(t)) return true;
      if (telefoneBusca) {
        const contato = onlyDigits(c.whatsapp || c.telefone || "");
        if (contato.includes(telefoneBusca)) return true;
      }
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

  function toggleRecibo(index: number) {
    setRecibosExpandidos((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
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

  function togglePagamento(index: number) {
    setPagamentosExpandidos((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
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
    setPagamentosExpandidos((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const current = Number(key);
        if (current < index) next[current] = value;
        if (current > index) next[current - 1] = value;
      });
      return next;
    });
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
    setRecibosExpandidos((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const current = Number(key);
        if (current < index) next[current] = value;
        if (current > index) next[current - 1] = value;
      });
      return next;
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
      data_lancamento: toISODateLocal(new Date()),
      data_venda: toISODateLocal(new Date()),
    });
    setRecibos([]);
    setRecibosExpandidos({});
    setPagamentos([]);
    setPagamentosExpandidos({});
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
      if (canAssignVendedor && !formVenda.vendedor_id) {
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

      bumpVendasCacheVersion();
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
      <AppPrimerProvider>
        <div className="page-content-wrap">
          <AppCard tone="config">
            <strong>Acesso negado ao módulo de Vendas.</strong>
          </AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  if (!podeCriar && !isAdmin) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap">
          <AppCard tone="config">
            <strong>Você não possui permissão para cadastrar vendas.</strong>
          </AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  // =======================================================
  // FORM
  // =======================================================
  return (
    <AppPrimerProvider>
      <div className="page-content-wrap">
        <AppCard
          className="mb-3"
          title={editId ? "Editar venda" : "Cadastro de venda"}
          subtitle={
            editId
              ? "Modo edicao: altere cliente, cidade de destino, embarque e recibos sem mudar a logica operacional."
              : "Registre a venda completa no CRM, organize recibos e mantenha o fluxo comercial padronizado."
          }
          tone="info"
        />

        {erro && (
          <AlertMessage variant="error" className="mb-3">
            <strong>{erro}</strong>
          </AlertMessage>
        )}

        <form onSubmit={salvarVenda}>
          <AppCard
            title="Dados da venda"
            subtitle="Informe cliente, destino e datas da operacao comercial."
            tone="config"
            className="mb-3 vendas-cadastro-dados-card"
          >
            {canAssignVendedor && (
              <div className="vtur-form-grid vtur-form-grid-2" style={{ marginBottom: 16 }}>
                <AppField
                  as="select"
                  label="Vendedor *"
                  wrapperClassName="min-w-0"
                  value={formVenda.vendedor_id}
                  onChange={(e) =>
                    setFormVenda((prev) => ({ ...prev, vendedor_id: e.target.value }))
                  }
                  required
                  options={vendedoresEquipe.map((v) => ({
                    value: v.id,
                    label: v.nome_completo || "Vendedor",
                  }))}
                />
              </div>
            )}

            <div className="vtur-form-grid vtur-form-grid-2">
              <div className="form-group min-w-0 vtur-city-picker">
                <AppField
                  label="Cliente *"
                  wrapperClassName="min-w-0"
                  placeholder="Buscar cliente por nome, CPF/CNPJ, telefone ou e-mail..."
                  autoComplete="off"
                  value={buscaCliente || clienteSelecionado?.nome || ""}
                  onChange={(e) => handleClienteInputChange(e.target.value)}
                  onFocus={() => setMostrarSugestoesCliente(true)}
                  caption={
                    clienteSelecionado
                      ? `Selecionado: ${buildClienteInfoResumo(clienteSelecionado)}`
                      : "Selecione o cliente pela lista de sugestões para garantir o vínculo correto."
                  }
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
                  <div className="vtur-city-dropdown vtur-city-dropdown-inline vtur-quote-client-dropdown vtur-vendas-client-dropdown" style={{ maxHeight: 300 }}>
                    {clientesFiltrados.length === 0 ? (
                      <div className="vtur-city-helper">Nenhum cliente encontrado.</div>
                    ) : (
                      clientesFiltrados.map((c) => (
                        <AppButton
                          key={c.id}
                          type="button"
                          variant="ghost"
                          block
                          className="vtur-city-option"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormVenda((prev) => ({ ...prev, cliente_id: c.id }));
                            setBuscaCliente("");
                            setMostrarSugestoesCliente(false);
                          }}
                        >
                          <span className="vtur-choice-button-content">
                            <span className="vtur-choice-button-title">{c.nome}</span>
                            <span className="vtur-choice-button-caption">
                              CPF/CNPJ: {formatDocumentoCliente(c.cpf)}
                            </span>
                            {(c.whatsapp || c.telefone || c.email) ? (
                              <span className="vtur-choice-button-caption vtur-vendas-client-option-meta">
                                {c.whatsapp || c.telefone ? `Contato: ${c.whatsapp || c.telefone}` : ""}
                                {c.whatsapp || c.telefone ? (c.email ? " • " : "") : ""}
                                {c.email ? `E-mail: ${c.email}` : ""}
                              </span>
                            ) : (
                              <span className="vtur-choice-button-caption vtur-vendas-client-option-meta">
                                Sem contato complementar cadastrado.
                              </span>
                            )}
                          </span>
                        </AppButton>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="form-group min-w-0 vtur-city-picker">
                <AppField
                  label="Cidade de Destino *"
                  wrapperClassName="min-w-0"
                  placeholder="Digite o nome da cidade"
                  value={buscaDestino}
                  onChange={(e) => handleCidadeDestino(e.target.value)}
                  onFocus={() => setMostrarSugestoesCidade(true)}
                  onBlur={() => setTimeout(() => setMostrarSugestoesCidade(false), 150)}
                  required={cidadeObrigatoria}
                />
                {mostrarSugestoesCidade && (buscandoCidade || buscaDestino.trim().length >= 2) && (
                  <div className="vtur-city-dropdown" style={{ maxHeight: 220 }}>
                    {buscandoCidade && (
                      <div className="vtur-city-helper">Buscando cidades...</div>
                    )}
                    {!buscandoCidade && erroCidade && (
                      <div className="vtur-city-helper error">{erroCidade}</div>
                    )}
                    {!buscandoCidade && !erroCidade && resultadosCidade.length === 0 && (
                      <div className="vtur-city-helper">Nenhuma cidade encontrada.</div>
                    )}
                    {!buscandoCidade && !erroCidade && resultadosCidade.map((c) => {
                      const label = c.subdivisao_nome ? `${c.nome} (${c.subdivisao_nome})` : c.nome;
                      return (
                        <AppButton
                          key={c.id}
                          type="button"
                          variant="ghost"
                          block
                          className="vtur-city-option"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setFormVenda((prev) => ({ ...prev, destino_id: c.id }));
                            setBuscaDestino(label);
                            setBuscaCidadeSelecionada(label);
                            const guessedTimeZone = guessTimeZoneFromCity(c.nome);
                            if (guessedTimeZone) setAppTimeZone(guessedTimeZone);
                            setMostrarSugestoesCidade(false);
                            setResultadosCidade([]);
                          }}
                        >
                          <span className="vtur-choice-button-content">
                            <span className="vtur-choice-button-title">{label}</span>
                            {c.pais_nome ? (
                              <span className="vtur-choice-button-caption">{c.pais_nome}</span>
                            ) : null}
                          </span>
                        </AppButton>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="vtur-form-grid vtur-form-grid-4" style={{ marginTop: 16 }}>
              <AppField
                label="Lançada em"
                wrapperClassName="form-group min-w-0 vtur-sales-mobile-wide-field"
                type="date"
                value={formVenda.data_lancamento}
                max={toISODateLocal(new Date())}
                onFocus={selectAllInputOnFocus}
                onChange={(e) =>
                  setFormVenda((prev) => ({ ...prev, data_lancamento: e.target.value }))
                }
              />

              <AppField
                label={
                  <>
                    Data da venda *{" "}
                    <span
                      title="Informe a data da venda conforme no Systur, usada para emissao de NF."
                      style={{ color: "#0ea5e9", cursor: "help" }}
                    >
                      ?
                    </span>
                  </>
                }
                wrapperClassName="form-group min-w-0 vtur-sales-mobile-wide-field"
                type="date"
                value={formVenda.data_venda}
                max={toISODateLocal(new Date())}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => setFormVenda((prev) => ({ ...prev, data_venda: e.target.value }))}
                required
              />

              <AppField
                label="Data de embarque"
                wrapperClassName="form-group min-w-0 vtur-sales-mobile-wide-field"
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

              <AppField
                label="Data final"
                wrapperClassName="form-group min-w-0 vtur-sales-mobile-wide-field"
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
          </AppCard>

          <AppCard
            title="Condicoes comerciais"
            subtitle="Configure o desconto comercial da venda quando houver negociacao aprovada."
            tone="info"
            className="mb-3"
          >
            <div className="vtur-form-grid vtur-form-grid-2">
              <div className="vtur-sales-discount-mobile-row">
                <AppField
                  as="select"
                  label="Aplicar desconto comercial?"
                  value={formVenda.desconto_comercial_aplicado ? "sim" : "nao"}
                  onChange={(e) =>
                    setFormVenda((prev) => ({
                      ...prev,
                      desconto_comercial_aplicado: e.target.value === "sim",
                      desconto_comercial_valor:
                        e.target.value === "sim" ? prev.desconto_comercial_valor : "",
                    }))
                  }
                  options={[
                    { value: "nao", label: "Nao" },
                    { value: "sim", label: "Sim" },
                  ]}
                />
              </div>
              {formVenda.desconto_comercial_aplicado && (
                <AppField
                  label="Valor do desconto"
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
              )}
            </div>
          </AppCard>

          <AppCard
            title="Recibos da venda"
            subtitle="Monte os itens da venda, pagamentos e comprovantes dentro do fluxo principal do CRM."
            tone="info"
            className="mb-3"
            actions={
              <AppButton
                type="button"
                variant="secondary"
                className="vtur-calculator-trigger vtur-sales-recibos-calculator"
                onClick={() => setShowCalculator(true)}
                aria-label="Calculadora"
                title="Calculadora"
                icon="pi pi-calculator"
              />
            }
          />

          {recibos.map((r, i) => {
            const produtoSelecionado = produtos.find((p) => p.id === r.produto_id);
            const nomeProdutoAtual = produtoSelecionado?.nome || "";
            const produtosFiltrados = filtrarProdutos(buscaProduto, r.tipo_produto_id);
            const existeProdutoGlobal = existeProdutoGlobalParaTipo(r.tipo_produto_id);
            const reciboAberto = Boolean(recibosExpandidos[i]);
            const produtoDesabilitado =
              !r.tipo_produto_id || (!formVenda.destino_id && !existeProdutoGlobal);
            const placeholderProduto = !r.tipo_produto_id
              ? "Selecione o tipo de produto primeiro..."
              : existeProdutoGlobal
                ? "Escolha uma cidade ou selecione um produto global..."
                : "Selecione uma cidade primeiro e busque o produto...";
            return (
              <AppCard
                key={i}
                title={`Recibo ${i + 1}`}
                subtitle={
                  r.principal
                    ? "Este recibo define o produto principal usado nos relatorios."
                    : "Configure produto, datas e composicao financeira deste recibo."
                }
                className="vtur-sales-embedded-card"
                actions={
                  <div className="vtur-card-toolbar-actions">
                    <AppButton
                      type="button"
                      variant="ghost"
                      className="icon-action-btn no-border"
                      onClick={() => toggleRecibo(i)}
                      aria-label={reciboAberto ? "Recolher recibo" : "Expandir recibo"}
                      title={reciboAberto ? "Recolher recibo" : "Expandir recibo"}
                      icon={reciboAberto ? "pi pi-chevron-up" : "pi pi-chevron-down"}
                    />
                    <AppButton
                      type="button"
                      variant="danger"
                      className="icon-action-btn danger no-border"
                      onClick={() => removerRecibo(i)}
                      aria-label="Remover recibo"
                      title="Remover recibo"
                    >
                      <i className="pi pi-trash" aria-hidden="true" />
                    </AppButton>
                  </div>
                }
              >
                {reciboAberto ? (
                <>
                <div className="vtur-form-grid vtur-form-grid-4">
                  <AppField
                    as="select"
                    label="Tipo de Produto *"
                    value={r.tipo_produto_id}
                    onChange={(e) => handleTipoReciboChange(i, e.target.value)}
                    required
                    disabled={tipos.length === 0}
                    options={[
                      { value: "", label: "Selecione" },
                      ...tipos.map((t) => ({
                        value: t.id,
                        label: t.nome || t.tipo || "Tipo",
                      })),
                    ]}
                  />

                  <div className="form-group min-w-0">
                    <AppField
                      label="Produto *"
                      className="search-input-field w-full"
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
                    <div className="vtur-sales-principal-toggle">
                      <label className="vtur-sales-principal-label">
                        <input
                          type="radio"
                          name="recibo-principal"
                          checked={r.principal}
                          onChange={() => marcarReciboPrincipal(i)}
                          className="form-radio h-4 w-4 text-sky-600"
                        />
                        <span>Produto principal</span>
                      </label>
                      <span className="vtur-sales-note">
                        Define o produto principal usado nos relatorios.
                      </span>
                    </div>
                  </div>

                  <AppField
                    label="Numero recibo *"
                    value={r.numero_recibo}
                    onChange={(e) => updateRecibo(i, "numero_recibo", e.target.value)}
                    required
                  />

                  <AppField
                    label="Reserva"
                    value={r.numero_reserva || ""}
                    onChange={(e) => updateRecibo(i, "numero_reserva", e.target.value)}
                  />

                  <div className="form-group min-w-0">
                    <label className="form-label">Tipo de Pacote</label>
                    <select
                      className="form-select"
                      value={resolveTipoPacoteSelectValue(r.tipo_pacote)}
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
                          (tipo) =>
                            normalizeTipoPacoteRuleKey(tipo.nome) ===
                            normalizeTipoPacoteRuleKey(r.tipo_pacote || "")
                        ) && (
                          <option value={r.tipo_pacote}>{`${r.tipo_pacote} (nao cadastrado)`}</option>
                        )}
                    </select>
                    {tiposPacote.length === 0 && (
                      <AppField
                        wrapperClassName="mt-2"
                        label="Tipo de Pacote (manual)"
                        value={r.tipo_pacote || ""}
                        onChange={(e) => updateRecibo(i, "tipo_pacote", e.target.value)}
                        placeholder="Ex: Somente Hotel"
                      />
                    )}
                  </div>

                  <AppField
                    label="Data Início *"
                    type="date"
                    value={r.data_inicio}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updateRecibo(i, "data_inicio", e.target.value)}
                    required
                  />

                  <AppField
                    label="Data Final *"
                    type="date"
                    value={r.data_fim}
                    min={r.data_inicio || undefined}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updateRecibo(i, "data_fim", e.target.value)}
                    required
                  />

                  <AppField
                    label="Valor total *"
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

                  <AppField
                    label="Taxas"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9,.]*"
                    placeholder="0,00"
                    value={r.valor_taxas}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updateReciboMonetario(i, "valor_taxas", e.target.value)}
                    onBlur={() => updateRecibo(i, "valor_taxas", normalizeMoneyInput(r.valor_taxas))}
                  />

                  <AppField
                    label="DU"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9,.]*"
                    placeholder="0,00"
                    value={r.valor_du}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updateReciboMonetario(i, "valor_du", e.target.value)}
                    onBlur={() => updateRecibo(i, "valor_du", normalizeMoneyInput(r.valor_du))}
                  />

                  <AppField
                    label="RAV"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9,.]*"
                    placeholder="0,00"
                    value={r.valor_rav}
                    caption={
                      hasRavValue(r.valor_rav)
                        ? "Total deve incluir o RAV. O sistema desconta o RAV no calculo de meta/comissao."
                        : "Se houver RAV, informe o valor total somado ao RAV."
                    }
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updateReciboMonetario(i, "valor_rav", e.target.value)}
                    onBlur={() => updateRecibo(i, "valor_rav", normalizeMoneyInput(r.valor_rav))}
                  />
                </div>

                <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                  <FileUploadField
                    wrapperClassName="form-group min-w-0"
                    label="Contrato (PDF)"
                    accept="application/pdf"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0] || null;
                      setRecibos((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], contrato_file: file, contrato_url: next[i].contrato_url };
                        return next;
                      });
                    }}
                    fileName={r.contrato_file?.name || "Nenhum arquivo escolhido"}
                  />
                  {r.contrato_url && (
                    <div className="vtur-sales-contract-link">
                      <a className="link" href={r.contrato_url} target="_blank" rel="noreferrer">
                        Ver contrato anexado
                      </a>
                    </div>
                  )}
                </div>
                </>
                ) : (
                  <div className="vtur-sales-empty-state">Recibo recolhido. Clique na seta para abrir.</div>
                )}
              </AppCard>
            );
          })}

          {/* PAGAMENTOS */}
          <div className="vtur-sales-section-heading">
            <h4>Formas de Pagamento</h4>
            <p>Distribua valores, descontos e parcelas por meio de pagamento.</p>
          </div>

          {pagamentos.map((p, idx) => {
            const formaSelecionada = formasPagamento.find((f) => f.id === p.forma_id);
            const pagamentoAberto = Boolean(pagamentosExpandidos[idx]);
            return (
              <AppCard
                key={`pag-${idx}`}
                title={`Pagamento ${idx + 1}`}
                subtitle="Defina a forma, os valores e a distribuicao em parcelas."
                className="vtur-sales-embedded-card"
                actions={
                  <div className="vtur-card-toolbar-actions">
                    <AppButton
                      type="button"
                      variant="ghost"
                      className="icon-action-btn no-border"
                      onClick={() => togglePagamento(idx)}
                      aria-label={pagamentoAberto ? "Recolher pagamento" : "Expandir pagamento"}
                      title={pagamentoAberto ? "Recolher pagamento" : "Expandir pagamento"}
                      icon={pagamentoAberto ? "pi pi-chevron-up" : "pi pi-chevron-down"}
                    />
                    <AppButton
                      type="button"
                      variant="danger"
                      className="icon-action-btn danger no-border"
                      onClick={() => removerPagamento(idx)}
                      aria-label="Remover pagamento"
                      title="Remover pagamento"
                    >
                      <i className="pi pi-trash" aria-hidden="true" />
                    </AppButton>
                  </div>
                }
              >
                {pagamentoAberto ? (
                <>
                <div className="vtur-form-grid vtur-form-grid-4">
                  <AppField
                    as="select"
                    label="Forma *"
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
                    caption={
                      formaSelecionada
                        ? `Comissao: ${formaSelecionada.paga_comissao ? "Sim" : "Nao"}`
                        : undefined
                    }
                    options={[
                      { value: "", label: "Selecione" },
                      ...formasPagamento.map((f) => ({ value: f.id, label: f.nome })),
                    ]}
                  />

                  {!p.forma_id && (
                    <AppField
                      label="Nome da forma"
                      value={p.forma_nome}
                      onChange={(e) => updatePagamento(idx, "forma_nome", e.target.value)}
                    />
                  )}

                  <AppField
                    label="Operacao"
                    value={p.operacao}
                    onChange={(e) => updatePagamento(idx, "operacao", e.target.value)}
                  />

                  <AppField
                    label="Plano"
                    value={p.plano}
                    onChange={(e) => updatePagamento(idx, "plano", e.target.value)}
                  />

                  <AppField
                    label="Valor"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={p.valor_bruto}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updatePagamentoMonetario(idx, "valor_bruto", e.target.value)}
                    onBlur={() => updatePagamento(idx, "valor_bruto", normalizeMoneyInput(p.valor_bruto))}
                  />

                  <AppField
                    label="Desconto"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={p.desconto_valor}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updatePagamentoMonetario(idx, "desconto_valor", e.target.value)}
                    onBlur={() => updatePagamento(idx, "desconto_valor", normalizeMoneyInput(p.desconto_valor))}
                  />

                  <AppField
                    label="Total"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={p.valor_total}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => updatePagamentoMonetario(idx, "valor_total", e.target.value)}
                    onBlur={() => updatePagamento(idx, "valor_total", normalizeMoneyInput(p.valor_total))}
                  />
                </div>

                <div className="vtur-sales-parcelas-head">
                  <div>
                    <strong>Parcelas</strong>
                    <p>Organize vencimento e valor por parcela.</p>
                  </div>
                  <AppButton
                    type="button"
                    variant="secondary"
                    className="icon-action-btn"
                    onClick={() => addParcelaPagamento(idx)}
                    aria-label="Adicionar parcela"
                    title="Adicionar parcela"
                  >
                    <i className="pi pi-plus" aria-hidden="true" />
                  </AppButton>
                </div>
                {(p.parcelas || []).length === 0 ? (
                  <div className="vtur-sales-empty-state">Nenhuma parcela informada.</div>
                ) : (
                  <div className="vtur-sales-parcelas-list">
                    {p.parcelas.map((parcela, parcelaIdx) => (
                      <div key={`parcela-${idx}-${parcelaIdx}`} className="vtur-sales-parcela-item">
                        <div className="vtur-form-grid vtur-form-grid-4">
                          <AppField
                            label="Parcela"
                            value={parcela.numero}
                            onChange={(e) =>
                              updateParcelaPagamento(idx, parcelaIdx, "numero", e.target.value)
                            }
                          />
                          <AppField
                            label="Valor"
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
                          <AppField
                            label="Vencimento"
                            type="date"
                            value={parcela.vencimento}
                            onFocus={selectAllInputOnFocus}
                            onChange={(e) =>
                              updateParcelaPagamento(idx, parcelaIdx, "vencimento", e.target.value)
                            }
                          />
                          <div className="vtur-sales-parcela-action">
                            <AppButton
                              type="button"
                              variant="danger"
                              className="icon-action-btn danger no-border"
                              onClick={() => removerParcelaPagamento(idx, parcelaIdx)}
                              title="Remover parcela"
                              aria-label="Remover parcela"
                            >
                              <i className="pi pi-trash" aria-hidden="true" />
                            </AppButton>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </>
                ) : (
                  <div className="vtur-sales-empty-state">Pagamento recolhido. Clique na seta para abrir.</div>
                )}
              </AppCard>
            );
          })}

          <div className="vtur-form-actions">
            <AppButton type="button" variant="secondary" onClick={addPagamento}>
              Adicionar pagamento
            </AppButton>
            <AppButton type="button" variant="secondary" onClick={addRecibo}>
              Adicionar recibo
            </AppButton>
            <AppButton type="submit" variant="primary" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar venda"}
            </AppButton>
            <AppButton type="button" variant="secondary" onClick={cancelarCadastro}>
              Cancelar
            </AppButton>
          </div>
        </form>
      <AppNoticeDialog
        open={Boolean(duplicadoModal)}
        title="ATENCAO!"
        message={duplicadoModal?.mensagem}
        icon={<i className="pi pi-exclamation-triangle" aria-hidden="true" />}
        onClose={() => setDuplicadoModal(null)}
      />
      <AppNoticeDialog
        open={Boolean(tipoPacoteModal)}
        title="ATENCAO!"
        message={tipoPacoteModal?.mensagem}
        icon={<i className="pi pi-exclamation-triangle" aria-hidden="true" />}
        onClose={() => setTipoPacoteModal(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <CalculatorModal
        open={showCalculator}
        onClose={() => setShowCalculator(false)}
      />
    </div>
  </AppPrimerProvider>
  );
}
