import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
import { useCrudResource } from "../../lib/useCrudResource";
import { formatDateBR } from "../../lib/format";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import { ToastStack, useToastQueue } from "../ui/Toast";
import PaginationControls from "../ui/PaginationControls";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

function dedupeSugestoes(valores: string[]) {
  const vistos = new Set<string>();
  const lista: string[] = [];
  valores.forEach((valor) => {
    const nome = (valor || "").trim();
    if (!nome) return;
    const chave = normalizeText(nome);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    lista.push(nome);
  });
  return lista;
}

type Pais = { id: string; nome: string };
type Subdivisao = { id: string; nome: string; pais_id: string };
type Cidade = { id: string; nome: string; subdivisao_id: string };
type TipoProduto = { id: string; nome: string | null; tipo: string };

type CidadeBusca = {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  populacao: number | null;
  subdivisao_nome: string | null;
  pais_nome: string | null;
  subdivisao_id?: string | null;
};

async function fetchProdutosBase(params: {
  page: number;
  pageSize: number;
  all?: boolean;
  noCache?: boolean;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.all) qs.set("all", "1");
  if (params.noCache) qs.set("no_cache", "1");
  const resp = await fetch(`/api/v1/produtos/base?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json() as Promise<{
    paises: Pais[];
    subdivisoes: Subdivisao[];
    tipos: TipoProduto[];
    produtos: Produto[];
    total: number;
    destinosProdutos: { destino?: string | null; atracao_principal?: string | null; melhor_epoca?: string | null }[];
    cidades: Cidade[];
    fornecedores: FornecedorOption[];
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
  const resp = await fetch(`/api/v1/relatorios/cidades-busca?${qs.toString()}`,
    { signal: params.signal }
  );
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  const payload = await resp.json();
  return Array.isArray(payload) ? payload : [];
}

const nivelPrecosOptions = [
  { value: "Economico", label: "Econômico" },
  { value: "Intermediario", label: "Intermediário" },
  { value: "Variavel", label: "Variável" },
  { value: "Premium", label: "Premium" },
  { value: "Super Premium", label: "Super Premium" },
];

const HOSPITALITY_KEYWORDS = new Set(["hotel", "pousada", "resort", "flat"]);

function nivelPrecoLabel(value?: string | null) {
  if (!value) return "";
  const normalizedValue = normalizeText(value);
  const match = nivelPrecosOptions.find(
    (nivel) =>
      normalizeText(nivel.value) === normalizedValue ||
      normalizeText(nivel.label) === normalizedValue
  );
  return match ? match.label : value;
}

function ehTipoHospedagem(tipo?: TipoProduto | null) {
  if (!tipo) return false;
  const identificado = normalizeText(tipo.nome || tipo.tipo || "");
  return HOSPITALITY_KEYWORDS.has(identificado);
}

function gerarIdTemporario() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type Produto = {
  id: string;
  nome: string;
  destino: string | null;
  cidade_id: string | null;
  tipo_produto: string | null;
  informacoes_importantes: string | null;
  atracao_principal: string | null;
  melhor_epoca: string | null;
  duracao_sugerida: string | null;
  nivel_preco: string | null;
  imagem_url: string | null;
  ativo: boolean | null;
  fornecedor_id?: string | null;
  created_at: string | null;
  todas_as_cidades: boolean;
  valor_neto?: number | null;
  margem?: number | null;
  valor_venda?: number | null;
  moeda?: string | null;
  cambio?: number | null;
  valor_em_reais?: number | null;
};

type FornecedorOption = { id: string; nome_completo: string | null; nome_fantasia: string | null };

function formatFornecedorLabel(fornecedor: FornecedorOption | null | undefined) {
  if (!fornecedor) return "";
  return (fornecedor.nome_fantasia?.trim() || fornecedor.nome_completo?.trim() || "").trim();
}

type FormState = {
  nome: string;
  destino: string;
  cidade_id: string;
  tipo_produto: string;
  atracao_principal: string;
  melhor_epoca: string;
  duracao_sugerida: string;
  nivel_preco: string;
  imagem_url: string;
  informacoes_importantes: string;
  ativo: boolean;
  fornecedor_id: string;
  fornecedor_label: string;
  todas_as_cidades: boolean;
};


type TarifaEntry = {
  id: string;
  acomodacao: string;
  qte_pax: number;
  tipo: string;
  validade_de: string;
  validade_ate: string;
  valor_neto: number;
  padrao: "Manual" | "Padrao";
  margem: number | null;
  valor_venda: number;
  valor_em_reais: number;
  moeda: string;
  cambio: number;
};
const initialForm: FormState = {
  nome: "",
  destino: "",
  cidade_id: "",
  tipo_produto: "",
  atracao_principal: "",
  melhor_epoca: "",
  duracao_sugerida: "",
  nivel_preco: "",
  imagem_url: "",
  informacoes_importantes: "",
  ativo: true,
  fornecedor_id: "",
  fornecedor_label: "",
  todas_as_cidades: false,
};

export default function ProdutosIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Produtos");
  const podeCriar = can("Produtos", "create");
  const podeEditar = can("Produtos", "edit");
  const podeExcluir = can("Produtos", "delete");
  const modoSomenteLeitura = !podeCriar && !podeEditar;
  const { create: criarProduto, update: atualizarProduto, remove: removerProduto } =
    useCrudResource<Produto>({
      table: "produtos",
    });

  const [paises, setPaises] = useState<Pais[]>([]);
  const [subdivisoes, setSubdivisoes] = useState<Subdivisao[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [tipos, setTipos] = useState<TipoProduto[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [destinosCadastro, setDestinosCadastro] = useState<string[]>([]);
  const [atracoesCadastro, setAtracoesCadastro] = useState<string[]>([]);
  const [melhoresEpocasCadastro, setMelhoresEpocasCadastro] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [busca, setBusca] = useState("");
  const [cidadeBusca, setCidadeBusca] = useState("");
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [resultadosCidade, setResultadosCidade] = useState<CidadeBusca[]>([]);
  const [buscandoCidade, setBuscandoCidade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<Produto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCidadeBusca, setErroCidadeBusca] = useState<string | null>(null);
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [fornecedoresLista, setFornecedoresLista] = useState<FornecedorOption[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [modoGlobal, setModoGlobal] = useState<boolean | null>(null);
  const [tarifas, setTarifas] = useState<TarifaEntry[]>([]);
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalProdutosDb, setTotalProdutosDb] = useState(0);

  async function carregarDados(todos = false, pageOverride?: number) {
    setLoading(true);
    setErro(null);

    try {
      const paginaAtual = Math.max(1, pageOverride ?? page);
      const tamanhoPagina = Math.max(1, pageSize);
      const payload = await fetchProdutosBase({
        page: paginaAtual,
        pageSize: tamanhoPagina,
        all: todos,
      });

      setPaises(payload.paises || []);
      setSubdivisoes(payload.subdivisoes || []);
      setTipos(payload.tipos || []);
      setProdutos(payload.produtos || []);
      setCarregouTodos(todos);
      setTotalProdutosDb(payload.total || (payload.produtos || []).length);
      setCidades(payload.cidades || []);
      setFornecedoresLista(payload.fornecedores || []);

      const destinosNomes: string[] = [];
      const atracoesNomes: string[] = [];
      const melhoresEpocasNomes: string[] = [];
      (payload.destinosProdutos || []).forEach((destino) => {
        const nome = (destino?.destino || "").trim();
        if (nome) destinosNomes.push(nome);
        const atracao = (destino?.atracao_principal || "").trim();
        if (atracao) atracoesNomes.push(atracao);
        const melhorEpoca = (destino?.melhor_epoca || "").trim();
        if (melhorEpoca) melhoresEpocasNomes.push(melhorEpoca);
      });
      setDestinosCadastro(destinosNomes);
      setAtracoesCadastro(atracoesNomes);
      setMelhoresEpocasCadastro(melhoresEpocasNomes);
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar produtos. Verifique permissões ou RLS.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loadingPerm || !podeVer) return;
    const buscaAtiva = busca.trim();
    if (buscaAtiva) {
      if (!carregouTodos) {
        carregarDados(true);
      }
      return;
    }
    carregarDados(false, page);
  }, [loadingPerm, podeVer, busca, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [busca]);

  const subdivisaoMap = useMemo(() => new Map(subdivisoes.map((s) => [s.id, s])), [subdivisoes]);

  function formatarCidadeNome(cidadeId?: string | null) {
    if (!cidadeId) return "";
    const cidade = cidades.find((c) => c.id === cidadeId);
    if (!cidade) return "";
    const subdivisao = subdivisaoMap.get(cidade.subdivisao_id);
    return subdivisao ? `${cidade.nome} (${subdivisao.nome})` : cidade.nome;
  }

  function tipoLabel(t?: TipoProduto | null) {
    if (!t) return "";
    return (t.nome || "").trim() || t.tipo || "";
  }

  const produtosEnriquecidos = useMemo(() => {
    const cidadeMap = new Map(cidades.map((c) => [c.id, c]));
    const paisMap = new Map(paises.map((p) => [p.id, p]));
    const tipoMap = new Map(tipos.map((t) => [t.id, t]));

    return produtos.map((p) => {
      const cidade = p.todas_as_cidades ? null : cidadeMap.get(p.cidade_id || "");
      const subdivisao =
        cidade ? subdivisaoMap.get(cidade.subdivisao_id) || (cidade as any).subdivisoes : undefined;
      const pais = subdivisao ? paisMap.get(subdivisao.pais_id) : undefined;
      const tipo = p.tipo_produto ? tipoMap.get(p.tipo_produto) : undefined;

      return {
        ...p,
        cidade_nome: p.todas_as_cidades ? "Todas as cidades" : cidade?.nome || "",
        subdivisao_nome: subdivisao?.nome || "",
        pais_nome: pais?.nome || "",
        tipo_nome: tipoLabel(tipo),
      };
    });
  }, [produtos, cidades, subdivisoes, paises, tipos]);

  const produtosFiltrados = useMemo(() => {
    if (!busca.trim()) return produtosEnriquecidos;
    const termo = normalizeText(busca);
    return produtosEnriquecidos.filter(
      (p) =>
        normalizeText(p.nome).includes(termo) ||
        normalizeText(p.cidade_nome).includes(termo) ||
        normalizeText(p.subdivisao_nome).includes(termo) ||
        normalizeText(p.pais_nome).includes(termo) ||
        normalizeText(p.tipo_nome).includes(termo) ||
        normalizeText(p.destino || "").includes(termo)
    );
  }, [busca, produtosEnriquecidos]);

  const usaPaginacaoServidor = !busca.trim() && !carregouTodos;
  const totalProdutos = usaPaginacaoServidor ? totalProdutosDb : produtosFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalProdutos / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPaginas);
  const produtosExibidos = useMemo(() => {
    if (usaPaginacaoServidor) return produtosEnriquecidos;
    const inicio = (paginaAtual - 1) * pageSize;
    return produtosFiltrados.slice(inicio, inicio + pageSize);
  }, [usaPaginacaoServidor, produtosEnriquecidos, produtosFiltrados, paginaAtual, pageSize]);

  useEffect(() => {
    if (page > totalPaginas) {
      setPage(totalPaginas);
    }
  }, [page, totalPaginas]);

  const destinosSugestoes = useMemo(() => dedupeSugestoes(destinosCadastro), [destinosCadastro]);
  const atracoesSugestoes = useMemo(() => dedupeSugestoes(atracoesCadastro), [atracoesCadastro]);
  const melhoresEpocasSugestoes = useMemo(
    () => dedupeSugestoes(melhoresEpocasCadastro),
    [melhoresEpocasCadastro]
  );

  const tipoSelecionado = useMemo(
    () => (form.tipo_produto ? tipos.find((t) => t.id === form.tipo_produto) || null : null),
    [form.tipo_produto, tipos]
  );
  const isHospedagem = ehTipoHospedagem(tipoSelecionado);

  const estaEditando = Boolean(editandoId);
  const formLayout = estaEditando
    ? "full"
    : modoGlobal === null
    ? "selection"
    : modoGlobal
    ? "global"
    : "full";
  const isGlobalMode = formLayout === "global";

  const handleChange = useCallback(
    <K extends keyof FormState>(campo: K, valor: FormState[K]) => {
      setForm((prev) => ({ ...prev, [campo]: valor }));
    },
    []
  );

  function handleCidadeBusca(valor: string) {
    if (form.todas_as_cidades) return;
    setCidadeBusca(valor);
    const cidadeAtual = cidades.find((c) => c.id === form.cidade_id);
    if (!cidadeAtual || !normalizeText(cidadeAtual.nome).includes(normalizeText(valor))) {
      setForm((prev) => ({ ...prev, cidade_id: "" }));
    }
    setMostrarSugestoes(true);
  }

  function handleToggleTodasAsCidades(valor: boolean) {
    handleChange("todas_as_cidades", valor);
    if (valor) {
      handleChange("cidade_id", "");
      setCidadeBusca("");
      setMostrarSugestoes(false);
      setResultadosCidade([]);
    }
  }

  function selecionarAbrangencia(valor: boolean) {
    setModoGlobal(valor);
    handleToggleTodasAsCidades(valor);
    if (valor) {
      handleChange("destino", titleCaseWithExceptions("Global"));
    } else {
      handleChange("destino", "");
    }
  }

  function handleFornecedorInput(valor: string) {
    handleChange("fornecedor_label", valor);
    const termo = valor.trim().toLowerCase();
    if (!termo) {
      handleChange("fornecedor_id", "");
      return;
    }
    const match = fornecedoresLista.find(
      (f) => formatFornecedorLabel(f).toLowerCase() === termo
    );
    handleChange("fornecedor_id", match ? match.id : "");
  }

  async function carregarTarifasProduto(produtoId: string, moedaPadrao: string, cambioPadrao: number) {
    if (!produtoId) return;
    try {
      const params = new URLSearchParams({ produto_id: produtoId });
      const resp = await fetch(`/api/v1/produtos/tarifas?${params.toString()}`);
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const json = (await resp.json()) as { items?: any[] };
      const formatos = (json.items || []).map((tarifa) => ({
        id: tarifa.id,
        acomodacao: tarifa.acomodacao,
        qte_pax: tarifa.qte_pax ?? 0,
        tipo: tarifa.tipo || "",
        validade_de: tarifa.validade_de ? String(tarifa.validade_de).slice(0, 10) : "",
        validade_ate: tarifa.validade_ate ? String(tarifa.validade_ate).slice(0, 10) : "",
        valor_neto: tarifa.valor_neto ?? 0,
        padrao: tarifa.padrao === "Manual" ? "Manual" : "Padrao",
        margem: tarifa.margem ?? null,
        valor_venda: tarifa.valor_venda ?? 0,
        valor_em_reais: tarifa.valor_em_reais ?? 0,
        moeda: tarifa.moeda || moedaPadrao || "USD",
        cambio: tarifa.cambio ?? cambioPadrao,
      }));
      setTarifas(formatos);
    } catch (error) {
      console.error("Erro ao carregar tarifas do produto:", error);
    }
  }

  async function sincronizarTarifas(produtoId: string) {
    if (!produtoId) return;
    try {
      const payload = {
        produto_id: produtoId,
        tarifas: tarifas.map(({ id, ...rest }) => rest),
      };
      const resp = await fetch("/api/v1/produtos/tarifas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
    } catch (error) {
      console.error("Erro ao sincronizar tarifas:", error);
      throw error;
    }
  }

  function iniciarNovo() {
    setForm(initialForm);
    setEditandoId(null);
    setErro(null);
    setCidadeBusca("");
    setMostrarSugestoes(false);
    setModoGlobal(null);
    setTarifas([]);
    setMostrarInfo(false);
  }

  function iniciarEdicao(produto: Produto & { cidade_nome?: string }) {
    const cidade = cidades.find((c) => c.id === produto.cidade_id);

    setEditandoId(produto.id);
    setForm({
      nome: produto.nome,
      cidade_id: produto.cidade_id,
      tipo_produto: produto.tipo_produto || "",
      atracao_principal: produto.atracao_principal || "",
      melhor_epoca: produto.melhor_epoca || "",
      duracao_sugerida: produto.duracao_sugerida || "",
      nivel_preco: produto.nivel_preco || "",
      imagem_url: produto.imagem_url || "",
      informacoes_importantes: produto.informacoes_importantes || "",
      ativo: produto.ativo ?? true,
      destino: produto.destino || "",
      fornecedor_id: produto.fornecedor_id || "",
      fornecedor_label: formatFornecedorLabel(
        fornecedoresLista.find((f) => f.id === produto.fornecedor_id)
      ),
      todas_as_cidades: produto.todas_as_cidades ?? false,
    });
    setTarifas([]);
    setMostrarInfo(!!produto.informacoes_importantes);
    setCidadeBusca(
      produto.todas_as_cidades ? "" : formatarCidadeNome(produto.cidade_id) || cidade?.nome || ""
    );
    setMostrarSugestoes(false);
    setMostrarFormulario(true);
    carregarTarifasProduto(produto.id, produto.moeda || "USD", produto.cambio ?? 0);
  }

  function abrirFormularioProduto() {
    iniciarNovo();
    setMostrarFormulario(true);
    setErro(null);
  }

  function fecharFormularioProduto() {
    iniciarNovo();
    setMostrarFormulario(false);
  }

  useEffect(() => {
    if (cidadeBusca.trim().length < 2) {
      setResultadosCidade([]);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      setBuscandoCidade(true);
      setErroCidadeBusca(null);
      try {
        const data = await fetchCidadesSugestoes({
          query: cidadeBusca.trim(),
          limite: 10,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResultadosCidade((data as CidadeBusca[]) || []);
          setErroCidadeBusca(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Erro ao buscar cidades:", error);
          setErroCidadeBusca("Erro ao buscar cidades.");
        }
      } finally {
        if (!controller.signal.aborted) setBuscandoCidade(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [cidadeBusca]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();

    if (modoSomenteLeitura) {
      setErro("Voce nao tem permissao para salvar produtos.");
      return;
    }
    if (!form.nome.trim()) {
      setErro("Nome e obrigatorio.");
      return;
    }
    if (!form.destino.trim()) {
      setErro("Destino e obrigatorio.");
      return;
    }
    if (!form.todas_as_cidades && !form.cidade_id) {
      setErro("Cidade e obrigatoria quando o produto nao for global.");
      return;
    }
    if (!form.tipo_produto) {
      setErro("Tipo de produto e obrigatorio.");
      return;
    }

    try {
      const estavaEditando = Boolean(editandoId);
      setSalvando(true);
      setErro(null);

      const erroSupabaseMsg = (err: any) => {
        const msg = err?.message || err?.error?.message || "";
        const det = err?.details || err?.error?.details || "";
        const hint = err?.hint || err?.error?.hint || "";
        return [msg, det, hint].filter(Boolean).join(" | ");
      };

      const nomeNormalizado = titleCaseWithExceptions(form.nome);
      const destinoNormalizado = titleCaseWithExceptions(form.destino);

      const payload = {
        nome: nomeNormalizado,
        destino: destinoNormalizado,
        cidade_id: form.todas_as_cidades ? null : form.cidade_id,
        tipo_produto: form.tipo_produto,
        atracao_principal: form.atracao_principal.trim() || null,
        melhor_epoca: form.melhor_epoca.trim() || null,
        duracao_sugerida: form.duracao_sugerida.trim() || null,
        nivel_preco: form.nivel_preco.trim() || null,
        imagem_url: form.imagem_url.trim() || null,
        informacoes_importantes: form.informacoes_importantes.trim() || null,
        ativo: form.ativo,
        fornecedor_id: form.fornecedor_id || null,
        todas_as_cidades: form.todas_as_cidades,
      };

      let produtoId = editandoId;
      const result = produtoId
        ? await atualizarProduto(produtoId, payload, {
            errorMessage: "Erro ao salvar produto.",
          })
        : await criarProduto(payload, {
            select: "id",
            errorMessage: "Erro ao salvar produto.",
          });

      if (result.error) {
        const msg = erroSupabaseMsg(result.error);
        throw new Error(msg || "Erro ao salvar produto.");
      }

      if (!produtoId) {
        produtoId = (result.data as { id?: string } | null)?.id || null;
        if (!produtoId) {
          throw new Error("Não foi possível identificar o produto salvo.");
        }
      }
      await sincronizarTarifas(produtoId);

      iniciarNovo();
      setMostrarFormulario(false);
      await carregarDados(carregouTodos, page);
      showToast(estavaEditando ? "Produto atualizado." : "Produto cadastrado.", "success");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || e?.error?.message || "";
      setErro(`Erro ao salvar produto.${msg ? ` Detalhes: ${msg}` : ""}`);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir produtos.", "error");
      return;
    }

    try {
      setExcluindoId(id);
      setErro(null);

      const result = await removerProduto(id, {
        errorMessage: "Nao foi possivel excluir o produto.",
      });
      if (result.error) throw result.error;

      await carregarDados(carregouTodos, page);
      showToast("Produto excluido.", "success");
    } catch (e) {
      console.error(e);
      setErro("Nao foi possivel excluir o produto. Verifique vinculos com vendas/orcamentos.");
    } finally {
      setExcluindoId(null);
    }
  }

  function solicitarExclusao(produto: Produto) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir produtos.", "error");
      return;
    }
    setProdutoParaExcluir(produto);
  }

  async function confirmarExclusao() {
    if (!produtoParaExcluir) return;
    await excluir(produtoParaExcluir.id);
    setProdutoParaExcluir(null);
  }

  const resumoLista = busca.trim()
    ? `${produtosFiltrados.length} produto(s) encontrados para a busca atual.`
    : usaPaginacaoServidor
      ? `${totalProdutosDb} produto(s) cadastrados. Exibindo ${produtosExibidos.length} item(ns) na pagina ${paginaAtual}.`
      : `${produtosFiltrados.length} produto(s) cadastrados.`;

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Voce nao possui acesso ao modulo de Cadastros.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="destinos-page produtos-page">
        {!mostrarFormulario && (
          <AppToolbar
            sticky
            tone="config"
            className="mb-3 list-toolbar-sticky"
            title="Produtos"
            subtitle={resumoLista}
            actions={
              !modoSomenteLeitura ? (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={abrirFormularioProduto}
                  disabled={mostrarFormulario}
                >
                  Adicionar produto
                </AppButton>
              ) : null
            }
          >
            <div className="vtur-toolbar-grid">
              <AppField
                label="Buscar produto"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Busque por nome, tipo, destino, cidade, estado/provincia ou pais"
              />
            </div>
          </AppToolbar>
        )}

        {mostrarFormulario && formLayout === "selection" && (
          <AppCard
            className="mb-3"
            tone="info"
            title="Abrangencia do produto"
            subtitle="Escolha se o produto sera cadastrado para uma cidade especifica ou se vale para qualquer cidade."
          >
            <div className="vtur-choice-grid">
              <AppButton type="button" variant="secondary" className="vtur-choice-button" onClick={() => selecionarAbrangencia(false)}>
                <span className="vtur-choice-button-content">
                  <span className="vtur-choice-button-title">Produto por cidade</span>
                  <span className="vtur-choice-button-caption">
                    Abre o formulario completo com cidade vinculada.
                  </span>
                </span>
              </AppButton>
              <AppButton type="button" variant="primary" className="vtur-choice-button" onClick={() => selecionarAbrangencia(true)}>
                <span className="vtur-choice-button-content">
                  <span className="vtur-choice-button-title">Produto global</span>
                  <span className="vtur-choice-button-caption">
                    Disponivel para qualquer cidade e com destino padrao Global.
                  </span>
                </span>
              </AppButton>
            </div>

            <div className="vtur-form-actions mobile-stack-buttons">
              <AppButton type="button" variant="secondary" onClick={fecharFormularioProduto}>
                Cancelar
              </AppButton>
            </div>
          </AppCard>
        )}

        {mostrarFormulario && formLayout !== "selection" && (
          <AppCard
            className="mb-3"
            tone="info"
            title={editandoId ? "Editar produto" : "Novo produto"}
            subtitle="Centralize dados comerciais, destino, cidade, fornecedor e atributos do CRM em um unico cadastro."
          >
            <form onSubmit={salvar}>
              <div className="vtur-form-grid vtur-form-grid-3">
                <AppField
                  as="select"
                  label="Tipo *"
                  value={form.tipo_produto}
                  onChange={(e) => handleChange("tipo_produto", e.target.value)}
                  disabled={modoSomenteLeitura}
                  validation={!form.tipo_produto && erro ? "Tipo de produto e obrigatorio." : undefined}
                  options={[
                    { value: "", label: "Selecione o tipo" },
                    ...tipos.map((tipo) => ({
                      value: tipo.id,
                      label: tipoLabel(tipo) || "(sem nome)",
                    })),
                  ]}
                />

                {!isGlobalMode && (
                  <div className="vtur-city-picker">
                    <AppField
                      label="Cidade *"
                      value={cidadeBusca}
                      onChange={(e) => handleCidadeBusca(e.target.value)}
                      onFocus={() => setMostrarSugestoes(true)}
                      onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                      disabled={modoSomenteLeitura || form.todas_as_cidades}
                      placeholder="Digite o nome da cidade"
                      title="Cidade selecionada pode ajudar a preencher o destino automaticamente."
                      validation={!form.todas_as_cidades && !form.cidade_id && erro ? "Cidade e obrigatoria." : undefined}
                    />

                    {buscandoCidade && <div className="vtur-city-helper">Buscando...</div>}
                    {erroCidadeBusca && !buscandoCidade && <div className="vtur-city-helper error">{erroCidadeBusca}</div>}

                    {mostrarSugestoes && (
                      <div className="vtur-city-dropdown">
                        {resultadosCidade.length === 0 && !buscandoCidade && (
                          <div className="vtur-city-helper">Nenhuma cidade encontrada.</div>
                        )}
                        {resultadosCidade.map((cidade) => {
                          const label = cidade.subdivisao_nome ? `${cidade.nome} (${cidade.subdivisao_nome})` : cidade.nome;
                          return (
                            <AppButton
                              key={cidade.id}
                              type="button"
                              variant={form.cidade_id === cidade.id ? "primary" : "secondary"}
                              className="vtur-city-option"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                handleChange("cidade_id", cidade.id);
                                setCidadeBusca(label);
                                setMostrarSugestoes(false);
                                setResultadosCidade([]);
                              }}
                            >
                              <span className="vtur-choice-button-content">
                                <span className="vtur-choice-button-title">{label}</span>
                                <span className="vtur-choice-button-caption">
                                  {cidade.pais_nome || "Cidade cadastrada"}
                                </span>
                              </span>
                            </AppButton>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <AppField
                  label="Nome do produto *"
                  value={form.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                  placeholder="Ex: Passeio em Gramado, Pacote Paris"
                  disabled={modoSomenteLeitura}
                  validation={!form.nome.trim() && erro ? "Nome e obrigatorio." : undefined}
                />

                <div>
                  <AppField
                    label="Fornecedor (opcional)"
                    list="fornecedores-list"
                    placeholder="Escolha um fornecedor"
                    value={form.fornecedor_label}
                    onChange={(e) => handleFornecedorInput(e.target.value)}
                    disabled={modoSomenteLeitura}
                  />
                  <datalist id="fornecedores-list">
                    {fornecedoresLista.map((fornecedor) => (
                      <option key={fornecedor.id} value={formatFornecedorLabel(fornecedor)} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <AppField
                    label="Destino *"
                    list="destinos-list"
                    value={form.destino}
                    onChange={(e) => handleChange("destino", e.target.value)}
                    onBlur={(e) => handleChange("destino", titleCaseWithExceptions(e.target.value))}
                    placeholder={isGlobalMode ? "Global" : "Ex: Disney, Porto de Galinhas"}
                    disabled={modoSomenteLeitura || isGlobalMode}
                    title="Cidade escolhida sera aplicada quando o destino estiver vazio."
                    validation={!form.destino.trim() && erro ? "Destino e obrigatorio." : undefined}
                  />
                  <datalist id="destinos-list">
                    {destinosSugestoes.map((nome) => (
                      <option key={nome} value={nome} />
                    ))}
                  </datalist>
                </div>
              </div>

              {!isGlobalMode && form.todas_as_cidades && (
                <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 12 }}>
                  <AppField
                    as="select"
                    label="Todas as cidades"
                    value={form.todas_as_cidades ? "true" : "false"}
                    onChange={(e) => handleToggleTodasAsCidades(e.target.value === "true")}
                    disabled={modoSomenteLeitura}
                    caption="Produtos globais ficam disponiveis para qualquer cidade e nao salvam cidade especifica."
                    options={[
                      { value: "false", label: "Nao" },
                      { value: "true", label: "Sim" },
                    ]}
                  />
                </div>
              )}

              {isHospedagem && (
                <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 12 }}>
                  <div>
                    <AppField
                      label="Atracao principal"
                      list="atracoes-list"
                      value={form.atracao_principal}
                      onChange={(e) => handleChange("atracao_principal", e.target.value)}
                      placeholder="Ex: Disney, Torre Eiffel"
                      disabled={modoSomenteLeitura}
                    />
                    <datalist id="atracoes-list">
                      {atracoesSugestoes.map((nome) => (
                        <option key={nome} value={nome} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <AppField
                      label="Melhor epoca"
                      list="melhor-epoca-list"
                      value={form.melhor_epoca}
                      onChange={(e) => handleChange("melhor_epoca", e.target.value)}
                      placeholder="Ex: Dezembro a Marco"
                      disabled={modoSomenteLeitura}
                    />
                    <datalist id="melhor-epoca-list">
                      {melhoresEpocasSugestoes.map((nome) => (
                        <option key={nome} value={nome} />
                      ))}
                    </datalist>
                  </div>
                </div>
              )}

              {isHospedagem && (
                <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 12 }}>
                  <AppField
                    as="select"
                    label="Duracao sugerida"
                    value={form.duracao_sugerida}
                    onChange={(e) => handleChange("duracao_sugerida", e.target.value)}
                    disabled={modoSomenteLeitura}
                    options={[
                      { value: "", label: "Selecione" },
                      { value: "De 1 a 3 dias", label: "De 1 a 3 dias" },
                      { value: "De 3 a 5 dias", label: "De 3 a 5 dias" },
                      { value: "De 5 a 7 dias", label: "De 5 a 7 dias" },
                      { value: "De 7 a 10 dias", label: "De 7 a 10 dias" },
                      { value: "10 dias ou mais", label: "10 dias ou mais" },
                    ]}
                  />
                  <AppField
                    as="select"
                    label="Nivel de preco"
                    value={form.nivel_preco}
                    onChange={(e) => handleChange("nivel_preco", e.target.value)}
                    disabled={modoSomenteLeitura}
                    options={[
                      { value: "", label: "Selecione" },
                      ...nivelPrecosOptions.map((nivel) => ({
                        value: nivel.value,
                        label: nivel.label,
                      })),
                    ]}
                  />
                  <AppField
                    label="Imagem (URL)"
                    value={form.imagem_url}
                    onChange={(e) => handleChange("imagem_url", e.target.value)}
                    placeholder="URL de uma imagem do destino"
                    disabled={modoSomenteLeitura}
                  />
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div className="vtur-products-info-toggle">
                  <div>
                    <strong>Informacoes importantes</strong>
                    <div className="vtur-inline-note">
                      Use este campo para observacoes, dicas comerciais e documentacao necessaria.
                    </div>
                  </div>
                  <AppButton type="button" variant="secondary" onClick={() => setMostrarInfo((prev) => !prev)}>
                    {mostrarInfo ? "Ocultar" : "Mostrar"}
                  </AppButton>
                </div>
                {mostrarInfo && (
                  <div style={{ marginTop: 12 }}>
                    <AppField
                      as="textarea"
                      label="Observacoes"
                      rows={3}
                      value={form.informacoes_importantes}
                      onChange={(e) => handleChange("informacoes_importantes", e.target.value)}
                      placeholder="Observacoes gerais, dicas e documentacao necessaria."
                      disabled={modoSomenteLeitura}
                    />
                  </div>
                )}
              </div>

              <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 12 }}>
                <AppField
                  as="select"
                  label="Ativo"
                  value={form.ativo ? "true" : "false"}
                  onChange={(e) => handleChange("ativo", e.target.value === "true")}
                  disabled={modoSomenteLeitura}
                  options={[
                    { value: "true", label: "Sim" },
                    { value: "false", label: "Nao" },
                  ]}
                />
              </div>

              <div className="vtur-form-actions mobile-stack-buttons">
                <AppButton type="submit" variant="primary" loading={salvando}>
                  {editandoId ? "Salvar alteracoes" : "Salvar produto"}
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={fecharFormularioProduto} disabled={salvando}>
                  Cancelar
                </AppButton>
              </div>
            </form>
          </AppCard>
        )}

        {!mostrarFormulario && (
          <>
            {erro && (
              <div className="mb-3">
                <AlertMessage variant="error">{erro}</AlertMessage>
              </div>
            )}

            {!carregouTodos && !erro && (
              <AppCard className="mb-3" tone="config">
                Use a paginacao para navegar. Digite na busca para filtrar todos os produtos do sistema.
              </AppCard>
            )}

            <div className="mb-3">
              <PaginationControls
                page={paginaAtual}
                pageSize={pageSize}
                totalItems={totalProdutos}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </div>

            <DataTable
              shellClassName="mb-3"
              className="table-default table-header-blue table-mobile-cards min-w-[1080px]"
              containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
              headers={
                <tr>
                  <th>Tipo</th>
                  <th>Produto</th>
                  <th>Destino</th>
                  <th>Cidade</th>
                  <th>Nivel de preco</th>
                  <th>Ativo</th>
                  <th>Criado em</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              loading={loading}
              loadingMessage="Carregando produtos..."
              empty={!loading && produtosFiltrados.length === 0}
              emptyMessage={
                <EmptyState
                  title="Nenhum produto encontrado"
                  description={
                    busca.trim()
                      ? "Tente ajustar a busca ou cadastre um novo produto."
                      : "Cadastre o primeiro produto para iniciar o catalogo comercial."
                  }
                  action={
                    !modoSomenteLeitura ? (
                      <AppButton type="button" variant="primary" onClick={abrirFormularioProduto}>
                        Adicionar produto
                      </AppButton>
                    ) : null
                  }
                />
              }
              colSpan={8}
            >
              {produtosExibidos.map((produto) => (
                <tr key={produto.id}>
                  <td data-label="Tipo">{produto.tipo_nome || "-"}</td>
                  <td data-label="Produto">{produto.nome}</td>
                  <td data-label="Destino">{produto.destino || "-"}</td>
                  <td data-label="Cidade">{(produto as any).cidade_nome || "-"}</td>
                  <td data-label="Nivel de preco">{nivelPrecoLabel(produto.nivel_preco) || "-"}</td>
                  <td data-label="Ativo">{produto.ativo ? "Sim" : "Nao"}</td>
                  <td data-label="Criado em">{produto.created_at ? formatDateBR(produto.created_at) : "-"}</td>
                  <td className="th-actions" data-label="Ações">
                    <TableActions
                      show={!modoSomenteLeitura || podeExcluir}
                      actions={[
                        ...(!modoSomenteLeitura
                          ? [
                              {
                                key: "edit",
                                label: "Editar",
                                onClick: () => iniciarEdicao(produto),
                              },
                            ]
                          : []),
                        ...(podeExcluir
                          ? [
                              {
                                key: "delete",
                                label: excluindoId === produto.id ? "Excluindo..." : "Excluir",
                                onClick: () => solicitarExclusao(produto),
                                variant: "danger" as const,
                                disabled: excluindoId === produto.id,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </>
        )}

        <ConfirmDialog
          open={Boolean(produtoParaExcluir)}
          title="Excluir produto"
          message={`Tem certeza que deseja excluir ${produtoParaExcluir?.nome || "este produto"}?`}
          confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(excluindoId)}
          onCancel={() => setProdutoParaExcluir(null)}
          onConfirm={confirmarExclusao}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
