import React, { useEffect, useMemo, useRef, useState } from "react";
import { extractCvcQuoteFromText } from "../../lib/quote/cvcPdfExtractor";
import { saveQuoteDraft } from "../../lib/quote/saveQuoteDraft";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
import { formatNumberBR } from "../../lib/format";
import { matchesCpfSearch, onlyDigits } from "../../lib/searchNormalization";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import type { ImportResult, QuoteDraft, QuoteItemDraft } from "../../lib/quote/types";
import FlightDetailsModal, { FlightDetails } from "../ui/FlightDetailsModal";
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

function normalizeCityName(value: string) {
  return normalizeText(value || "").trim();
}

function cleanPaisNome(pais: string): string {
  // Remove caracteres de encoding quebrado (ex: â€, â€“ etc)
  return pais.replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac\u00e2\u0080\u0093\u0094\u0098\u0099]+/g, "")
    .replace(/[â€˜â€™â€œâ€â€¢â€“â€”â€]/g, "")
    .replace(/[\uFFFD]+/g, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .trim();
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

function isSeguroItem(item: QuoteItemDraft) {
  const normalized = normalizeText(item.item_type || "");
  return normalized.includes("seguro") && normalized.includes("viagem");
}

function normalizeTitleText(value: string) {
  return titleCaseWithExceptions(value || "");
}

function normalizeImportedItemText(item: QuoteItemDraft) {
  if (!item) return item;
  if (isSeguroItem(item)) {
    return {
      ...item,
      title: "SEGURO VIAGEM",
      product_name: "SEGURO VIAGEM",
      city_name: item.city_name ? normalizeTitleText(item.city_name) : item.city_name,
    };
  }
  const title = item.title ? normalizeTitleText(item.title) : item.title;
  const product = item.product_name ? normalizeTitleText(item.product_name) : item.product_name;
  const city = item.city_name ? normalizeTitleText(item.city_name) : item.city_name;
  return {
    ...item,
    title: title || item.title,
    product_name: product || item.product_name,
    city_name: city || item.city_name,
  };
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

const IMPORT_TIPO_DATALIST_ID = "quote-import-tipos-list";

function validateItem(item: QuoteItemDraft) {
  return Boolean(
    item.item_type &&
      item.quantity > 0 &&
      item.start_date &&
      item.title &&
      item.total_amount > 0
  );
}

function isCircuitItem(item: QuoteItemDraft) {
  return normalizeText(item.item_type) === "circuito";
}

function isFlightItem(item: QuoteItemDraft) {
  const normalized = normalizeText(item.item_type || "");
  return (
    normalized.includes("aereo") ||
    normalized.includes("passagem") ||
    normalized.includes("voo") ||
    normalized.includes("a+h")
  );
}

function getFlightDetails(item: QuoteItemDraft): FlightDetails | null {
  const raw = (item.raw || {}) as { flight_details?: FlightDetails };
  return raw.flight_details || null;
}

type ImportMode = "produtos" | "circuitos" | "circuitos_produtos";

const IMPORT_MODE_OPTIONS: { value: ImportMode; label: string }[] = [
  { value: "produtos", label: "Produtos" },
  { value: "circuitos", label: "CIRCUITOS" },
  { value: "circuitos_produtos", label: "CIRCUITOS + Produtos" },
];

type CircuitMeta = {
  codigo?: string;
  serie?: string;
  itinerario?: string[];
  tags?: string[];
};

function getCircuitMeta(item: QuoteItemDraft): CircuitMeta {
  const raw = (item.raw || {}) as { circuito_meta?: CircuitMeta };
  return raw.circuito_meta || {};
}

function filtrarItensImportacao(items: QuoteItemDraft[], modo: ImportMode) {
  if (modo === "circuitos") {
    return items.filter((item) => isCircuitItem(item));
  }
  if (modo === "produtos") {
    return items.filter((item) => !isCircuitItem(item));
  }
  return items;
}

export default function QuoteImportIsland() {
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState("");
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [debug, setDebug] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("produtos");
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [mostrarSugestoesCliente, setMostrarSugestoesCliente] = useState(false);
  const [clientesErro, setClientesErro] = useState<string | null>(null);
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  const [tipoOptions, setTipoOptions] = useState<TipoProdutoOption[]>([]);
  const [cidadeSuggestions, setCidadeSuggestions] = useState<Record<string, CidadeOption[]>>({});
  const [cidadeInputValues, setCidadeInputValues] = useState<Record<string, string>>({});
  const [cidadeCache, setCidadeCache] = useState<Record<string, string>>({});
  const [cidadeNameMap, setCidadeNameMap] = useState<Record<string, string>>({});
  const [flightModal, setFlightModal] = useState<{ details: FlightDetails; title?: string } | null>(null);
  const cidadeFetchTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      Object.values(cidadeFetchTimeouts.current).forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setDebug(params.has("debug"));
  }, []);

  useEffect(() => {
    let active = true;
    async function carregarTipos() {
      try {
        const { data, error } = await supabaseBrowser
          .from("tipo_produtos")
          .select("id, nome, tipo")
          .order("nome", { ascending: true })
          .limit(500);
        if (!active) return;
        if (error) {
          console.warn("[QuoteImport] Falha ao carregar tipos", error);
          return;
        }
        setTipoOptions(
          (data || [])
            .filter((tipo) => tipo && (tipo.nome || tipo.tipo))
            .map((tipo) => {
              const label = tipo.nome?.trim() || tipo.tipo?.trim() || "";
              return { id: tipo.id, label };
            })
            .filter((tipo) => tipo.label)
        );
      } catch (err) {
        if (!active) return;
        console.warn("[QuoteImport] Erro ao carregar tipos", err);
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
        const { data, error } = await supabaseBrowser
          .from("clientes")
          .select("id, nome, cpf, whatsapp, email")
          .order("nome", { ascending: true })
          .limit(1000);
        if (error) throw error;
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

  async function loadCidadeSuggestions(rowKey: string, term: string) {
    const search = term.trim();
    const limit = 25;
    let cidades: CidadeOption[] = [];
    try {
      const { data, error } = await supabaseBrowser.rpc("buscar_cidades", { q: search, limite: limit });
      if (!error && Array.isArray(data)) {
        cidades = (data as CidadeOption[]).filter((cidade) => cidade?.id && cidade.nome);
      } else if (error) {
        console.warn("[QuoteImport] RPC buscar_cidades falhou, tentando fallback.", error);
      }
    } catch (err) {
      console.warn("[QuoteImport] Erro ao buscar cidades (RPC)", err);
    }

    if (!cidades.length) {
      const pattern = search ? `%${search}%` : "%";
      try {
        const { data, error } = await supabaseBrowser
          .from("cidades")
          .select("id, nome")
          .ilike("nome", pattern)
          .order("nome", { ascending: true })
          .limit(limit);
        if (!isMountedRef.current) return;
        if (error) {
          console.warn("[QuoteImport] Falha ao buscar cidades", error);
          setCidadeSuggestions((prev) => ({ ...prev, [rowKey]: [] }));
          return;
        }
        cidades = (data || []).filter((cidade) => cidade?.id && cidade.nome);
      } catch (err) {
        if (!isMountedRef.current) return;
        console.warn("[QuoteImport] Erro ao buscar cidades", err);
        setCidadeSuggestions((prev) => ({ ...prev, [rowKey]: [] }));
        return;
      }
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

  function getCidadeInputValue(item: QuoteItemDraft, rowKey: string) {
    if (Object.prototype.hasOwnProperty.call(cidadeInputValues, rowKey)) {
      return cidadeInputValues[rowKey] || "";
    }
    if (item.cidade_id) {
      return cidadeCache[item.cidade_id] || "";
    }
    const raw = item.raw as { city_label?: string } | undefined;
    return raw?.city_label ? normalizeTitleText(raw.city_label) : "";
  }

  function handleCidadeInputChange(index: number, value: string, rowKey: string) {
    if (!draft) return;
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
    if (!clienteBusca.trim()) return [];
    const termo = normalizeText(clienteBusca);
    return clientes.filter((c) => {
      if (normalizeText(c.nome).includes(termo)) return true;
      if (matchesCpfSearch(c.cpf || "", clienteBusca)) return true;
      return false;
    }).slice(0, 10);
  }, [clientes, clienteBusca]);

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) || null,
    [clientes, clienteId]
  );
  const itensImportados = draft?.items.length || 0;
  const itensPendentesRevisao = useMemo(
    () => (draft?.items || []).filter((item) => item.confidence < 0.7 || !validateItem(item)).length,
    [draft]
  );
  const circuitosImportados = useMemo(
    () => (draft?.items || []).filter((item) => isCircuitItem(item)).length,
    [draft]
  );
  const contextoCliente = useMemo(() => {
    if (!clienteSelecionado) {
      return "Selecione o cliente correto antes de confirmar o orcamento importado.";
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
  const modoImportacaoLabel = useMemo(
    () => IMPORT_MODE_OPTIONS.find((option) => option.value === importMode)?.label || "Produtos",
    [importMode]
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
    setTimeout(() => setMostrarSugestoesCliente(false), 150);
    if (!clienteBusca.trim()) return;
    const texto = normalizeText(clienteBusca);
    const cpfTexto = onlyDigits(clienteBusca);
    const achado = clientes.find((c) => {
      const cpf = onlyDigits(c.cpf || "");
      return normalizeText(c.nome) === texto || (cpfTexto && cpf === cpfTexto);
    });
    if (achado) {
      setClienteId(achado.id);
      setClienteBusca("");
    }
  }

  const canExtractInput = Boolean(textInput.trim());

  function updateDraftItems(items: QuoteItemDraft[]) {
    if (!draft) return;
    const ordered = items.map((item, index) =>
      normalizeImportedItemText({
        ...item,
        order_index: index,
        taxes_amount: Number(item.taxes_amount || 0),
      })
    );
    const subtotal = ordered.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const taxesTotal = ordered.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0);
    const total = subtotal + taxesTotal;
    const avgConf = ordered.length
      ? ordered.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / ordered.length
      : 0;
    setDraft({
      ...draft,
      items: ordered,
      total,
      average_confidence: avgConf,
    });
  }

  async function handleExtract() {
    setExtracting(true);
    setError(null);
    setSuccessId(null);
    setStatus("Iniciando importacao...");
    try {
      let result: ImportResult | null = null;
      const rawText = textInput.trim();
      if (!rawText) {
        setError("Cole o texto do orcamento para importar.");
        setExtracting(false);
        return;
      }
      const textFile = new File([rawText], `orcamento-texto-${Date.now()}.txt`, {
        type: "text/plain",
      });
      setFile(textFile);
      setStatus("Processando texto...");
      result = await extractCvcQuoteFromText(rawText, {
        debug,
        onProgress: (message) => setStatus(message),
      });

      if (!result) {
        setError("Falha ao extrair itens.");
        return;
      }
      setImportResult(result);
      const filteredItems = filtrarItensImportacao(result.draft.items, importMode);
      const orderedItems = filteredItems.map((item, index) =>
        normalizeImportedItemText({
          ...item,
          cidade_id: item.cidade_id || null,
          order_index: index,
          taxes_amount: Number(item.taxes_amount || 0),
        })
      );
      const subtotal = orderedItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      const taxesTotal = orderedItems.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0);
      const total = subtotal + taxesTotal;
      const avgConf = orderedItems.length
        ? orderedItems.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / orderedItems.length
        : 0;
      setDraft({
        ...result.draft,
        items: orderedItems,
        total,
        average_confidence: avgConf,
      });
      setCidadeInputValues({});
      setCidadeSuggestions({});
      setCidadeCache({});
      setCidadeNameMap({});
      setStatus("Extracao concluida.");
    } catch (err: any) {
      setError(err?.message || "Erro ao extrair itens.");
    } finally {
      setExtracting(false);
    }
  }

  function handleCancel() {
    if (typeof window !== "undefined") {
      window.location.href = "/orcamentos/consulta";
    }
  }

  async function handleSave() {
    if (!draft || !file) return;
    if (!clienteId) {
      setError("Selecione um cliente antes de salvar.");
      return;
    }
    const clienteSelecionado = clientes.find((c) => c.id === clienteId) || null;
    setSaving(true);
    setError(null);
    setSuccessId(null);
    try {
      const result = await saveQuoteDraft({
        draft,
        file,
        clientId: clienteId,
        clientName: clienteSelecionado?.nome || clienteBusca.trim() || null,
        clientWhatsapp: clienteSelecionado?.whatsapp || null,
        clientEmail: clienteSelecionado?.email || null,
        importResult: importResult || undefined,
        debug,
      });
      setSuccessId(result.quote_id);
      setStatus(`Salvo como ${result.status}.`);
      if (typeof window !== "undefined") {
        window.location.href = "/orcamentos/consulta";
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar quote.");
    } finally {
      setSaving(false);
    }
  }

  function updateItem(index: number, updates: Partial<QuoteItemDraft>) {
    if (!draft) return;
    const next = draft.items.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item, ...updates };
      const quantity = Math.max(1, Math.round(Number(updated.quantity) || 1));
      const total = Number(updated.total_amount) || 0;
      const unitPrice = quantity > 0 ? total / quantity : total;
      return {
        ...updated,
        quantity,
        total_amount: total,
        unit_price: unitPrice,
      };
    });
    updateDraftItems(next);
  }

  function updateCircuitMeta(index: number, updates: Partial<CircuitMeta>) {
    if (!draft) return;
    const item = draft.items[index];
    if (!item) return;
    const meta = { ...getCircuitMeta(item), ...updates };
    const itinerario = meta.itinerario?.filter(Boolean) || [];
    updateItem(index, {
      raw: { ...item.raw, circuito_meta: meta },
      city_name: itinerario.length ? itinerario.join(" - ") : item.city_name,
    });
  }

  function updateCircuitSegments(
    index: number,
    updater: (segments: QuoteItemDraft["segments"]) => QuoteItemDraft["segments"]
  ) {
    if (!draft) return;
    const item = draft.items[index];
    if (!item) return;
    const currentDays = (item.segments || []).filter((seg) => seg.segment_type === "circuit_day");
    const otherSegments = (item.segments || []).filter((seg) => seg.segment_type !== "circuit_day");
    const nextDays = updater(currentDays).map((seg, idx) => ({
      ...seg,
      order_index: idx,
    }));
    updateItem(index, { segments: [...otherSegments, ...nextDays] });
  }

  function moveItem(index: number, direction: "up" | "down") {
    if (!draft) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= draft.items.length) return;
    const next = [...draft.items];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    updateDraftItems(next);
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap">
        <AppToolbar
          sticky
          tone="info"
          className="mb-3 list-toolbar-sticky"
          title="Importacao de orcamentos CVC"
          subtitle="Cole o texto do orcamento, revise os itens extraidos e confirme antes de salvar no CRM."
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton type="button" variant="secondary" onClick={handleCancel} disabled={extracting}>
                Cancelar
              </AppButton>
              <AppButton
                type="button"
                variant="primary"
                onClick={handleExtract}
                disabled={!canExtractInput || extracting}
                loading={extracting}
              >
                {extracting ? "Extraindo..." : "Extrair itens"}
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
              <span className="vtur-quote-summary-label">Modo</span>
              <strong>{modoImportacaoLabel}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Itens importados</span>
              <strong>{itensImportados}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Pendentes de revisao</span>
              <strong>{itensPendentesRevisao}</strong>
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
          title="Fonte da importacao"
          subtitle={contextoCliente}
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <div className="vtur-city-picker">
              <AppField
                label="Cliente *"
                placeholder="Buscar cliente por nome ou CPF..."
                autoComplete="off"
                value={clienteSelecionado?.nome || clienteBusca}
                onChange={(e) => handleClienteInputChange(e.target.value)}
                onFocus={() => setMostrarSugestoesCliente(true)}
                onBlur={handleClienteBlur}
                required
                caption={
                  carregandoClientes
                    ? "Carregando clientes..."
                    : "Selecione o cliente final antes de salvar o orcamento importado."
                }
                validation={!carregandoClientes ? clientesErro ?? undefined : undefined}
              />
              {mostrarSugestoesCliente && clienteBusca.trim().length >= 1 && (
                <div className="vtur-city-dropdown vtur-quote-client-dropdown">
                  {clientesFiltrados.length === 0 ? (
                    <div className="vtur-city-helper">Nenhum cliente encontrado.</div>
                  ) : (
                    clientesFiltrados.map((c) => (
                      <AppButton
                        key={c.id}
                        type="button"
                        variant={clienteId === c.id ? "primary" : "secondary"}
                        className="vtur-city-option"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setClienteId(c.id);
                          setClienteBusca("");
                          setMostrarSugestoesCliente(false);
                        }}
                      >
                        <span className="vtur-choice-button-content">
                          <span className="vtur-choice-button-title">{c.nome}</span>
                          {c.cpf ? (
                            <span className="vtur-choice-button-caption">CPF {c.cpf}</span>
                          ) : null}
                        </span>
                      </AppButton>
                    ))
                  )}
                </div>
              )}
            </div>

            <AppField
              as="select"
              label="Tipo de importacao"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as ImportMode)}
              options={IMPORT_MODE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              caption="Escolha se a leitura deve considerar somente produtos, somente circuitos ou ambos."
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <AppField
              as="textarea"
              label="Texto do orcamento"
              rows={10}
              placeholder="Cole aqui o texto do orcamento"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              caption="A importacao monta um rascunho revisavel. Voce pode ajustar tipo, cidade, datas, quantidades e valores antes de confirmar."
            />
          </div>

          <div className="vtur-form-actions">
            <AppButton
              type="button"
              variant="primary"
              onClick={handleExtract}
              disabled={!canExtractInput || extracting}
              loading={extracting}
            >
              {extracting ? "Extraindo..." : "Extrair itens"}
            </AppButton>
            <AppButton type="button" variant="secondary" onClick={handleCancel} disabled={extracting}>
              Cancelar
            </AppButton>
          </div>
        </AppCard>

        {draft && (
          <AppCard
            tone="config"
            title="Preview dos itens"
            subtitle={`Total estimado R$ ${formatCurrency(draft.total)} · ${circuitosImportados} circuitos · ${itensPendentesRevisao} linhas em revisao`}
            actions={
              <AppButton
                type="button"
                variant="primary"
                onClick={handleSave}
                disabled={saving || !draft.items.length || !file}
                loading={saving}
              >
                {saving ? "Salvando..." : "Confirmar e salvar"}
              </AppButton>
            }
          >
            <div className="vtur-inline-note">
              Linhas destacadas precisam de revisao. Ajuste datas, cidade, destino, produto e valores antes de confirmar.
            </div>

            <div className="table-container overflow-x-auto" style={{ marginTop: 16 }}>
              <table className="table-default table-compact table-mobile-cards quote-items-table">
                <thead>
                  <tr>
                    <th className="order-cell">Ordem</th>
                    <th>Tipo</th>
                    <th>Produto</th>
                    <th>Cidade</th>
                    <th>Destino</th>
                    <th>Data Início</th>
                    <th>Data Final</th>
                    <th>Qtd</th>
                    <th>Total</th>
                    <th>Taxas</th>
                    <th>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, index) => {
                    const needsReview = item.confidence < 0.7 || !validateItem(item);
                    const circuitMeta = getCircuitMeta(item);
                    const circuitDays = (item.segments || [])
                      .filter((seg) => seg.segment_type === "circuit_day")
                      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                    const rowKey = item.temp_id || `row-${index}`;
                    const flightDetails = isFlightItem(item) ? getFlightDetails(item) : null;

                    return (
                      <React.Fragment key={item.temp_id}>
                        <tr className={needsReview ? "vtur-quote-review-row" : undefined}>
                          <td className="order-cell" data-label="">
                            <div className="order-cell-head">
                              <span className="order-label">Ordem</span>
                              <TableActions
                                className="vtur-quote-order-actions"
                                actions={[
                                  {
                                    key: "up",
                                    label: "Mover para cima",
                                    icon: "pi pi-arrow-up",
                                    variant: "ghost",
                                    onClick: () => moveItem(index, "up"),
                                    disabled: index === 0,
                                  },
                                  {
                                    key: "down",
                                    label: "Mover para baixo",
                                    icon: "pi pi-arrow-down",
                                    variant: "ghost",
                                    onClick: () => moveItem(index, "down"),
                                    disabled: index === draft.items.length - 1,
                                  },
                                ]}
                              />
                            </div>
                            <div className="order-value">#{index + 1}</div>
                          </td>
                          <td data-label="Tipo">
                            <input
                              className="form-input"
                              list={IMPORT_TIPO_DATALIST_ID}
                              value={item.item_type}
                              placeholder="Selecione um tipo"
                              onChange={(e) => updateItem(index, { item_type: e.target.value })}
                            />
                          </td>
                          <td data-label="Produto">
                            <input
                              className="form-input"
                              value={item.title}
                              onChange={(e) =>
                                updateItem(index, {
                                  title: e.target.value,
                                  product_name: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td data-label="Cidade">
                            <input
                              className="form-input"
                              list={`quote-import-cidades-${rowKey}`}
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
                              value={item.city_name}
                              onChange={(e) => updateItem(index, { city_name: e.target.value })}
                            />
                          </td>
                          <td data-label="Data Início">
                            <input
                              className="form-input"
                              type="date"
                              value={item.start_date || ""}
                              onFocus={selectAllInputOnFocus}
                              onChange={(e) => {
                                const nextStart = e.target.value;
                                const updates: Partial<QuoteItemDraft> = { start_date: nextStart };
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
                              min={item.start_date || undefined}
                              onFocus={selectAllInputOnFocus}
                              onChange={(e) => {
                                const nextEnd = e.target.value;
                                const boundedEnd =
                                  item.start_date && nextEnd && nextEnd < item.start_date
                                    ? item.start_date
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
                              value={formatCurrency(item.total_amount)}
                              onChange={(e) =>
                                updateItem(index, { total_amount: normalizeNumber(e.target.value) })
                              }
                            />
                          </td>
                          <td data-label="Taxas">
                            <input
                              className="form-input"
                              value={formatCurrency(item.taxes_amount || 0)}
                              onChange={(e) =>
                                updateItem(index, { taxes_amount: normalizeNumber(e.target.value) })
                              }
                            />
                          </td>
                          <td data-label="Detalhes">
                            {flightDetails ? (
                              <AppButton
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  setFlightModal({
                                    details: flightDetails,
                                    title: item.title || item.product_name || item.item_type,
                                  })
                                }
                              >
                                Ver detalhes
                              </AppButton>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                        {isCircuitItem(item) && (
                          <tr>
                            <td colSpan={11}>
                              <div className="vtur-quote-circuit-panel">
                                <div className="vtur-form-grid vtur-form-grid-3">
                                  <AppField
                                    label="Codigo"
                                    value={circuitMeta.codigo || ""}
                                    onChange={(e) => updateCircuitMeta(index, { codigo: e.target.value })}
                                  />
                                  <AppField
                                    label="Serie"
                                    value={circuitMeta.serie || ""}
                                    onChange={(e) => updateCircuitMeta(index, { serie: e.target.value })}
                                  />
                                  <AppField
                                    as="textarea"
                                    label="Tags"
                                    rows={2}
                                    value={(circuitMeta.tags || []).join("\n")}
                                    caption="Uma tag por linha."
                                    onChange={(e) =>
                                      updateCircuitMeta(index, {
                                        tags: e.target.value
                                          .split(/\r?\n/)
                                          .map((val) => val.trim())
                                          .filter(Boolean),
                                      })
                                    }
                                  />
                                </div>

                                <div style={{ marginTop: 16 }}>
                                  <AppField
                                    as="textarea"
                                    label="Itinerario"
                                    rows={3}
                                    caption="Uma cidade por linha para compor o circuito."
                                    value={(circuitMeta.itinerario || []).join("\n")}
                                    onChange={(e) =>
                                      updateCircuitMeta(index, {
                                        itinerario: e.target.value
                                          .split(/\r?\n/)
                                          .map((val) => val.trim())
                                          .filter(Boolean),
                                      })
                                    }
                                  />
                                </div>

                                <div className="vtur-quote-circuit-days-head">
                                  <div>
                                    <strong>Dia a dia</strong>
                                    <p>Estruture a sequencia do circuito com titulo e descricao de cada etapa.</p>
                                  </div>
                                  <AppButton
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      updateCircuitSegments(index, (segments) => [
                                        ...segments,
                                        {
                                          segment_type: "circuit_day",
                                          order_index: segments.length,
                                          data: { dia: segments.length + 1, titulo: "", descricao: "" },
                                        },
                                      ])
                                    }
                                  >
                                    Adicionar dia
                                  </AppButton>
                                </div>

                                <div className="vtur-quote-circuit-days-list">
                                  {circuitDays.map((seg, segIndex) => {
                                    const data = (seg.data || {}) as {
                                      dia?: number;
                                      titulo?: string;
                                      descricao?: string;
                                    };
                                    return (
                                      <div
                                        key={`circuit-${item.temp_id}-${segIndex}`}
                                        className="vtur-quote-circuit-day"
                                      >
                                        <div className="vtur-form-grid vtur-form-grid-3">
                                          <AppField
                                            label="Dia"
                                            type="number"
                                            min={1}
                                            value={String(data.dia ?? segIndex + 1)}
                                            onChange={(e) =>
                                              updateCircuitSegments(index, (segments) =>
                                                segments.map((segmento, i) =>
                                                  i === segIndex
                                                    ? {
                                                        ...segmento,
                                                        data: {
                                                          ...(segmento.data || {}),
                                                          dia: Number(e.target.value) || segIndex + 1,
                                                        },
                                                      }
                                                    : segmento
                                                )
                                              )
                                            }
                                          />
                                          <AppField
                                            label="Cidade / Titulo"
                                            value={data.titulo || ""}
                                            onChange={(e) =>
                                              updateCircuitSegments(index, (segments) =>
                                                segments.map((segmento, i) =>
                                                  i === segIndex
                                                    ? {
                                                        ...segmento,
                                                        data: {
                                                          ...(segmento.data || {}),
                                                          titulo: e.target.value,
                                                        },
                                                      }
                                                    : segmento
                                                )
                                              )
                                            }
                                          />
                                          <div className="vtur-quote-circuit-day-actions">
                                            <TableActions
                                              actions={[
                                                {
                                                  key: "up",
                                                  label: "Subir dia",
                                                  icon: "pi pi-arrow-up",
                                                  variant: "ghost",
                                                  onClick: () =>
                                                    updateCircuitSegments(index, (segments) => {
                                                      if (segIndex === 0) return segments;
                                                      const next = [...segments];
                                                      const [removed] = next.splice(segIndex, 1);
                                                      next.splice(segIndex - 1, 0, removed);
                                                      return next;
                                                    }),
                                                  disabled: segIndex === 0,
                                                },
                                                {
                                                  key: "down",
                                                  label: "Descer dia",
                                                  icon: "pi pi-arrow-down",
                                                  variant: "ghost",
                                                  onClick: () =>
                                                    updateCircuitSegments(index, (segments) => {
                                                      if (segIndex >= segments.length - 1) return segments;
                                                      const next = [...segments];
                                                      const [removed] = next.splice(segIndex, 1);
                                                      next.splice(segIndex + 1, 0, removed);
                                                      return next;
                                                    }),
                                                  disabled: segIndex >= circuitDays.length - 1,
                                                },
                                                {
                                                  key: "remove",
                                                  label: "Remover dia",
                                                  icon: "pi pi-times",
                                                  variant: "danger",
                                                  onClick: () =>
                                                    updateCircuitSegments(index, (segments) =>
                                                      segments.filter((_, i) => i !== segIndex)
                                                    ),
                                                },
                                              ]}
                                            />
                                          </div>
                                        </div>

                                        <div style={{ marginTop: 16 }}>
                                          <AppField
                                            as="textarea"
                                            label="Descricao"
                                            rows={3}
                                            value={data.descricao || ""}
                                            onChange={(e) =>
                                              updateCircuitSegments(index, (segments) =>
                                                segments.map((segmento, i) =>
                                                  i === segIndex
                                                    ? {
                                                        ...segmento,
                                                        data: {
                                                          ...(segmento.data || {}),
                                                          descricao: e.target.value,
                                                        },
                                                      }
                                                    : segmento
                                                )
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {draft.items.map((item, index) => {
                const rowKey = item.temp_id || `row-${index}`;
                return (
                  <datalist key={rowKey} id={`quote-import-cidades-${rowKey}`}>
                    {(cidadeSuggestions[rowKey] || []).map((cidade) => {
                      const label = formatCidadeLabel(cidade);
                      return <option key={cidade.id} value={label} />;
                    })}
                  </datalist>
                );
              })}
              <datalist id={IMPORT_TIPO_DATALIST_ID}>
                {tipoOptions.map((tipo) => (
                  <option key={tipo.id} value={tipo.label} />
                ))}
              </datalist>
            </div>

            <div className="vtur-form-actions">
              <AppButton
                type="button"
                variant="primary"
                onClick={handleSave}
                disabled={saving || !draft.items.length || !file}
                loading={saving}
              >
                {saving ? "Salvando..." : "Confirmar e salvar"}
              </AppButton>
            </div>
          </AppCard>
        )}

        {flightModal && (
          <FlightDetailsModal
            details={flightModal.details}
            title={flightModal.title || "Detalhes do voo"}
            onClose={() => setFlightModal(null)}
          />
        )}
      </div>
    </AppPrimerProvider>
  );
}
