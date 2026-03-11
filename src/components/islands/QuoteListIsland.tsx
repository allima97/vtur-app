import React, { useEffect, useMemo, useState } from "react";
import { Dialog } from "../ui/primer/legacyCompat";
import { normalizeText } from "../../lib/normalizeText";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";
import { matchesCpfSearch } from "../../lib/searchNormalization";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";

type QuoteItemRow = {
  id: string;
  title?: string | null;
  product_name?: string | null;
  item_type?: string | null;
  quantity?: number | null;
  total_amount?: number | null;
  order_index?: number | null;
};

type QuoteRow = {
  id: string;
  status: string;
  status_negociacao?: string | null;
  total: number | null;
  currency: string | null;
  created_at: string;
  client_id?: string | null;
  client_name?: string | null;
  client_whatsapp?: string | null;
  client_email?: string | null;
  last_interaction_at?: string | null;
  last_interaction_notes?: string | null;
  cliente?: { id: string; nome?: string | null; cpf?: string | null } | null;
  quote_item?: QuoteItemRow[] | null;
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function formatDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toInteractionTimestamp(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function buildItemLabel(item: QuoteItemRow) {
  const title = (item.title || "").trim();
  const product = (item.product_name || "").trim();
  const type = (item.item_type || "").trim();
  return title || product || type || "-";
}

const STATUS_OPTIONS = ["Enviado", "Negociando", "Fechado", "Perdido"];

export default function QuoteListIsland() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [deletandoId, setDeletandoId] = useState<string | null>(null);
  const [visualizandoQuote, setVisualizandoQuote] = useState<QuoteRow | null>(null);
  const [exportingQuoteId, setExportingQuoteId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [interacaoQuote, setInteracaoQuote] = useState<QuoteRow | null>(null);
  const [quoteParaExcluir, setQuoteParaExcluir] = useState<QuoteRow | null>(null);
  const [interactionDate, setInteractionDate] = useState("");
  const [interactionNotes, setInteractionNotes] = useState("");
  const [interactionSaving, setInteractionSaving] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function carregar() {
      setLoading(true);
      setErro(null);
      try {
        const response = await fetch("/api/v1/orcamentos/list");
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Erro ao carregar orcamentos.");
        }
        const data = (await response.json()) as QuoteRow[];
        if (!active) return;
        setQuotes((data || []) as QuoteRow[]);
      } catch (err) {
        console.error("Erro ao carregar orcamentos:", err);
        if (!active) return;
        setErro("Nao foi possivel carregar os orcamentos.");
      } finally {
        if (active) setLoading(false);
      }
    }
    carregar();
    return () => {
      active = false;
    };
  }, []);

  const quotesFiltrados = useMemo(() => {
    const termoRaw = busca.trim();
    const termo = normalizeText(termoRaw);
    return quotes.filter((quote) => {
      const statusAtual = quote.status_negociacao || "Enviado";
      if (statusFiltro !== "all" && statusAtual !== statusFiltro) return false;
      if (!termo) return true;
      const clienteNome = quote.client_name || quote.cliente?.nome || "";
      const clienteCpf = quote.cliente?.cpf || "";
      const itens = (quote.quote_item || [])
        .map((item) => [item.item_type, item.title].filter(Boolean).join(" "))
        .join(" ");
      const haystack = normalizeText(
        [clienteNome, clienteCpf, statusAtual, itens, quote.id].filter(Boolean).join(" ")
      );
      return haystack.includes(termo) || matchesCpfSearch(clienteCpf, termoRaw);
    });
  }, [quotes, busca, statusFiltro]);
  const quotesExibidos = useMemo(() => {
    const mostrarTodos = busca.trim().length > 0 || statusFiltro !== "all";
    return mostrarTodos ? quotesFiltrados : quotesFiltrados.slice(0, 5);
  }, [quotesFiltrados, busca, statusFiltro]);
  const resumoLista = useMemo(() => {
    const fechados = quotes.filter((quote) =>
      normalizeText(quote.status_negociacao || "Enviado") === "fechado"
    ).length;
    const negociando = quotes.filter((quote) =>
      normalizeText(quote.status_negociacao || "Enviado") === "negociando"
    ).length;
    return `${quotesFiltrados.length} orcamentos no recorte atual · ${negociando} negociando · ${fechados} fechados`;
  }, [quotes, quotesFiltrados]);

  async function handleExportPdf(quoteId: string) {
    setExportError(null);
    setExportingQuoteId(quoteId);
    try {
      await new Promise<void>((resolve) => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => resolve());
          return;
        }
        setTimeout(resolve, 0);
      });
      const { exportQuotePdfById } = await import("../../lib/quote/exportQuotePdfClient");
      await exportQuotePdfById({ quoteId, showItemValues: false, showSummary: false });
    } catch (err: any) {
      console.error("Erro ao exportar PDF:", err);
      setExportError(err?.message || "Nao foi possivel gerar o PDF.");
    } finally {
      setExportingQuoteId(null);
    }
  }

  async function excluirQuote(id: string) {
    setDeletandoId(id);
    setErro(null);
    try {
      const response = await fetch("/api/v1/orcamentos/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao excluir orcamento.");
      }
      setQuotes((prev) => prev.filter((quote) => quote.id !== id));
    } catch (err) {
      console.error("Erro ao excluir orcamento:", err);
      setErro("Nao foi possivel excluir o orcamento.");
    } finally {
      setDeletandoId(null);
    }
  }

  function solicitarExclusao(quote: QuoteRow) {
    setQuoteParaExcluir(quote);
  }

  async function confirmarExclusao() {
    if (!quoteParaExcluir) return;
    await excluirQuote(quoteParaExcluir.id);
    setQuoteParaExcluir(null);
  }

  async function atualizarStatus(id: string, status: string) {
    setErro(null);
    try {
      const response = await fetch("/api/v1/orcamentos/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao atualizar status.");
      }
      setQuotes((prev) =>
        prev.map((quote) =>
          quote.id === id ? { ...quote, status_negociacao: status } : quote
        )
      );
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      setErro("Nao foi possivel atualizar o status.");
    }
  }

  function abrirInteracaoModal(quote: QuoteRow) {
    setInteracaoQuote(quote);
    setInteractionDate(formatDateInput(quote.last_interaction_at));
    setInteractionNotes(quote.last_interaction_notes || "");
    setInteractionError(null);
  }

  function converterParaVenda(id: string) {
    if (typeof window === "undefined") return;
    window.location.href = `/vendas/cadastro?orcamentoId=${id}`;
  }

  async function salvarInteracao() {
    if (!interacaoQuote) return;
    setInteractionSaving(true);
    setInteractionError(null);
    try {
      const payload = {
        last_interaction_at: interactionDate ? toInteractionTimestamp(interactionDate) : null,
        last_interaction_notes: interactionNotes.trim() || null,
      };
      const response = await fetch("/api/v1/orcamentos/interaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: interacaoQuote.id, ...payload }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao salvar ultima interacao.");
      }
      const json = (await response.json()) as { payload?: typeof payload };
      const nextPayload = json.payload || payload;
      setQuotes((prev) =>
        prev.map((quote) =>
          quote.id === interacaoQuote.id ? { ...quote, ...nextPayload } : quote
        )
      );
      setInteracaoQuote((prev) => (prev ? { ...prev, ...nextPayload } : prev));
      setInteracaoQuote(null);
    } catch (err) {
      console.error("Erro ao salvar ultima interacao:", err);
      setInteractionError("Nao foi possivel salvar a ultima interacao.");
    } finally {
      setInteractionSaving(false);
    }
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap orcamentos-consulta-page">
        <AppToolbar
          sticky
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Base de orcamentos"
          subtitle={resumoLista}
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              label="Buscar"
              placeholder="Cliente, item, status ou ID..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              caption="Busque por nome do cliente, CPF, itens do orcamento, status ou identificador."
            />
            <AppField
              as="select"
              label="Status"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
              options={[
                { value: "all", label: "Todos" },
                ...STATUS_OPTIONS.map((status) => ({ value: status, label: status })),
              ]}
              caption="Filtre a carteira por etapa atual da negociacao."
            />
          </div>
        </AppToolbar>

        {erro && (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        )}
        {exportError && (
          <AlertMessage variant="error" className="mb-3">
            {exportError}
          </AlertMessage>
        )}

        <AppCard
          tone="config"
          title="Orcamentos recentes"
          subtitle="Acompanhe itens, negociacao, ultima interacao comercial e proximos passos de cada proposta."
        >
          <DataTable
            className="table-mobile-cards table-header-blue quote-list-table"
            containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
            headers={
              <tr>
                <th>Cliente</th>
                <th>Itens</th>
                <th>Status</th>
                <th>Total</th>
                <th>Criado</th>
                <th>Ultima interacao</th>
                <th className="th-actions" style={{ textAlign: "center" }}>
                  Acoes
                </th>
              </tr>
            }
            loading={loading}
            loadingMessage="Carregando orcamentos..."
            empty={!loading && quotesExibidos.length === 0}
            emptyMessage={
              <EmptyState
                title="Nenhum orcamento encontrado"
                description={
                  busca.trim() || statusFiltro !== "all"
                    ? "Ajuste os filtros para localizar propostas existentes."
                    : "Os orcamentos mais recentes aparecerao aqui assim que forem criados ou importados."
                }
              />
            }
            colSpan={7}
          >
            {quotesExibidos.map((quote) => {
              const itens = quote.quote_item || [];
              const itensOrdenados = [...itens].sort(
                (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
              );
              const itensLabel = itens.length
                ? itensOrdenados.map((item) => buildItemLabel(item))
                : [];
              const statusAtual = quote.status_negociacao || "Enviado";
              const isFechado = normalizeText(statusAtual) === "fechado";
              const clienteLabel =
                quote.client_name ||
                quote.cliente?.nome ||
                (quote.client_id ? "Cliente" : "-");

              const actions = [
                {
                  key: "interaction",
                  label: "CRM",
                  variant: "light" as const,
                  onClick: () => abrirInteracaoModal(quote),
                  title: quote.last_interaction_at
                    ? `Ultima interacao: ${formatDateTime(quote.last_interaction_at)}`
                    : "Registrar ultima interacao",
                },
                {
                  key: "sale",
                  label: "Venda",
                  variant: "primary" as const,
                  onClick: () => converterParaVenda(quote.id),
                  disabled: isFechado,
                  title: "Converter em venda",
                },
                {
                  key: "view",
                  label: "Abrir",
                  variant: "ghost" as const,
                  onClick: () => setVisualizandoQuote(quote),
                  title: "Visualizar orcamento",
                },
                {
                  key: "pdf",
                  label: exportingQuoteId === quote.id ? "..." : "PDF",
                  variant: "light" as const,
                  onClick: () => handleExportPdf(quote.id),
                  disabled: exportingQuoteId === quote.id,
                  title: "Visualizar PDF",
                },
                ...(!isFechado
                  ? [
                      {
                        key: "edit",
                        label: "Editar",
                        variant: "ghost" as const,
                        onClick: () => {
                          if (typeof window !== "undefined") {
                            window.location.href = `/orcamentos/${quote.id}`;
                          }
                        },
                        title: "Editar orcamento",
                      },
                    ]
                  : []),
                {
                  key: "delete",
                  label: deletandoId === quote.id ? "..." : "Excluir",
                  variant: "danger" as const,
                  onClick: () => solicitarExclusao(quote),
                  disabled: deletandoId === quote.id,
                  title: "Excluir orcamento",
                },
              ];

              return (
                <tr key={quote.id}>
                  <td data-label="Cliente">{clienteLabel}</td>
                  <td data-label="Itens">
                    {itensLabel.length === 0 ? (
                      "-"
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {itensLabel.map((item, idx) => (
                          <span key={`${quote.id}-item-${idx}`}>{item}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td data-label="Status">
                    <select
                      className="form-input"
                      value={statusAtual}
                      onChange={(e) => atualizarStatus(quote.id, e.target.value)}
                      disabled={isFechado}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Total">{formatCurrency(Number(quote.total || 0))}</td>
                  <td data-label="Criado">{formatDate(quote.created_at)}</td>
                  <td data-label="Ultima interacao">
                    {quote.last_interaction_at ? formatDate(quote.last_interaction_at) : "-"}
                  </td>
                  <td className="th-actions th-actions-quote" data-label="Acoes">
                    <TableActions actions={actions} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </AppCard>

        {interacaoQuote && (
          <Dialog
            title="Ultima interacao"
            width="large"
            onClose={() => setInteracaoQuote(null)}
            footerButtons={[
              {
                content: "Cancelar",
                buttonType: "default",
                onClick: () => setInteracaoQuote(null),
                disabled: interactionSaving,
              },
              {
                content: interactionSaving ? "Salvando..." : "Salvar",
                buttonType: "primary",
                onClick: salvarInteracao,
                disabled: interactionSaving,
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                tone="info"
                title={interacaoQuote.client_name || interacaoQuote.cliente?.nome || "-"}
                subtitle={`Status ${interacaoQuote.status_negociacao || "Enviado"} · Total ${formatCurrency(
                  Number(interacaoQuote.total || 0)
                )}`}
              >
                <div className="vtur-form-grid vtur-form-grid-2">
                  <AppField
                    label="Data do ultimo contato"
                    type="date"
                    value={interactionDate}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => setInteractionDate(e.target.value)}
                  />
                  <AppField
                    as="textarea"
                    label="Notas"
                    rows={4}
                    value={interactionNotes}
                    onChange={(e) => setInteractionNotes(e.target.value)}
                    placeholder="Descreva o ultimo contato..."
                  />
                </div>
              </AppCard>

              <AppCard title="Itens do orcamento" subtitle="Resumo rapido dos itens vinculados a esta proposta.">
                {interacaoQuote.quote_item && interacaoQuote.quote_item.length > 0 ? (
                  <div className="vtur-modal-list">
                    {[...(interacaoQuote.quote_item || [])]
                      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                      .map((item) => (
                        <div key={`${interacaoQuote.id}-${item.id}`} className="vtur-modal-list-item">
                          {buildItemLabel(item)}
                        </div>
                      ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Sem itens vinculados"
                    description="Este orcamento nao possui itens listados para exibir no historico."
                  />
                )}
              </AppCard>

              {interactionError && (
                <AlertMessage variant="error">{interactionError}</AlertMessage>
              )}
            </div>
          </Dialog>
        )}

        {visualizandoQuote && (
          <Dialog
            title={visualizandoQuote.client_name || visualizandoQuote.cliente?.nome || "-"}
            width="large"
            onClose={() => setVisualizandoQuote(null)}
            footerButtons={[
              {
                content: "Fechar",
                buttonType: "primary",
                onClick: () => setVisualizandoQuote(null),
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                tone="info"
                title="Resumo do orcamento"
                subtitle={`Status ${visualizandoQuote.status_negociacao || "Enviado"} · Total ${formatCurrency(
                  Number(visualizandoQuote.total || 0)
                )}`}
              />

              <AppCard title="Itens" subtitle="Itens principais da proposta selecionada.">
                <DataTable
                  headers={
                    <tr>
                      <th>Item</th>
                      <th>Qtd</th>
                      <th>Total</th>
                    </tr>
                  }
                  empty={!visualizandoQuote.quote_item || visualizandoQuote.quote_item.length === 0}
                  emptyMessage="Nenhum item encontrado."
                  colSpan={3}
                  className="table-mobile-cards table-header-blue"
                >
                  {(visualizandoQuote.quote_item || []).map((item) => (
                    <tr key={`${visualizandoQuote.id}-${item.id}`}>
                      <td data-label="Item">{buildItemLabel(item)}</td>
                      <td data-label="Qtd">{item.quantity || 1}</td>
                      <td data-label="Total">
                        {formatCurrency(Number(item.total_amount || 0))}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </AppCard>
            </div>
          </Dialog>
        )}

        <ConfirmDialog
          open={Boolean(quoteParaExcluir)}
          title="Excluir orcamento"
          message="Excluir este orcamento? Esta acao nao pode ser desfeita."
          confirmLabel={deletandoId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(deletandoId)}
          onCancel={() => setQuoteParaExcluir(null)}
          onConfirm={confirmarExclusao}
        />
      </div>
    </AppPrimerProvider>
  );
}
