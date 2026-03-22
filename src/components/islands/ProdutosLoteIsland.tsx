import React, { useEffect, useMemo, useState } from "react";
import { Select, Textarea, TextInput } from "../ui/primer/legacyCompat";
import { supabase } from "../../lib/supabase";
import { buscarCidadesComCache } from "../../lib/cidadesSearchCache";
import { isPersistentCacheEnabled } from "../../lib/cachePolicy";
import { normalizeText } from "../../lib/normalizeText";
import { readPersistentCache, writePersistentCache } from "../../lib/offline/persistentCache";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useCrudResource } from "../../lib/useCrudResource";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

type TipoProduto = { id: string; nome: string | null; tipo: string };
type FornecedorOption = { id: string; nome_completo: string | null; nome_fantasia: string | null };
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

const nivelPrecosOptions = [
  { value: "Economico", label: "Economico" },
  { value: "Intermediario", label: "Intermediario" },
  { value: "Variavel", label: "Variavel" },
  { value: "Premium", label: "Premium" },
  { value: "Super Premium", label: "Super Premium" },
];

const duracaoOptions = [
  "De 1 a 3 dias",
  "De 3 a 5 dias",
  "De 5 a 7 dias",
  "De 7 a 10 dias",
  "10 dias ou mais",
];

function gerarIdTemporario() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function formatFornecedorLabel(fornecedor: FornecedorOption | null | undefined) {
  if (!fornecedor) return "";
  return (fornecedor.nome_fantasia?.trim() || fornecedor.nome_completo?.trim() || "").trim();
}

function tipoLabel(t?: TipoProduto | null) {
  if (!t) return "";
  return (t.nome || "").trim() || t.tipo || "";
}

function formatCidadeLabel(cidade: CidadeBusca) {
  return cidade.subdivisao_nome ? `${cidade.nome} (${cidade.subdivisao_nome})` : cidade.nome;
}

type CommonForm = {
  cidade_id: string;
  fornecedor_id: string;
  fornecedor_label: string;
  atracao_principal: string;
  melhor_epoca: string;
  duracao_sugerida: string;
  ativo: boolean;
};

type ProdutoItem = {
  id: string;
  tipo_produto: string;
  nome: string;
  destino: string;
  nivel_preco: string;
  informacoes_importantes: string;
  imagem_url: string;
};

const initialCommon: CommonForm = {
  cidade_id: "",
  fornecedor_id: "",
  fornecedor_label: "",
  atracao_principal: "",
  melhor_epoca: "",
  duracao_sugerida: "",
  ativo: true,
};

function criarProdutoItem(id?: string): ProdutoItem {
  return {
    id: id ?? gerarIdTemporario(),
    tipo_produto: "",
    nome: "",
    destino: "",
    nivel_preco: "",
    informacoes_importantes: "",
    imagem_url: "",
  };
}

const INITIAL_ITEM_ID = "temp-inicial";
const TIPO_PRODUTOS_CACHE_SCOPE = "tipo-produtos";
const TIPO_PRODUTOS_CACHE_KEY = "produtos-lote-v1";
const TIPO_PRODUTOS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export default function ProdutosLoteIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("ProdutosLote");
  const podeCriar = can("ProdutosLote", "create");
  const podeEditar = can("ProdutosLote", "edit");
  const modoSomenteLeitura = !podeCriar && !podeEditar;
  const {
    saving: salvando,
    error: erro,
    setError: setErro,
    create,
  } = useCrudResource<ProdutoItem>({
    table: "produtos",
  });
  const [tipos, setTipos] = useState<TipoProduto[]>([]);
  const [fornecedoresLista, setFornecedoresLista] = useState<FornecedorOption[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [common, setCommon] = useState<CommonForm>(initialCommon);
  const [produtos, setProdutos] = useState<ProdutoItem[]>(() => [criarProdutoItem(INITIAL_ITEM_ID)]);
  const [cidadeBusca, setCidadeBusca] = useState("");
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [resultadosCidade, setResultadosCidade] = useState<CidadeBusca[]>([]);
  const [buscandoCidade, setBuscandoCidade] = useState(false);
  const [erroCidadeBusca, setErroCidadeBusca] = useState<string | null>(null);
  const [destinosCadastro, setDestinosCadastro] = useState<string[]>([]);
  const [atracoesCadastro, setAtracoesCadastro] = useState<string[]>([]);
  const [melhoresEpocasCadastro, setMelhoresEpocasCadastro] = useState<string[]>([]);
  const [infosAbertos, setInfosAbertos] = useState<Record<string, boolean>>({});
  const [carregando, setCarregando] = useState(true);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function carregarDados() {
      setCarregando(true);
      try {
        if (isPersistentCacheEnabled()) {
          const tiposCache = await readPersistentCache<TipoProduto[]>(
            TIPO_PRODUTOS_CACHE_SCOPE,
            TIPO_PRODUTOS_CACHE_KEY
          );
          if (isActive && Array.isArray(tiposCache) && tiposCache.length > 0) {
            setTipos(tiposCache);
          }
        }

        const [
          { data: tiposData, error: tiposErr },
          { data: destinosProdutosData, error: destinosProdutosErr },
        ] = await Promise.all([
          supabase.from("tipo_produtos").select("id, nome, tipo").order("tipo", { ascending: true }),
          supabase
            .from("produtos")
            .select("destino, atracao_principal, melhor_epoca")
            .not("destino", "is", null)
            .order("destino", { ascending: true })
            .limit(500),
        ]);

        if (!isActive) return;
        if (tiposErr) throw tiposErr;

        const tiposLista = (tiposData || []) as TipoProduto[];
        setTipos(tiposLista);
        if (isPersistentCacheEnabled() && tiposLista.length > 0) {
          await writePersistentCache(
            TIPO_PRODUTOS_CACHE_SCOPE,
            TIPO_PRODUTOS_CACHE_KEY,
            tiposLista,
            TIPO_PRODUTOS_CACHE_TTL_MS
          );
        }

        const destinosNomes: string[] = [];
        const atracoesNomes: string[] = [];
        const melhoresEpocasNomes: string[] = [];

        if (destinosProdutosErr) {
          console.error("Erro ao carregar destinos de produtos:", destinosProdutosErr);
        } else {
          (destinosProdutosData || []).forEach((destino: any) => {
            const nome = (destino?.destino || "").trim();
            if (nome) destinosNomes.push(nome);
            const atracao = (destino?.atracao_principal || "").trim();
            if (atracao) atracoesNomes.push(atracao);
            const melhorEpoca = (destino?.melhor_epoca || "").trim();
            if (melhorEpoca) melhoresEpocasNomes.push(melhorEpoca);
          });
        }

        setDestinosCadastro(destinosNomes);
        setAtracoesCadastro(atracoesNomes);
        setMelhoresEpocasCadastro(melhoresEpocasNomes);
      } catch (e) {
        console.error(e);
        if (isActive) setErro("Erro ao carregar dados de apoio.");
      } finally {
        if (isActive) setCarregando(false);
      }
    }

    carregarDados();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function resolveCompany() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;
        const user = sessionUser || (await supabase.auth.getUser()).data?.user || null;
        if (!user || !isMounted) return;

        const { data, error } = await supabase
          .from("users")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        if (!isMounted) return;
        if (error) {
          console.error("Erro ao buscar company_id dos fornecedores:", error);
          return;
        }
        setCompanyId(data?.company_id || null);
      } catch (error) {
        console.error("Erro ao determinar company_id dos fornecedores:", error);
      }
    }

    resolveCompany();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId) {
      setFornecedoresLista([]);
      return;
    }

    let isActive = true;

    async function carregarFornecedores() {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome_completo, nome_fantasia")
        .eq("company_id", companyId)
        .order("nome_fantasia", { ascending: true });
      if (!isActive) return;
      if (error) {
        console.error("Erro ao carregar fornecedores:", error);
        return;
      }
      setFornecedoresLista((data || []) as FornecedorOption[]);
    }

    carregarFornecedores();
    return () => {
      isActive = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (!mostrarSugestoes) return;
    if (cidadeBusca.trim().length < 2) {
      setResultadosCidade([]);
      setErroCidadeBusca(null);
      setBuscandoCidade(false);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        setBuscandoCidade(true);
        if (controller.signal.aborted) return;
        const cidades = await buscarCidadesComCache({
          supabase,
          query: cidadeBusca.trim(),
          limit: 10,
        });
        if (controller.signal.aborted) return;
        setResultadosCidade((cidades as CidadeBusca[]) || []);
        setErroCidadeBusca(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Erro ao buscar cidades:", error);
        setResultadosCidade([]);
        setErroCidadeBusca("Erro ao buscar cidades.");
      } finally {
        if (!controller.signal.aborted) setBuscandoCidade(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [cidadeBusca, mostrarSugestoes]);

  const destinosSugestoes = useMemo(() => dedupeSugestoes(destinosCadastro), [destinosCadastro]);
  const atracoesSugestoes = useMemo(() => dedupeSugestoes(atracoesCadastro), [atracoesCadastro]);
  const melhoresEpocasSugestoes = useMemo(
    () => dedupeSugestoes(melhoresEpocasCadastro),
    [melhoresEpocasCadastro],
  );

  function handleCommonChange<K extends keyof CommonForm>(campo: K, valor: CommonForm[K]) {
    setCommon((prev) => ({ ...prev, [campo]: valor }));
  }

  function handleFornecedorInput(valor: string) {
    handleCommonChange("fornecedor_label", valor);
    const termo = valor.trim().toLowerCase();
    if (!termo) {
      handleCommonChange("fornecedor_id", "");
      return;
    }
    const match = fornecedoresLista.find(
      (f) => formatFornecedorLabel(f).toLowerCase() === termo
    );
    handleCommonChange("fornecedor_id", match ? match.id : "");
  }

  function handleCidadeBusca(valor: string) {
    setCidadeBusca(valor);
    if (common.cidade_id) {
      handleCommonChange("cidade_id", "");
    }
    setMostrarSugestoes(true);
  }

  function handleProdutoChange(id: string, campo: keyof ProdutoItem, valor: string) {
    setProdutos((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)),
    );
  }

  function adicionarProduto() {
    setProdutos((prev) => [...prev, criarProdutoItem()]);
  }

  function removerProduto(id: string) {
    setProdutos((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
    setInfosAbertos((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function limparProdutos() {
    setProdutos([criarProdutoItem()]);
    setInfosAbertos({});
  }

  function handleCancel() {
    if (typeof window !== "undefined") {
      window.location.href = "/cadastros/produtos";
    }
  }

  function toggleInfo(id: string) {
    setInfosAbertos((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function salvarProdutos(event: React.FormEvent) {
    event.preventDefault();

    if (modoSomenteLeitura) {
      setErro("Voce nao tem permissao para salvar produtos.");
      return;
    }

    if (!common.cidade_id) {
      setErro("Cidade e obrigatoria.");
      return;
    }

    const itensInvalidos: number[] = [];
    const itensValidos: ProdutoItem[] = [];

    produtos.forEach((item, index) => {
      const temAlgo =
        !!item.tipo_produto ||
        !!item.nome.trim() ||
        !!item.destino.trim() ||
        !!item.nivel_preco.trim() ||
        !!item.informacoes_importantes.trim() ||
        !!item.imagem_url.trim();
      if (!temAlgo) return;
      if (!item.tipo_produto || !item.nome.trim() || !item.destino.trim()) {
        itensInvalidos.push(index + 1);
        return;
      }
      itensValidos.push(item);
    });

    if (itensInvalidos.length > 0) {
      setErro(`Preencha Tipo, Nome e Destino nos itens: ${itensInvalidos.join(", ")}.`);
      return;
    }

    if (itensValidos.length === 0) {
      setErro("Adicione ao menos um produto para salvar.");
      return;
    }

    try {
      setErro(null);
      setSucesso(null);

      const payload = itensValidos.map((item) => ({
        nome: titleCaseWithExceptions(item.nome),
        destino: titleCaseWithExceptions(item.destino),
        cidade_id: common.cidade_id,
        tipo_produto: item.tipo_produto,
        atracao_principal: common.atracao_principal.trim() || null,
        melhor_epoca: common.melhor_epoca.trim() || null,
        duracao_sugerida: common.duracao_sugerida.trim() || null,
        nivel_preco: item.nivel_preco.trim() || null,
        informacoes_importantes: item.informacoes_importantes.trim() || null,
        imagem_url: item.imagem_url.trim() || null,
        ativo: common.ativo,
        fornecedor_id: common.fornecedor_id || null,
        todas_as_cidades: false,
      }));

      const { error } = await create(payload, {
        errorMessage: "Erro ao salvar produtos. Verifique os dados e tente novamente.",
      });
      if (error) return;

      setSucesso(`${payload.length} produto(s) salvo(s) com sucesso.`);
      setProdutos([criarProdutoItem()]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar produtos. Verifique os dados e tente novamente.");
    }
  }

  if (loadingPerm) {
    return <LoadingUsuarioContext />;
  }
  if (!podeVer) {
    return (
      <AppCard tone="config">
        Voce nao possui acesso ao modulo de Cadastros.
      </AppCard>
    );
  }

  return (
    <div className="produtos-lote-page">
      <AppCard
        tone="config"
        className="mb-3"
        title="Produtos em lote"
        subtitle="Cadastre varios produtos de uma vez com atributos compartilhados."
      />
      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
      {sucesso && <AlertMessage variant="success">{sucesso}</AlertMessage>}

      <AppCard tone="info" className="form-card mb-3" title="Cadastro em lote de produtos">
        <form onSubmit={salvarProdutos}>
          <div className="form-row mobile-stack">
            <div className="form-group" style={{ flex: 1 }}>
              <AppField
                wrapperClassName="form-group"
                label="Cidade *"
                placeholder="Digite o nome da cidade"
                value={cidadeBusca}
                onChange={(e) => handleCidadeBusca(e.target.value)}
                onFocus={() => setMostrarSugestoes(true)}
                onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                disabled={modoSomenteLeitura}
              />
              {buscandoCidade && <div style={{ fontSize: 12, color: "#6b7280" }}>Buscando...</div>}
              {erroCidadeBusca && !buscandoCidade && (
                <div style={{ fontSize: 12, color: "#dc2626" }}>{erroCidadeBusca}</div>
              )}
              {mostrarSugestoes && (
                <AppCard
                  tone="default"
                  className="mt-1"
                  style={{
                    maxHeight: 180,
                    overflowY: "auto",
                    padding: 6,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {resultadosCidade.length === 0 && !buscandoCidade && cidadeBusca.trim().length >= 2 && (
                    <div style={{ padding: "4px 6px", color: "#6b7280" }}>Nenhuma cidade encontrada.</div>
                  )}
                  {resultadosCidade.map((cidade) => {
                    const label = formatCidadeLabel(cidade);
                    return (
                      <AppButton
                        key={cidade.id}
                        type="button"
                        variant={common.cidade_id === cidade.id ? "primary" : "secondary"}
                        style={{
                          width: "100%",
                          justifyContent: "flex-start",
                          marginBottom: 4,
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCommonChange("cidade_id", cidade.id);
                          setCidadeBusca(label);
                          setMostrarSugestoes(false);
                          setResultadosCidade([]);
                          setErroCidadeBusca(null);
                        }}
                      >
                        {label}
                        {cidade.pais_nome ? (
                          <span style={{ color: "#6b7280", marginLeft: 6 }}>- {cidade.pais_nome}</span>
                        ) : null}
                      </AppButton>
                    );
                  })}
                </AppCard>
              )}
            </div>

            <AppField
              wrapperClassName="form-group"
              label="Fornecedor (opcional)"
              list="fornecedores-lote-list"
              placeholder="Escolha um fornecedor"
              value={common.fornecedor_label}
              onChange={(e) => handleFornecedorInput(e.target.value)}
              disabled={modoSomenteLeitura}
            />
            <datalist id="fornecedores-lote-list">
              {fornecedoresLista.map((fornecedor) => (
                <option key={fornecedor.id} value={formatFornecedorLabel(fornecedor)} />
              ))}
            </datalist>

          </div>

          <div className="form-row mobile-stack">
            <AppField
              wrapperClassName="form-group"
              label="Atracao principal"
              list="atracoes-lote-list"
              value={common.atracao_principal}
              onChange={(e) => handleCommonChange("atracao_principal", e.target.value)}
              placeholder="Ex: Centro historico, parques, praias"
              disabled={modoSomenteLeitura}
            />
            <datalist id="atracoes-lote-list">
              {atracoesSugestoes.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>

            <AppField
              wrapperClassName="form-group"
              label="Melhor epoca"
              list="melhores-epocas-lote-list"
              value={common.melhor_epoca}
              onChange={(e) => handleCommonChange("melhor_epoca", e.target.value)}
              placeholder="Ex: Verao, baixa temporada"
              disabled={modoSomenteLeitura}
            />
            <datalist id="melhores-epocas-lote-list">
              {melhoresEpocasSugestoes.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>

            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Duracao sugerida"
              value={common.duracao_sugerida}
              onChange={(e) => handleCommonChange("duracao_sugerida", e.target.value)}
              disabled={modoSomenteLeitura}
              options={[
                { value: "", label: "Selecione" },
                ...duracaoOptions.map((duracao) => ({ value: duracao, label: duracao })),
              ]}
            />

            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Ativo"
              value={common.ativo ? "true" : "false"}
              onChange={(e) => handleCommonChange("ativo", e.target.value === "true")}
              disabled={modoSomenteLeitura}
              options={[
                { value: "true", label: "Sim" },
                { value: "false", label: "Nao" },
              ]}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2" style={{ justifyContent: "space-between" }}>
            <div style={{ color: "#64748b" }}>Produtos do lote</div>
          </div>

          <datalist id="destinos-lote-list">
            {destinosSugestoes.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>

          <div style={{ marginTop: 12 }}>
            <DataTable
              className="table-header-blue table-mobile-cards table-mobile-plain stack-labels min-w-[1400px]"
              headers={
                <tr>
                  <th>Tipo *</th>
                  <th>Nome do produto *</th>
                  <th>Destino *</th>
                  <th>Nivel de preco</th>
                  <th>Imagem (URL)</th>
                  <th>Info</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              colSpan={7}
            >
              {produtos.map((produto, index) => (
                <React.Fragment key={produto.id}>
                  <tr>
                    <td data-label="Tipo">
                      <Select
                        block
                        value={produto.tipo_produto}
                        onChange={(e) => handleProdutoChange(produto.id, "tipo_produto", e.target.value)}
                        disabled={modoSomenteLeitura || carregando}
                      >
                        <Select.Option value="">
                          {carregando ? "Carregando..." : "Selecione o tipo"}
                        </Select.Option>
                        {tipos.map((t) => (
                          <Select.Option key={t.id} value={t.id}>
                            {tipoLabel(t) || "(sem nome)"}
                          </Select.Option>
                        ))}
                      </Select>
                    </td>
                    <td data-label="Nome do produto">
                      <TextInput
                        block
                        value={produto.nome}
                        onChange={(e) => handleProdutoChange(produto.id, "nome", e.target.value)}
                        onBlur={(e) =>
                          handleProdutoChange(produto.id, "nome", titleCaseWithExceptions(e.target.value))
                        }
                        placeholder={`Produto ${index + 1}`}
                        style={{ minWidth: 320 }}
                        disabled={modoSomenteLeitura}
                      />
                    </td>
                    <td data-label="Destino">
                      <TextInput
                        block
                        list="destinos-lote-list"
                        value={produto.destino}
                        onChange={(e) => handleProdutoChange(produto.id, "destino", e.target.value)}
                        onBlur={(e) =>
                          handleProdutoChange(produto.id, "destino", titleCaseWithExceptions(e.target.value))
                        }
                        placeholder="Ex: Disney, Porto de Galinhas"
                        style={{ minWidth: 320 }}
                        disabled={modoSomenteLeitura}
                      />
                    </td>
                    <td data-label="Nivel de preco">
                      <Select
                        block
                        value={produto.nivel_preco}
                        onChange={(e) => handleProdutoChange(produto.id, "nivel_preco", e.target.value)}
                        disabled={modoSomenteLeitura}
                      >
                        <Select.Option value="">Selecione</Select.Option>
                        {nivelPrecosOptions.map((nivel) => (
                          <Select.Option key={nivel.value} value={nivel.value}>
                            {nivel.label}
                          </Select.Option>
                        ))}
                      </Select>
                    </td>
                    <td data-label="Imagem (URL)">
                      <TextInput
                        block
                        value={produto.imagem_url}
                        onChange={(e) => handleProdutoChange(produto.id, "imagem_url", e.target.value)}
                        placeholder="URL da imagem"
                        disabled={modoSomenteLeitura}
                      />
                    </td>
                    <td data-label="Info">
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => toggleInfo(produto.id)}
                      >
                        {infosAbertos[produto.id] ? "-" : "+"}
                      </AppButton>
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons">
                        <AppButton
                          type="button"
                          variant="danger"
                          onClick={() => removerProduto(produto.id)}
                          disabled={modoSomenteLeitura || produtos.length === 1}
                          title="Remover produto"
                          aria-label="Remover produto"
                        >
                          <i className="pi pi-trash" aria-hidden="true" />
                        </AppButton>
                      </div>
                    </td>
                  </tr>
                  {infosAbertos[produto.id] && (
                    <tr>
                      <td colSpan={7}>
                        <Textarea
                          block
                          rows={2}
                          value={produto.informacoes_importantes}
                          onChange={(e) =>
                            handleProdutoChange(produto.id, "informacoes_importantes", e.target.value)
                          }
                          placeholder="Observacoes, regras, detalhes relevantes..."
                          disabled={modoSomenteLeitura}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </DataTable>
          </div>

          <div className="mt-2 mobile-stack-buttons vtur-actions-end">
            <AppButton
              type="button"
              variant="secondary"
              onClick={adicionarProduto}
              disabled={modoSomenteLeitura}
            >
              Adicionar produto
            </AppButton>
            <AppButton type="submit" variant="primary" disabled={salvando || modoSomenteLeitura}>
              {salvando ? "Salvando..." : "Salvar Produtos"}
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={salvando || modoSomenteLeitura}
            >
              Cancelar
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              onClick={limparProdutos}
              disabled={salvando || modoSomenteLeitura}
            >
              Limpar itens
            </AppButton>
          </div>
        </form>
      </AppCard>
    </div>
  );
}
