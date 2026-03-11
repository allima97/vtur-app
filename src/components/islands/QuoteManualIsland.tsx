import React, { useEffect, useMemo, useRef, useState } from "react";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
import { formatNumberBR } from "../../lib/format";
import { matchesCpfSearch, onlyDigits } from "../../lib/searchNormalization";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type ClienteOption = {
  id: string;
  nome: string;
  cpf?: string | null;
  whatsapp?: string | null;
  email?: string | null;
};

type TipoProdutoOption = { id: string; label: string };

type CidadeOption = {
  id: string;
  nome: string;
  subdivisao_nome?: string | null;
  pais_nome?: string | null;
};

type ProdutoOption = {
  nome: string | null;
  destino?: string | null;
  cidade_id?: string | null;
};

type ManualItem = {
  temp_id: string;
  item_type: string;
  title: string;
  product_name: string;
  city_name: string;
  cidade_id: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  taxes_amount: number;
  start_date: string;
  end_date: string;
  currency: string;
  raw: Record<string, unknown>;
  order_index: number;
};

function normalizeLookupText(value: string) {
  return normalizeText(value || "").trim();
}

function normalizeCityName(value: string) {
  return normalizeLookupText(value);
}

function cleanPaisNome(pais: string): string {
  // Remove caracteres de encoding quebrado (ex: â€, â€“ etc)
  return pais.replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac\u00e2\u0080\u0093\u0094\u0098\u0099]+/g, "").replace(/[â€₵₡˜â€₵₡™â€₵₡œâ€₵₡â€₵₡¢â€₵₡“â€₵₡”â€₵₡]/g, "").replace(/[\uFFFD]+/g, "").replace(/^[^a-zA-Z0-9]+/, "").trim();
}

function formatCidadeLabel(cidade: CidadeOption) {
  const nome = (cidade.nome || "").trim();
  const subdivisao = (cidade.subdivisao_nome || "").trim();
  let pais = (cidade.pais_nome || "").trim();
  if (pais) pais = cleanPaisNome(pais);
  let detalhe = "";
  if (subdivisao && normalizeCityName(subdivisao) !== normalizeCityName(nome)) {
    detalhe = subdivisao;
  } else if (pais) {
    detalhe = pais;
  } else if (subdivisao) {
    detalhe = subdivisao;
  }
  return detalhe ? `${nome} (${detalhe})` : nome;
}

function normalizeNumber(value: string) {
  const cleaned = value.replace(/[^0-9,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return formatNumberBR(value, 2);
}

function hojeISO() {
  return new Date().toISOString().substring(0, 10);
}

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

function formatTelefoneValue(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function gerarIdTemporario() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const TIPO_DATALIST_ID = "quote-manual-tipos-list";
const DESTINO_DATALIST_ID = "quote-manual-destinos-list";

function criarItemManual(tempId?: string): ManualItem {
  return {
    temp_id: tempId ?? gerarIdTemporario(),
    item_type: "",
    title: "",
    product_name: "",
    city_name: "",
    cidade_id: null,
    quantity: 1,
    unit_price: 0,
    total_amount: 0,
    taxes_amount: 0,
    start_date: "",
    end_date: "",
    currency: "BRL",
    raw: {},
    order_index: 0,
  };
}

const INITIAL_ITEM_ID = "temp-inicial";

function isItemEmpty(item: ManualItem) {
  const hasValue =
    item.item_type.trim() ||
    item.title.trim() ||
    item.product_name.trim() ||
    item.city_name.trim() ||
    item.cidade_id ||
    item.start_date ||
    item.end_date ||
    item.total_amount > 0 ||
    item.taxes_amount > 0 ||
    item.quantity !== 1;
  return !hasValue;
}

function validateItem(item: ManualItem) {
  return Boolean(
    item.item_type &&
      item.quantity > 0 &&
      item.start_date &&
      (item.title || item.product_name) &&
      item.total_amount > 0
  );
}

function isSeguroItem(item: ManualItem) {
  const normalized = normalizeLookupText(item.item_type || "");
  return normalized.includes("seguro") && normalized.includes("viagem");
}

function normalizeTitleText(value: string) {
  return titleCaseWithExceptions(value || "");
}

function normalizeItemText(item: ManualItem): ManualItem {
  if (isSeguroItem(item)) {
    return {
      ...item,
      title: "SEGURO VIAGEM",
      product_name: "SEGURO VIAGEM",
      city_name: item.city_name ? normalizeTitleText(item.city_name) : item.city_name,
    };
  }
  return {
    ...item,
    title: item.title ? normalizeTitleText(item.title) : item.title,
    product_name: item.product_name ? normalizeTitleText(item.product_name) : item.product_name,
    city_name: item.city_name ? normalizeTitleText(item.city_name) : item.city_name,
  };
}

export default function QuoteManualIsland() {
  const [items, setItems] = useState<ManualItem[]>(() => [criarItemManual(INITIAL_ITEM_ID)]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clientesErro, setClientesErro] = useState<string | null>(null);
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteTelefone, setNovoClienteTelefone] = useState("");
  const [novoClienteErro, setNovoClienteErro] = useState<string | null>(null);
  const [novoClienteSalvando, setNovoClienteSalvando] = useState(false);
  const [valorInputs, setValorInputs] = useState<
    Record<string, { total?: string; taxes?: string }>
  >({});
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  const [tipoOptions, setTipoOptions] = useState<TipoProdutoOption[]>([]);
  const [produtosCatalogo, setProdutosCatalogo] = useState<ProdutoOption[]>([]);
  const [destinoOptions, setDestinoOptions] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [cidadeSuggestions, setCidadeSuggestions] = useState<Record<string, CidadeOption[]>>({});
  const [cidadeInputValues, setCidadeInputValues] = useState<Record<string, string>>({});
  const [cidadeCache, setCidadeCache] = useState<Record<string, string>>({});
  const [cidadeNameMap, setCidadeNameMap] = useState<Record<string, string>>({});
  const [itemParaExcluir, setItemParaExcluir] = useState<{ index: number; label?: string } | null>(
    null
  );
  const cidadeFetchTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      Object.values(cidadeFetchTimeouts.current).forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function carregarTipos() {
      try {
        const response = await fetch("/api/v1/orcamentos/tipos");
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro ao carregar tipos.");
        }
        const data = (await response.json()) as Array<{ id: string; nome?: string | null; tipo?: string | null }>;
        if (!active) return;
        setTipoOptions(
          (data || [])
            .filter((tipo) => tipo && (tipo.nome || tipo.tipo))
            .map((tipo) => {
              const label = String(tipo.nome || tipo.tipo || "").trim();
              return { id: tipo.id, label };
            })
            .filter((tipo) => tipo.label)
        );
      } catch (err) {
        if (!active) return;
        console.warn("[QuoteManual] Erro ao carregar tipos", err);
      }
    }
    carregarTipos();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function carregarClientes() {
      setCarregandoClientes(true);
      try {
        const response = await fetch("/api/v1/orcamentos/clientes");
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro ao carregar clientes.");
        }
        const data = (await response.json()) as ClienteOption[];
        if (!active) return;
        setClientes((data || []) as ClienteOption[]);
        setClientesErro(null);
      } catch (err) {
        console.error("Erro ao carregar clientes:", err);
        if (!active) return;
        setClientesErro("Nao foi possivel carregar os clientes.");
      } finally {
        if (active) setCarregandoClientes(false);
      }
    }
    carregarClientes();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function carregarProdutosEDestinos() {
      try {
        const response = await fetch("/api/v1/orcamentos/produtos");
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro ao carregar produtos.");
        }
        const data = (await response.json()) as ProdutoOption[];
        if (!active) return;
        setProdutosCatalogo((data || []) as ProdutoOption[]);

        const destinos: string[] = [];
        (data || []).forEach((produto) => {
          const nome = (produto?.destino || "").trim();
          if (nome) destinos.push(nome);
        });
        setDestinoOptions(dedupeSugestoes(destinos));
      } catch (err) {
        if (!active) return;
        console.warn("[QuoteManual] Erro ao carregar produtos/destinos", err);
      }
    }
    carregarProdutosEDestinos();
    return () => {
      active = false;
    };
  }, []);

  async function loadCidadeSuggestions(rowKey: string, term: string) {
    const search = term.trim();
    const limit = 25;
    let cidades: CidadeOption[] = [];
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("limite", String(limit));
      const response = await fetch(`/api/v1/orcamentos/cidades-busca?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao buscar cidades.");
      }
      const data = (await response.json()) as CidadeOption[];
      cidades = (data || []).filter((cidade) => cidade?.id && cidade.nome);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.warn("[QuoteManual] Erro ao buscar cidades", err);
      setCidadeSuggestions((prev) => ({ ...prev, [rowKey]: [] }));
      return;
    }

    if (!isMountedRef.current) return;
    setCidadeSuggestions((prev) => ({ ...prev, [rowKey]: cidades }));
    if (cidades.length) {
      setCidadeCache((prev) => {
        const next = { ...prev };
        cidades.forEach((cidade) => {
          if (cidade.id && cidade.nome) {
            next[cidade.id] = formatCidadeLabel(cidade);
          }
        });
        return next;
      });
      setCidadeNameMap((prev) => {
        const next = { ...prev };
        cidades.forEach((cidade) => {
          if (cidade.id && cidade.nome) {
            const nomeKey = normalizeCityName(cidade.nome);
            const labelKey = normalizeCityName(formatCidadeLabel(cidade));
            if (nomeKey && !next[nomeKey]) next[nomeKey] = cidade.id;
            if (labelKey && !next[labelKey]) next[labelKey] = cidade.id;
          }
        });
        return next;
      });
    }
  }

  function scheduleCidadeFetch(rowKey: string, term: string) {
    const existing = cidadeFetchTimeouts.current[rowKey];
    if (existing) {
      clearTimeout(existing);
    }
    cidadeFetchTimeouts.current[rowKey] = setTimeout(() => loadCidadeSuggestions(rowKey, term), 250);
  }

  function getCidadeInputValue(item: ManualItem, rowKey: string) {
    if (Object.prototype.hasOwnProperty.call(cidadeInputValues, rowKey)) {
      return cidadeInputValues[rowKey] || "";
    }
    if (item.cidade_id) {
      return cidadeCache[item.cidade_id] || "";
    }
    return "";
  }

  function handleCidadeInputChange(index: number, value: string, rowKey: string) {
    const normalized = normalizeCityName(value);
    const matchedId = cidadeNameMap[normalized];
    const matchedCidade = cidadeSuggestions[rowKey]?.find((cidade) => {
      const label = formatCidadeLabel(cidade);
      return (
        normalizeCityName(label) === normalized ||
        normalizeCityName(cidade.nome) === normalized
      );
    });
    const displayValue =
      (matchedCidade ? formatCidadeLabel(matchedCidade) : "") ||
      (matchedId ? cidadeCache[matchedId] : "") ||
      value;
    setCidadeInputValues((prev) => ({
      ...prev,
      [rowKey]: displayValue,
    }));
    updateItem(index, { cidade_id: matchedId ?? matchedCidade?.id ?? null });
    if (value.trim().length >= 1) {
      scheduleCidadeFetch(rowKey, value);
    }
  }

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim();
    if (q.length < 2) return [];

    const termo = normalizeText(q);

    return clientes
      .filter((c) => {
        if (normalizeText(c.nome).includes(termo)) return true;
        if (matchesCpfSearch(c.cpf || "", q)) return true;
        return false;
      })
      .slice(0, 10);
  }, [clientes, clienteBusca]);

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) || null,
    [clientes, clienteId]
  );

  function handleClienteInputChange(value: string) {
    setClienteBusca(value);
    const texto = normalizeText(value);
    const cpfTexto = onlyDigits(value);
    const achado = clientes.find((c) => {
      const cpf = onlyDigits(c.cpf || "");
      return normalizeText(c.nome) === texto || (cpfTexto && cpf === cpfTexto);
    });
    setClienteId(achado?.id || "");
  }

  function handleClienteBlur() {
    if (!clienteBusca.trim()) return;
    const texto = normalizeText(clienteBusca);
    const cpfTexto = onlyDigits(clienteBusca);
    const achado = clientesFiltrados.find((c) => {
      const cpf = onlyDigits(c.cpf || "");
      return normalizeText(c.nome) === texto || (cpfTexto && cpf === cpfTexto);
    });
    if (achado) {
      setClienteId(achado.id);
      setClienteBusca("");
    }
  }

  function abrirNovoCliente() {
    const nomeBase = clienteBusca.trim();
    setNovoClienteNome(nomeBase);
    setNovoClienteTelefone("");
    setNovoClienteErro(null);
    setNovoClienteAberto(true);
  }

  function cancelarNovoCliente() {
    setNovoClienteAberto(false);
    setNovoClienteNome("");
    setNovoClienteTelefone("");
    setNovoClienteErro(null);
  }

  async function salvarNovoCliente() {
    const nomeRaw = novoClienteNome.trim();
    const telefoneRaw = novoClienteTelefone.trim();
    if (!nomeRaw || !telefoneRaw) {
      setNovoClienteErro("Informe nome e telefone.");
      return;
    }
    setNovoClienteSalvando(true);
    setNovoClienteErro(null);
    try {
      const response = await fetch("/api/v1/orcamentos/cliente-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: titleCaseWithExceptions(nomeRaw), telefone: telefoneRaw }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Nao foi possivel criar o cliente.");
      }
      const json = (await response.json()) as { item?: ClienteOption };
      const data = json.item;
      if (!data) throw new Error("Nao foi possivel criar o cliente.");
      setClientes((prev) => {
        const next = [...prev, data as ClienteOption];
        next.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
        return next;
      });
      setClienteId(data.id);
      setClienteBusca("");
      setNovoClienteAberto(false);
      setNovoClienteNome("");
      setNovoClienteTelefone("");
    } catch (err) {
      console.error(err);
      setNovoClienteErro("Nao foi possivel criar o cliente.");
    } finally {
      setNovoClienteSalvando(false);
    }
  }

  function getValorInput(
    rowKey: string,
    field: "total" | "taxes",
    value: number
  ) {
    const entry = valorInputs[rowKey];
    if (entry && entry[field] !== undefined) {
      return entry[field] ?? "";
    }
    return Number.isFinite(value) ? formatCurrency(value) : "";
  }

  function handleValorBlur(
    rowKey: string,
    field: "total" | "taxes",
    value: string
  ) {
    const trimmed = value.trim();
    const nextValue = trimmed ? formatCurrency(normalizeNumber(trimmed)) : "";
    setValorInputs((prev) => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        [field]: nextValue,
      },
    }));
  }

  function buildProdutoSuggestions(item: ManualItem) {
    const destinoTerm = normalizeLookupText(item.city_name || "");
    const cidadeId = item.cidade_id || null;

    const matchesByCidade = cidadeId
      ? produtosCatalogo.filter((produto) => produto?.cidade_id === cidadeId)
      : [];

    const matchesByDestino = destinoTerm
      ? produtosCatalogo.filter((produto) => {
          const destinoProduto = normalizeLookupText(produto?.destino || "");
          return destinoProduto.includes(destinoTerm);
        })
      : [];

    let base = matchesByCidade;
    if (!base.length && matchesByDestino.length) {
      base = matchesByDestino;
    }
    if (!base.length && !cidadeId && destinoTerm) {
      base = matchesByDestino;
    }
    if (!base.length) {
      return [];
    }

    return dedupeSugestoes(
      base
        .map((produto) => (produto?.nome || "").trim())
        .filter(Boolean)
    ).slice(0, 50);
  }

  const dataMinimaInicio = useMemo(() => hojeISO(), []);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    [items]
  );
  const taxesTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0),
    [items]
  );
  const total = useMemo(() => subtotal + taxesTotal, [subtotal, taxesTotal]);
  const itensPreenchidos = useMemo(
    () => items.filter((item) => !isItemEmpty(item)).length,
    [items]
  );
  const resumoItens = useMemo(() => {
    const itemLabel = itensPreenchidos === 1 ? "item preenchido" : "itens preenchidos";
    return `${itensPreenchidos} ${itemLabel} · Subtotal R$ ${formatCurrency(
      subtotal
    )} · Taxas R$ ${formatCurrency(taxesTotal)} · Total R$ ${formatCurrency(total)}`;
  }, [itensPreenchidos, subtotal, taxesTotal, total]);
  const contextoCliente = useMemo(() => {
    if (!clienteSelecionado) {
      return "Selecione o cliente e monte um orcamento completo com itens, datas e valores revisados.";
    }

    const detalhes = [
      clienteSelecionado.cpf ? `CPF ${clienteSelecionado.cpf}` : null,
      clienteSelecionado.whatsapp || null,
      clienteSelecionado.email || null,
    ].filter(Boolean);

    return detalhes.length > 0
      ? `${clienteSelecionado.nome} · ${detalhes.join(" · ")}`
      : clienteSelecionado.nome;
  }, [clienteSelecionado]);

  function updateItem(index: number, updates: Partial<ManualItem>) {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated = { ...current, ...updates };
      const quantity = Math.max(1, Math.round(Number(updated.quantity) || 1));
      const totalAmount = Number(updated.total_amount) || 0;
      const unitPrice = quantity > 0 ? totalAmount / quantity : totalAmount;
      updated.quantity = quantity;
      updated.total_amount = totalAmount;
      updated.taxes_amount = Number(updated.taxes_amount) || 0;
      updated.unit_price = unitPrice;
      next[index] = updated;
      return next;
    });
  }

  function moveItem(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setItems(next);
  }

  function removerItem(index: number) {
    const current = items[index];
    if (!current) return;
    const rowKey = current.temp_id || `row-${index}`;
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [criarItemManual()];
    });
    setCidadeInputValues((prev) => {
      if (!prev[rowKey]) return prev;
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    setCidadeSuggestions((prev) => {
      if (!prev[rowKey]) return prev;
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  }

  function solicitarRemocaoItem(index: number) {
    const current = items[index];
    if (!current) return;
    const label = current.title || current.product_name || current.city_name || "este item";
    setItemParaExcluir({ index, label });
  }

  function confirmarRemocaoItem() {
    if (!itemParaExcluir) return;
    removerItem(itemParaExcluir.index);
    setItemParaExcluir(null);
  }

  function adicionarItem() {
    setItems((prev) => [...prev, criarItemManual()]);
  }

  function limparItens() {
    setItems([criarItemManual()]);
    setCidadeInputValues({});
    setCidadeSuggestions({});
    setCidadeCache({});
    setCidadeNameMap({});
    setError(null);
    setStatus(null);
  }

  function handleCancel() {
    if (typeof window !== "undefined") {
      window.location.href = "/orcamentos/consulta";
    }
  }

  async function handleSave() {
    if (!clienteId) {
      setError("Selecione um cliente antes de salvar.");
      return;
    }

    const itensComDados = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !isItemEmpty(item));

    if (!itensComDados.length) {
      setError("Adicione ao menos um produto para salvar.");
      return;
    }

    const invalidIndexes: number[] = [];
    const invalidPastDates: number[] = [];
    const itensPreparados: ManualItem[] = [];

    itensComDados.forEach(({ item, index }) => {
      const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
      const totalAmount = Number(item.total_amount) || 0;
      const unitPrice = quantity > 0 ? totalAmount / quantity : totalAmount;
      const normalized = normalizeItemText({
        ...item,
        quantity,
        total_amount: totalAmount,
        taxes_amount: Number(item.taxes_amount) || 0,
        unit_price: unitPrice,
        order_index: index,
      });
      if (normalized.start_date && dataMinimaInicio && normalized.start_date < dataMinimaInicio) {
        invalidPastDates.push(index + 1);
        return;
      }
      if (!validateItem(normalized)) {
        invalidIndexes.push(index + 1);
        return;
      }
      itensPreparados.push(normalized);
    });

    if (invalidPastDates.length > 0) {
      setError(
        `Itens com Inicio anterior a hoje: ${invalidPastDates.join(", ")}.`
      );
      return;
    }

    if (invalidIndexes.length > 0) {
      setError(
        `Preencha Tipo, Produto, Inicio, Qtd e Total nos itens: ${invalidIndexes.join(", ")}.`
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessId(null);
    setStatus("Salvando orcamento...");

    try {
      const subtotalValue = itensPreparados.reduce(
        (sum, item) => sum + Number(item.total_amount || 0),
        0
      );
      const taxesValue = itensPreparados.reduce(
        (sum, item) => sum + Number(item.taxes_amount || 0),
        0
      );
      const itemsPayload = itensPreparados.map((item, index) => ({
        item_type: item.item_type,
        title: item.title,
        product_name: item.product_name,
        city_name: item.city_name,
        cidade_id: item.cidade_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_amount: item.total_amount,
        taxes_amount: item.taxes_amount,
        start_date: item.start_date || null,
        end_date: item.end_date || item.start_date || null,
        currency: item.currency || "BRL",
        order_index: typeof item.order_index === "number" ? item.order_index : index,
        raw: item.raw || {},
      }));

      const response = await fetch("/api/v1/orcamentos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clienteId,
          items: itemsPayload,
          subtotal: subtotalValue,
          taxes: taxesValue,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao salvar orcamento.");
      }
      const json = (await response.json()) as { quote_id?: string; status?: string };

      setSuccessId(json.quote_id || null);
      setStatus(`Salvo como ${json.status || "CONFIRMED"}.`);
      if (typeof window !== "undefined") {
        window.location.href = "/orcamentos/consulta";
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar orcamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap orcamentos-criar-page">
        <AppToolbar
          sticky
          tone="info"
          className="mb-3 list-toolbar-sticky"
          title="Criar orcamento manual"
          subtitle="Monte um orcamento completo com cliente, itens, destinos, datas e valores revisados antes da confirmacao."
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
                Cancelar
              </AppButton>
              <AppButton
                type="button"
                variant="primary"
                onClick={handleSave}
                disabled={saving}
                loading={saving}
              >
                {saving ? "Salvando..." : "Salvar orcamento"}
              </AppButton>
            </div>
          }
        >
          <div className="vtur-quote-summary-grid">
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Cliente</span>
              <strong>{clienteSelecionado ? clienteSelecionado.nome : "Nao selecionado"}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Itens preenchidos</span>
              <strong>{itensPreenchidos}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Subtotal</span>
              <strong>R$ {formatCurrency(subtotal)}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Total estimado</span>
              <strong>R$ {formatCurrency(total)}</strong>
            </div>
          </div>
        </AppToolbar>

        {status && (
          <AlertMessage variant="info" className="mb-3">
            {status}
          </AlertMessage>
        )}
        {error && (
          <AlertMessage variant="error" className="mb-3">
            {error}
          </AlertMessage>
        )}
        {successId && (
          <AlertMessage variant="success" className="mb-3">
            Salvo com sucesso. <a href={`/orcamentos/${successId}`}>Abrir quote</a>
          </AlertMessage>
        )}

        <AppCard
          className="mb-3"
          tone="info"
          title="Cliente do orcamento"
          subtitle={contextoCliente}
          actions={
            !novoClienteAberto ? (
              <AppButton type="button" variant="secondary" onClick={abrirNovoCliente}>
                Novo cliente rapido
              </AppButton>
            ) : undefined
          }
        >
          <div className="vtur-form-grid vtur-form-grid-2 quote-manual-client-row">
            <AppField
              label="Cliente *"
              list="listaClientes"
              placeholder="Buscar cliente por nome ou CPF..."
              value={clienteSelecionado?.nome || clienteBusca}
              onChange={(e) => handleClienteInputChange(e.target.value)}
              onBlur={handleClienteBlur}
              required
              caption={
                carregandoClientes
                  ? "Carregando clientes..."
                  : "Digite ao menos 2 caracteres para localizar um cliente existente."
              }
              validation={!carregandoClientes ? clientesErro ?? undefined : undefined}
            />
          </div>

          {clienteBusca.trim().length >= 2 && (
            <datalist id="listaClientes">
              {clientesFiltrados.map((c) => (
                <React.Fragment key={c.id}>
                  <option value={c.nome} label={c.cpf ? `CPF: ${c.cpf}` : undefined} />
                  {c.cpf ? <option value={c.cpf} label={c.nome} /> : null}
                </React.Fragment>
              ))}
            </datalist>
          )}

          {novoClienteAberto && (
            <AppCard
              className="vtur-quote-inline-card"
              tone="config"
              title="Novo cliente rapido"
              subtitle="Cadastre um cliente enxuto sem sair do fluxo do orcamento."
            >
              <div className="vtur-form-grid vtur-form-grid-2">
                <AppField
                  label="Nome do cliente *"
                  value={novoClienteNome}
                  onChange={(e) => setNovoClienteNome(e.target.value)}
                  onBlur={(e) => setNovoClienteNome(titleCaseWithExceptions(e.target.value))}
                  placeholder="Nome do cliente"
                />
                <AppField
                  label="Telefone *"
                  value={novoClienteTelefone}
                  onChange={(e) => setNovoClienteTelefone(formatTelefoneValue(e.target.value))}
                  placeholder="Telefone do cliente"
                />
              </div>
              {novoClienteErro && (
                <AlertMessage variant="error" className="mt-3">
                  {novoClienteErro}
                </AlertMessage>
              )}
              <div className="vtur-form-actions">
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={salvarNovoCliente}
                  disabled={novoClienteSalvando}
                  loading={novoClienteSalvando}
                >
                  {novoClienteSalvando ? "Salvando..." : "Salvar cliente"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={cancelarNovoCliente}
                  disabled={novoClienteSalvando}
                >
                  Cancelar
                </AppButton>
              </div>
            </AppCard>
          )}
        </AppCard>

        <AppCard
          className="mb-3"
          tone="config"
          title="Itens do orcamento"
          subtitle={resumoItens}
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton type="button" variant="secondary" onClick={limparItens} disabled={saving}>
                Limpar itens
              </AppButton>
              <AppButton type="button" variant="primary" onClick={adicionarItem} disabled={saving}>
                Adicionar item
              </AppButton>
            </div>
          }
        >
          <div className="vtur-inline-note">
            Revise tipo, cidade, datas e valores de cada linha. O inicio nao pode ser anterior a hoje.
          </div>

          <div
            className="table-container overflow-x-auto"
            style={{ maxHeight: "65vh", overflowY: "auto", marginTop: 16 }}
          >
            <table className="table-default table-compact table-mobile-cards quote-items-table">
              <thead>
                <tr>
                  <th className="order-cell">Ordem</th>
                  <th>Tipo</th>
                  <th>Cidade</th>
                  <th>Destino</th>
                  <th>Produto</th>
                  <th>Data Início</th>
                  <th>Data Final</th>
                  <th>Qtd</th>
                  <th>Total</th>
                  <th>Taxas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const rowKey = item.temp_id || `row-${index}`;
                  const produtoOptions = buildProdutoSuggestions(item);
                  return (
                    <React.Fragment key={rowKey}>
                      <tr>
                        <td className="order-cell" data-label="">
                          <div className="order-cell-head">
                            <span className="order-label">Ordem</span>
                            <TableActions
                              className="vtur-quote-order-actions"
                              actions={[
                                {
                                  key: "up",
                                  label: "Mover para cima",
                                  icon: "↑",
                                  variant: "ghost",
                                  onClick: () => moveItem(index, "up"),
                                  disabled: index === 0,
                                },
                                {
                                  key: "down",
                                  label: "Mover para baixo",
                                  icon: "↓",
                                  variant: "ghost",
                                  onClick: () => moveItem(index, "down"),
                                  disabled: index === items.length - 1,
                                },
                                {
                                  key: "delete",
                                  label: "Excluir item",
                                  icon: "×",
                                  variant: "danger",
                                  onClick: () => solicitarRemocaoItem(index),
                                },
                              ]}
                            />
                          </div>
                          <div className="order-value">#{index + 1}</div>
                        </td>
                        <td data-label="Tipo">
                          <input
                            className="form-input"
                            list={TIPO_DATALIST_ID}
                            value={item.item_type}
                            placeholder="Selecione um tipo"
                            onChange={(e) => updateItem(index, { item_type: e.target.value })}
                          />
                        </td>
                        <td data-label="Cidade">
                          <input
                            className="form-input"
                            list={`quote-manual-cidades-${rowKey}`}
                            value={getCidadeInputValue(item, rowKey)}
                            placeholder="Buscar cidade..."
                            onChange={(e) => handleCidadeInputChange(index, e.target.value, rowKey)}
                            onFocus={() =>
                              scheduleCidadeFetch(rowKey, getCidadeInputValue(item, rowKey))
                            }
                          />
                        </td>
                        <td data-label="Destino">
                          <input
                            className="form-input"
                            list={DESTINO_DATALIST_ID}
                            value={item.city_name}
                            onChange={(e) => updateItem(index, { city_name: e.target.value })}
                          />
                        </td>
                        <td data-label="Produto">
                          <input
                            className="form-input"
                            list={`quote-manual-produtos-${rowKey}`}
                            value={item.title}
                            onChange={(e) =>
                              updateItem(index, {
                                title: e.target.value,
                                product_name: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td data-label="Data Início">
                          <input
                            className="form-input"
                            type="date"
                            value={item.start_date || ""}
                            min={dataMinimaInicio}
                            onFocus={selectAllInputOnFocus}
                            onChange={(e) => {
                              const nextStartRaw = e.target.value;
                              const nextStart =
                                nextStartRaw && dataMinimaInicio && nextStartRaw < dataMinimaInicio
                                  ? dataMinimaInicio
                                  : nextStartRaw;
                              const updates: Partial<ManualItem> = { start_date: nextStart };
                              if (item.end_date && nextStart && item.end_date < nextStart) {
                                updates.end_date = nextStart;
                              }
                              updateItem(index, updates);
                            }}
                          />
                        </td>
                        <td data-label="Data Final">
                          <input
                            className="form-input"
                            type="date"
                            value={item.end_date || ""}
                            min={item.start_date || dataMinimaInicio || undefined}
                            onFocus={selectAllInputOnFocus}
                            onChange={(e) => {
                              const nextEnd = e.target.value;
                              const boundedEnd =
                                (item.start_date || dataMinimaInicio) &&
                                nextEnd &&
                                nextEnd < (item.start_date || dataMinimaInicio)
                                  ? item.start_date || dataMinimaInicio
                                  : nextEnd;
                              updateItem(index, { end_date: boundedEnd });
                            }}
                          />
                        </td>
                        <td data-label="Qtd">
                          <input
                            className="form-input"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(index, { quantity: Number(e.target.value) || 1 })
                            }
                          />
                        </td>
                        <td data-label="Total">
                          <input
                            className="form-input"
                            inputMode="decimal"
                            value={getValorInput(rowKey, "total", item.total_amount)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setValorInputs((prev) => ({
                                ...prev,
                                [rowKey]: { ...prev[rowKey], total: raw },
                              }));
                              updateItem(index, { total_amount: normalizeNumber(raw) });
                            }}
                            onBlur={(e) => handleValorBlur(rowKey, "total", e.target.value)}
                          />
                        </td>
                        <td data-label="Taxas">
                          <input
                            className="form-input"
                            inputMode="decimal"
                            value={getValorInput(rowKey, "taxes", item.taxes_amount || 0)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setValorInputs((prev) => ({
                                ...prev,
                                [rowKey]: { ...prev[rowKey], taxes: raw },
                              }));
                              updateItem(index, { taxes_amount: normalizeNumber(raw) });
                            }}
                            onBlur={(e) => handleValorBlur(rowKey, "taxes", e.target.value)}
                          />
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {items.map((item, index) => {
              const rowKey = item.temp_id || `row-${index}`;
              const produtoOptions = buildProdutoSuggestions(item);
              return (
                <React.Fragment key={rowKey}>
                  <datalist id={`quote-manual-cidades-${rowKey}`}>
                    {(cidadeSuggestions[rowKey] || []).map((cidade) => {
                      const label = formatCidadeLabel(cidade);
                      return <option key={cidade.id} value={label} />;
                    })}
                  </datalist>
                  <datalist id={`quote-manual-produtos-${rowKey}`}>
                    {produtoOptions.map((produto) => (
                      <option key={`${rowKey}-${produto}`} value={produto} />
                    ))}
                  </datalist>
                </React.Fragment>
              );
            })}
            <datalist id={TIPO_DATALIST_ID}>
              {tipoOptions.map((tipo) => (
                <option key={tipo.id} value={tipo.label} />
              ))}
            </datalist>
            <datalist id={DESTINO_DATALIST_ID}>
              {destinoOptions.map((destino) => (
                <option key={destino} value={destino} />
              ))}
            </datalist>
          </div>
        </AppCard>

        <div className="vtur-form-actions">
          <AppButton type="button" variant="secondary" onClick={adicionarItem} disabled={saving}>
            Adicionar item
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={limparItens} disabled={saving}>
            Limpar itens
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={handleCancel} disabled={saving}>
            Cancelar
          </AppButton>
          <AppButton
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            loading={saving}
          >
            {saving ? "Salvando..." : "Salvar orcamento"}
          </AppButton>
        </div>

        <ConfirmDialog
          open={Boolean(itemParaExcluir)}
          title="Excluir item"
          message={`Confirma a exclusão de ${itemParaExcluir?.label || "este item"}?`}
          confirmLabel="Excluir"
          confirmVariant="danger"
          onCancel={() => setItemParaExcluir(null)}
          onConfirm={confirmarRemocaoItem}
        />
      </div>
    </AppPrimerProvider>
  );
}
