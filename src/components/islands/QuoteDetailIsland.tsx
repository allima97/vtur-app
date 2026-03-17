import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { formatNumberBR } from "../../lib/format";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import FlightDetailsModal, { FlightDetails } from "../ui/FlightDetailsModal";
import CalculatorModal from "../ui/CalculatorModal";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type QuoteRecord = {
  id: string;
  status: string;
  status_negociacao?: string | null;
  currency: string;
  total: number;
  created_at?: string | null;
  average_confidence?: number | null;
  source_file_path?: string | null;
  source_file_url?: string | null;
  client_id?: string | null;
  cliente?: { id: string; nome?: string | null; cpf?: string | null } | null;
};

type QuoteItemRecord = {
  id: string;
  item_type: string;
  title: string | null;
  product_name: string | null;
  city_name: string | null;
  cidade_id?: string | null;
  cidade?: { id: string; nome?: string | null } | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  taxes_amount?: number | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  confidence: number | null;
  order_index?: number | null;
  raw?: Record<string, unknown> | null;
  segments?: QuoteItemSegmentRecord[] | null;
};

type QuoteItemSegmentRecord = {
  id?: string;
  segment_type: string;
  data: Record<string, unknown>;
  order_index?: number | null;
};

type QuoteDetailTipoProdutoOption = {
  id: string;
  label: string;
};

type ClienteOption = {
  id: string;
  nome: string;
};

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return formatNumberBR(value, 2);
}

function normalizeNumber(value: string) {
  const cleaned = value.replace(/[^0-9,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLookupText(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCityName(value: string) {
  return normalizeLookupText(value);
}

function getQuoteItemRowKey(item: QuoteItemRecord, index: number) {
  return item.id || `quote-item-${index}`;
}

const TIPO_DATALIST_ID = "quote-item-tipos-list";
const QUOTE_CLIENTES_DATALIST_ID = "quote-clientes-list";

function isCircuitItem(item: QuoteItemRecord) {
  return (item.item_type || "").trim().toLowerCase() === "circuito";
}

function isFlightItem(item: QuoteItemRecord) {
  const normalized = normalizeLookupText(item.item_type || "");
  return (
    normalized.includes("aereo") ||
    normalized.includes("passagem") ||
    normalized.includes("voo") ||
    normalized.includes("a+h")
  );
}

function getFlightDetails(item: QuoteItemRecord): FlightDetails | null {
  const raw = (item.raw || {}) as { flight_details?: FlightDetails };
  return raw.flight_details || null;
}

type CircuitMeta = {
  codigo?: string;
  serie?: string;
  itinerario?: string[];
  tags?: string[];
};

function getCircuitMeta(item: QuoteItemRecord): CircuitMeta {
  const raw = (item.raw || {}) as { circuito_meta?: CircuitMeta };
  return raw.circuito_meta || {};
}

function validateItem(item: QuoteItemRecord) {
  return Boolean(
    item.item_type &&
      item.quantity > 0 &&
      item.start_date &&
      item.title &&
      item.total_amount > 0
  );
}

export default function QuoteDetailIsland(props: {
  quote: QuoteRecord;
  items: QuoteItemRecord[];
}) {
  const isFechado = normalizeLookupText(props.quote.status_negociacao || "") === "fechado";
  const [items, setItems] = useState<QuoteItemRecord[]>(
    (props.items || []).map((item, index) => ({
      ...item,
      taxes_amount: Number(item.taxes_amount || 0),
      raw: item.raw || {},
      segments: item.segments || [],
      order_index: typeof item.order_index === "number" ? item.order_index : index,
    }))
  );
  const [status, setStatus] = useState(props.quote.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [itemParaExcluir, setItemParaExcluir] = useState<{ index: number; label?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [exportDiscount, setExportDiscount] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [flightModal, setFlightModal] = useState<{ details: FlightDetails; title?: string } | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const subtotalAtual = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    [items]
  );
  const taxesAtual = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0),
    [items]
  );
  const totalAtual = useMemo(() => subtotalAtual, [subtotalAtual]);
  const totalGeralAtual = useMemo(() => subtotalAtual + taxesAtual, [subtotalAtual, taxesAtual]);
  const descontoAtual = useMemo(() => normalizeNumber(exportDiscount), [exportDiscount]);
  const [cidadeInputValues, setCidadeInputValues] = useState<Record<string, string>>({});
  const [cidadeSuggestions, setCidadeSuggestions] = useState<
    Record<string, { id: string; nome: string }[]>
  >({});
  const [cidadeCache, setCidadeCache] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    props.items.forEach((item) => {
      if (item.cidade_id && item.cidade?.nome) {
        initial[item.cidade_id] = item.cidade.nome;
      }
    });
    return initial;
  });
  const [cidadeNameMap, setCidadeNameMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    props.items.forEach((item) => {
      if (item.cidade_id && item.cidade?.nome) {
        initial[normalizeCityName(item.cidade.nome)] = item.cidade_id;
      }
    });
    return initial;
  });
  const fetchTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      Object.values(fetchTimeouts.current).forEach((timeout) => clearTimeout(timeout));
    };
  }, []);
  useEffect(() => {
    setCidadeCache((prev) => {
      const next = { ...prev };
      props.items.forEach((item) => {
        if (item.cidade_id && item.cidade?.nome) {
          next[item.cidade_id] = item.cidade.nome;
        }
      });
      return next;
    });
    setCidadeNameMap((prev) => {
      const next = { ...prev };
      props.items.forEach((item) => {
        if (item.cidade_id && item.cidade?.nome) {
          next[normalizeCityName(item.cidade.nome)] = item.cidade_id;
        }
      });
      return next;
    });
    setRemovedItemIds([]);
  }, [props.items]);

  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clienteBusca, setClienteBusca] = useState(props.quote.cliente?.nome || "");
  const [clienteId, setClienteId] = useState(props.quote.client_id || "");
  useEffect(() => {
    setClienteBusca(props.quote.cliente?.nome || "");
    setClienteId(props.quote.client_id || "");
  }, [props.quote.cliente?.nome, props.quote.client_id]);
  useEffect(() => {
    let active = true;
    async function carregarClientes() {
      try {
        const response = await fetch("/api/v1/orcamentos/clientes");
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro ao carregar clientes.");
        }
        const data = (await response.json()) as ClienteOption[];
        if (!active) return;
        setClientes((data || []).filter((cliente) => cliente?.id && cliente.nome));
      } catch (err) {
        if (!active) return;
        console.warn("[QuoteDetail] Erro ao carregar clientes", err);
      }
    }
    carregarClientes();
    return () => {
      active = false;
    };
  }, []);

  const [tipoOptions, setTipoOptions] = useState<QuoteDetailTipoProdutoOption[]>([]);
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
        console.warn("[QuoteDetail] Erro ao carregar tipos", err);
      }
    }
    carregarTipos();
    return () => {
      active = false;
    };
  }, []);

  const canConfirm = useMemo(() => {
    if (!items.length) return false;
    return items.every(validateItem);
  }, [items]);
  const itensPendentesRevisao = useMemo(
    () => items.filter((item) => !validateItem(item)).length,
    [items]
  );
  const clienteAssociado = useMemo(
    () => clientes.find((cliente) => cliente.id === clienteId) || null,
    [clientes, clienteId]
  );
  const contextoCliente = useMemo(() => {
    const nome = clienteAssociado?.nome || clienteBusca || props.quote.cliente?.nome || "Cliente nao selecionado";
    const cpf = props.quote.cliente?.cpf ? `CPF ${props.quote.cliente.cpf}` : null;
    const detalhes = [cpf, isFechado ? "Orcamento fechado" : isEditing ? "Edicao liberada" : "Modo leitura"]
      .filter(Boolean)
      .join(" · ");
    return detalhes ? `${nome} · ${detalhes}` : nome;
  }, [clienteAssociado?.nome, clienteBusca, props.quote.cliente?.nome, props.quote.cliente?.cpf, isFechado, isEditing]);
  const statusNegociacao = props.quote.status_negociacao || "Enviado";

  function updateItem(index: number, updates: Partial<QuoteItemRecord>) {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated = { ...current, ...updates };
      const quantity = Math.max(1, Math.round(Number(updated.quantity) || 1));
      const total = Number(updated.total_amount) || 0;
      const unitPrice = quantity > 0 ? total / quantity : total;
      updated.quantity = quantity;
      updated.total_amount = total;
      updated.unit_price = unitPrice;
      next[index] = updated;
      return next;
    });
  }

  async function loadCidadeSuggestions(rowKey: string, term: string) {
    const search = term.trim();
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      params.set("limite", "25");
      const response = await fetch(`/api/v1/orcamentos/cidades-busca?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao carregar cidades.");
      }
      const data = (await response.json()) as { id: string; nome: string }[];
      if (!isMountedRef.current) return;
      const cidades = (data || []).filter((cidade) => cidade?.id && cidade.nome);
      if (!isMountedRef.current) return;
      setCidadeSuggestions((prev) => ({ ...prev, [rowKey]: cidades }));
      if (cidades.length) {
        setCidadeCache((prev) => {
          const next = { ...prev };
          cidades.forEach((cidade) => {
            if (cidade.id && cidade.nome) {
              next[cidade.id] = cidade.nome;
            }
          });
          return next;
        });
        setCidadeNameMap((prev) => {
          const next = { ...prev };
          cidades.forEach((cidade) => {
            if (cidade.id && cidade.nome) {
              const normalized = normalizeCityName(cidade.nome);
              if (!next[normalized]) {
                next[normalized] = cidade.id;
              }
            }
          });
          return next;
        });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.warn("[QuoteDetail] Erro ao buscar cidades", err);
    }
  }

  function scheduleCidadeFetch(rowKey: string, term: string) {
    const existing = fetchTimeouts.current[rowKey];
    if (existing) {
      clearTimeout(existing);
    }
    fetchTimeouts.current[rowKey] = setTimeout(() => loadCidadeSuggestions(rowKey, term), 250);
  }

  function handleClienteInputChange(value: string) {
    setClienteBusca(value);
    const normalized = normalizeLookupText(value);
    const match = clientes.find((cliente) => normalizeLookupText(cliente.nome) === normalized);
    setClienteId(match?.id || "");
  }

  function getCidadeInputValue(item: QuoteItemRecord, rowKey: string) {
    if (!rowKey) return "";
    if (Object.prototype.hasOwnProperty.call(cidadeInputValues, rowKey)) {
      return cidadeInputValues[rowKey] || "";
    }
    if (item.cidade_id) {
      return cidadeCache[item.cidade_id] || item.cidade?.nome || "";
    }
    const raw = (item.raw || {}) as { city_label?: string };
    return item.cidade?.nome || raw.city_label || "";
  }

  function handleCidadeInputChange(index: number, value: string, rowKey: string) {
    const current = items[index];
    if (!current) return;
    const normalized = normalizeCityName(value);
    const matchedId = cidadeNameMap[normalized];
    const matchedCidade =
      cidadeSuggestions[rowKey]?.find((cidade) => normalizeCityName(cidade.nome) === normalized) ||
      Object.entries(cidadeCache)
        .map(([id, nome]) => ({ id, nome }))
        .find((cidade) => normalizeCityName(cidade.nome) === normalized);
    const displayValue = matchedCidade?.nome || value;
    setCidadeInputValues((prev) => ({
      ...prev,
      [rowKey]: displayValue,
    }));
    updateItem(index, { cidade_id: matchedId ?? matchedCidade?.id ?? null });
    if (value.trim().length >= 1) {
      scheduleCidadeFetch(rowKey, value);
    }
  }

  function updateCircuitMeta(index: number, updates: Partial<CircuitMeta>) {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const meta = { ...getCircuitMeta(current), ...updates };
      const itinerario = meta.itinerario?.filter(Boolean) || [];
      next[index] = {
        ...current,
        raw: { ...(current.raw || {}), circuito_meta: meta },
        city_name: itinerario.length ? itinerario.join(" - ") : current.city_name,
      };
      return next;
    });
  }

  function updateCircuitSegments(
    index: number,
    updater: (segments: QuoteItemSegmentRecord[]) => QuoteItemSegmentRecord[]
  ) {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const currentDays = (current.segments || []).filter((seg) => seg.segment_type === "circuit_day");
      const otherSegments = (current.segments || []).filter((seg) => seg.segment_type !== "circuit_day");
      const nextDays = updater(currentDays).map((seg, idx) => ({ ...seg, order_index: idx }));
      next[index] = {
        ...current,
        segments: [...otherSegments, ...nextDays],
      };
      return next;
    });
  }

  function moveItem(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    const reindexed = next.map((item, idx) => ({
      ...item,
      order_index: idx,
    }));
    setItems(reindexed);
  }

  function removerItem(index: number) {
    const current = items[index];
    if (!current) return;
    if (current.id) {
      setRemovedItemIds((prev) =>
        prev.includes(current.id) ? prev : [...prev, current.id]
      );
    }
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((item, idx) => ({ ...item, order_index: idx }));
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

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = items.map((item, index) => ({
        id: item.id,
        item_type: item.item_type,
        title: item.title,
        product_name: item.product_name,
        city_name: item.city_name,
        cidade_id: item.cidade_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_amount: item.total_amount,
        taxes_amount: Number(item.taxes_amount || 0),
        start_date: item.start_date || null,
        end_date: item.end_date || item.start_date || null,
        currency: item.currency || props.quote.currency,
        raw: item.raw || {},
        order_index: typeof item.order_index === "number" ? item.order_index : index,
        segments: item.segments || [],
      }));

      const response = await fetch("/api/v1/orcamentos/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: props.quote.id,
          items: payload,
          removed_item_ids: removedItemIds,
          status,
          client_id: clienteId || null,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao salvar orcamento.");
      }
      const json = (await response.json()) as { status?: string };

      setStatus(json.status || status);
      setSuccess("Atualizado com sucesso.");
      setIsEditing(false);
      setRemovedItemIds([]);
      if (typeof window !== "undefined") {
        window.location.href = "/orcamentos/consulta";
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    if (typeof window !== "undefined") {
      window.location.href = "/orcamentos/consulta";
    }
  }

  const handleExport = useCallback(
    async (showItemValues: boolean) => {
      setExporting(true);
      setExportError(null);
      try {
        const { exportQuotePdfById } = await import("../../lib/quote/exportQuotePdfClient");
        await exportQuotePdfById({
          quoteId: props.quote.id,
          showItemValues,
          showSummary: showItemValues && showSummary,
          discount: descontoAtual,
        });
      } catch (err: any) {
        setExportError(err?.message || "Erro ao exportar PDF.");
      } finally {
        setExporting(false);
      }
    },
    [props.quote.id, showSummary, descontoAtual]
  );

  const autoExportRef = useRef(false);
  useEffect(() => {
    if (isFechado) {
      setIsEditing(false);
    }
  }, [isFechado]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("pdf") === "1") {
      if (autoExportRef.current) return;
      autoExportRef.current = true;
      handleExport(true);
    }
  }, [handleExport]);

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap orcamentos-detalhe-page">
        <AppCard
          tone="info"
          className="mb-3 list-toolbar-sticky"
          title="Detalhe do orcamento"
          subtitle={`Quote ${props.quote.id} · Status operacional ${status} · Negociacao ${statusNegociacao}`}
          actions={
            <div className="vtur-quote-top-actions orcamentos-action-bar">
              <AppButton
                type="button"
                variant="primary"
                onClick={() => handleExport(true)}
                disabled={exporting}
                loading={exporting}
              >
                {exporting ? "Gerando..." : "PDF com valores"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => handleExport(false)}
                disabled={exporting}
              >
                PDF somente total
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
          <div className="vtur-quote-summary-grid">
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Cliente</span>
              <strong>{clienteAssociado?.nome || clienteBusca || "Nao selecionado"}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Itens</span>
              <strong>{items.length}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Taxas</span>
              <strong>R$ {formatCurrency(taxesAtual)}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Total geral</span>
              <strong>R$ {formatCurrency(totalGeralAtual)}</strong>
            </div>
          </div>
        </AppCard>

        {exportError && (
          <AlertMessage variant="error" className="mb-3">
            {exportError}
          </AlertMessage>
        )}
        {!canConfirm && (
          <AlertMessage variant="warning" className="mb-3">
            Alguns itens precisam de ajuste antes de confirmar ou exportar a versao final.
          </AlertMessage>
        )}
        {isFechado && (
          <AlertMessage variant="info" className="mb-3">
            Orcamento fechado: edicao bloqueada.
          </AlertMessage>
        )}
        {error && (
          <AlertMessage variant="error" className="mb-3">
            {error}
          </AlertMessage>
        )}
        {success && (
          <AlertMessage variant="success" className="mb-3">
            {success}
          </AlertMessage>
        )}

        <AppCard
          className="mb-3"
          tone="info"
          title="Cliente e exportacao"
          subtitle={contextoCliente}
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              label="Cliente"
              list={QUOTE_CLIENTES_DATALIST_ID}
              value={clienteBusca}
              onChange={(e) => handleClienteInputChange(e.target.value)}
              disabled={!isEditing}
              placeholder="Selecione um cliente"
              caption={
                isEditing
                  ? "Voce pode reatribuir o orcamento para outro cliente antes de salvar."
                  : "Ative a edicao para alterar o cliente associado."
              }
            />
            <AppField
              label="Desconto"
              value={exportDiscount}
              onChange={(e) => setExportDiscount(e.target.value)}
              placeholder="0,00"
              caption="Aplicado somente no PDF exportado."
            />
          </div>

          <datalist id={QUOTE_CLIENTES_DATALIST_ID}>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.nome} />
            ))}
          </datalist>

          <label
            className={`vtur-modal-checkbox-card${showSummary ? " is-selected" : ""}`}
            style={{ marginTop: 16 }}
          >
            <input
              type="checkbox"
              checked={showSummary}
              onChange={(e) => setShowSummary(e.target.checked)}
            />
            <span className="vtur-choice-button-content">
              <span className="vtur-choice-button-title">Mostrar resumo de servicos</span>
              <span className="vtur-choice-button-caption">
                Inclui o resumo apenas no PDF com valores.
              </span>
            </span>
          </label>
        </AppCard>

        <AppCard
          tone="config"
          title="Itens do orcamento"
          subtitle={`${items.length} linhas · ${itensPendentesRevisao} em revisao · Subtotal R$ ${formatCurrency(totalAtual)}`}
        >
          <div className="vtur-inline-note">
            Revise tipo, cidade, datas, quantidades e totais antes de salvar os ajustes.
          </div>

          <div className="table-container overflow-x-auto" style={{ marginTop: 16 }}>
            <table className="table-default table-compact quote-items-table table-mobile-cards table-header-blue">
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
                {items.map((item, index) => {
                  const circuitMeta = getCircuitMeta(item);
                  const circuitDays = (item.segments || [])
                    .filter((seg) => seg.segment_type === "circuit_day")
                    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                  const rowKey = getQuoteItemRowKey(item, index);
                  const flightDetails = isFlightItem(item) ? getFlightDetails(item) : null;

                  return (
                    <React.Fragment key={rowKey}>
                      <tr className={!validateItem(item) ? "vtur-quote-review-row" : undefined}>
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
                                  disabled: index === 0 || !isEditing,
                                },
                                {
                                  key: "down",
                                  label: "Mover para baixo",
                                  icon: "pi pi-arrow-down",
                                  variant: "ghost",
                                  onClick: () => moveItem(index, "down"),
                                  disabled: index === items.length - 1 || !isEditing,
                                },
                                {
                                  key: "delete",
                                  label: "Excluir item",
                                  icon: "pi pi-times",
                                  variant: "danger",
                                  onClick: () => solicitarRemocaoItem(index),
                                  disabled: !isEditing,
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
                            value={item.item_type || ""}
                            onChange={(e) => updateItem(index, { item_type: e.target.value })}
                            disabled={!isEditing}
                            placeholder="Selecione um tipo"
                          />
                        </td>
                        <td data-label="Produto">
                          <input
                            className="form-input"
                            value={item.title || ""}
                            onChange={(e) =>
                              updateItem(index, { title: e.target.value, product_name: e.target.value })
                            }
                            disabled={!isEditing}
                          />
                        </td>
                        <td data-label="Cidade">
                          <input
                            className="form-input"
                            list={`quote-item-cidades-${rowKey}`}
                            value={getCidadeInputValue(item, rowKey)}
                            onChange={(e) => handleCidadeInputChange(index, e.target.value, rowKey)}
                            onFocus={() =>
                              scheduleCidadeFetch(rowKey, getCidadeInputValue(item, rowKey))
                            }
                            placeholder="Selecione uma cidade"
                            disabled={!isEditing}
                          />
                        </td>
                        <td data-label="Destino">
                          <input
                            className="form-input"
                            value={item.city_name || ""}
                            onChange={(e) => updateItem(index, { city_name: e.target.value })}
                            disabled={!isEditing}
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
                              const updates: Partial<QuoteItemRecord> = { start_date: nextStart };
                              if (item.end_date && nextStart && item.end_date < nextStart) {
                                updates.end_date = nextStart;
                              }
                              updateItem(index, updates);
                            }}
                            disabled={!isEditing}
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
                            disabled={!isEditing}
                          />
                        </td>
                        <td data-label="Qtd">
                          <input
                            className="form-input"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(index, { quantity: Number(e.target.value) || 1 })}
                            disabled={!isEditing}
                          />
                        </td>
                        <td data-label="Total">
                          <input
                            className="form-input"
                            value={formatCurrency(item.total_amount)}
                            onChange={(e) =>
                              updateItem(index, { total_amount: normalizeNumber(e.target.value) })
                            }
                            disabled={!isEditing}
                          />
                        </td>
                        <td data-label="Taxas">
                          <input
                            className="form-input"
                            value={formatCurrency(Number(item.taxes_amount || 0))}
                            onChange={(e) =>
                              updateItem(index, { taxes_amount: normalizeNumber(e.target.value) })
                            }
                            disabled={!isEditing}
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
                                  disabled={!isEditing}
                                />
                                <AppField
                                  label="Serie"
                                  value={circuitMeta.serie || ""}
                                  onChange={(e) => updateCircuitMeta(index, { serie: e.target.value })}
                                  disabled={!isEditing}
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
                                  disabled={!isEditing}
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
                                  disabled={!isEditing}
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
                                  disabled={!isEditing}
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
                                      key={`circuit-${rowKey}-${segIndex}`}
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
                                          disabled={!isEditing}
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
                                          disabled={!isEditing}
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
                                                    if (!isEditing || segIndex === 0) return segments;
                                                    const next = [...segments];
                                                    const [removed] = next.splice(segIndex, 1);
                                                    next.splice(segIndex - 1, 0, removed);
                                                    return next;
                                                  }),
                                                disabled: !isEditing || segIndex === 0,
                                              },
                                              {
                                                key: "down",
                                                label: "Descer dia",
                                                icon: "pi pi-arrow-down",
                                                variant: "ghost",
                                                onClick: () =>
                                                  updateCircuitSegments(index, (segments) => {
                                                    if (!isEditing || segIndex >= segments.length - 1) return segments;
                                                    const next = [...segments];
                                                    const [removed] = next.splice(segIndex, 1);
                                                    next.splice(segIndex + 1, 0, removed);
                                                    return next;
                                                  }),
                                                disabled: !isEditing || segIndex >= circuitDays.length - 1,
                                              },
                                              {
                                                key: "delete",
                                                label: "Remover dia",
                                                icon: "pi pi-times",
                                                variant: "danger",
                                                onClick: () =>
                                                  updateCircuitSegments(index, (segments) =>
                                                    segments.filter((_, i) => i !== segIndex)
                                                  ),
                                                disabled: !isEditing,
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
                                          disabled={!isEditing}
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
            {items.map((item, index) => {
              const rowKey = getQuoteItemRowKey(item, index);
              return (
                <datalist key={rowKey} id={`quote-item-cidades-${rowKey}`}>
                  {(cidadeSuggestions[rowKey] || []).map((cidade) => (
                    <option key={cidade.id} value={cidade.nome} />
                  ))}
                </datalist>
              );
            })}
            <datalist id={TIPO_DATALIST_ID}>
              {tipoOptions.map((tipo) => (
                <option key={tipo.id} value={tipo.label} />
              ))}
            </datalist>
          </div>
        </AppCard>

        <div className="vtur-form-actions">
          {isEditing ? (
            <>
              <AppButton
                type="button"
                variant="primary"
                onClick={handleSave}
                disabled={saving || !isEditing}
                loading={saving}
              >
                {saving ? "Salvando..." : "Salvar ajustes"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Cancelar
              </AppButton>
            </>
          ) : !isFechado ? (
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditing(true);
                setSuccess(null);
                setError(null);
                setShowSummary(false);
              }}
            >
              Editar orcamento
            </AppButton>
          ) : null}
        </div>

        {flightModal && (
          <FlightDetailsModal
            details={flightModal.details}
            title={flightModal.title || "Detalhes do voo"}
            onClose={() => setFlightModal(null)}
          />
        )}
        <ConfirmDialog
          open={Boolean(itemParaExcluir)}
          title="Excluir item"
          message={`Confirma a exclusao de ${itemParaExcluir?.label || "este item"}?`}
          confirmLabel="Excluir"
          confirmVariant="danger"
          onCancel={() => setItemParaExcluir(null)}
          onConfirm={confirmarRemocaoItem}
        />
        <CalculatorModal
          open={showCalculator}
          onClose={() => setShowCalculator(false)}
        />
      </div>
    </AppPrimerProvider>
  );
}
