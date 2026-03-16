import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { formatDateBR } from "../../lib/format";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";

type PlanoRow = {
  id: string;
  nome: string;
  valor_mensal: number;
  moeda: string;
  ativo: boolean;
};

type BillingRow = {
  id: string;
  company_id: string;
  plan_id: string | null;
  status: string;
  valor_mensal: number | null;
  ultimo_pagamento: string | null;
  proximo_vencimento: string | null;
  companies?: {
    nome_fantasia: string;
    cnpj: string;
  } | null;
  plan?: PlanoRow | null;
};

type BillingEvent = {
  id: string;
  tipo: string;
  status: string;
  valor: number | null;
  moeda: string;
  referencia: string | null;
  vencimento: string | null;
  pago_em: string | null;
  created_at: string;
};

type BillingForm = {
  plan_id: string;
  status: string;
  valor_mensal: string;
  ultimo_pagamento: string;
  proximo_vencimento: string;
};

const statusLabels: Record<string, string> = {
  active: "Ativa",
  trial: "Trial",
  past_due: "Atrasada",
  suspended: "Suspensa",
  canceled: "Cancelada",
};

const statusColors: Record<string, string> = {
  active: "#22c55e",
  trial: "#0ea5e9",
  past_due: "#eab308",
  suspended: "#f97316",
  canceled: "#ef4444",
};

const defaultForm: BillingForm = {
  plan_id: "",
  status: "trial",
  valor_mensal: "",
  ultimo_pagamento: "",
  proximo_vencimento: "",
};

function formatarData(d: string | null) {
  if (!d) return "—";
  return formatDateBR(d);
}

function formatarValor(v: number | null) {
  if (!v && v !== 0) return "—";
  return `R$ ${v.toFixed(2)}`;
}

function toDateInput(d: string | null) {
  if (!d) return "";
  return d.slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) {
    result.setDate(0);
  }
  return result;
}

const FinanceiroAdminIsland: React.FC = () => {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminFinanceiro") || can("AdminDashboard") || can("Admin");

  const [registros, setRegistros] = useState<BillingRow[]>([]);
  const [planos, setPlanos] = useState<PlanoRow[]>([]);
  const [eventos, setEventos] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<BillingForm>(defaultForm);
  const [selecionado, setSelecionado] = useState<BillingRow | null>(null);

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const planosAtivos = useMemo(() => planos.filter((p) => p.ativo), [planos]);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      setLoading(true);
      setErro(null);

      const [billingRes, plansRes] = await Promise.all([
        supabase
          .from("company_billing")
          .select(
            `
          id,
          company_id,
          plan_id,
          status,
          valor_mensal,
          ultimo_pagamento,
          proximo_vencimento,
          companies (nome_fantasia, cnpj),
          plan:plans (id, nome, valor_mensal, moeda, ativo)
        `
          )
          .order("proximo_vencimento", { ascending: true }),
        supabase
          .from("plans")
          .select("id, nome, valor_mensal, moeda, ativo")
          .order("nome", { ascending: true }),
      ]);

      if (billingRes.error || plansRes.error) {
        throw billingRes.error || plansRes.error;
      }

      setRegistros((billingRes.data as BillingRow[]) || []);
      setPlanos((plansRes.data as PlanoRow[]) || []);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar registros financeiros.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarEventos(companyId: string) {
    const { data, error } = await supabase
      .from("company_billing_events")
      .select("id, tipo, status, valor, moeda, referencia, vencimento, pago_em, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error(error);
      return;
    }

    setEventos((data as BillingEvent[]) || []);
  }

  function openModal(row: BillingRow) {
    setSelecionado(row);
    setForm({
      plan_id: row.plan_id || "",
      status: row.status || "trial",
      valor_mensal:
        row.valor_mensal != null
          ? row.valor_mensal.toString()
          : row.plan?.valor_mensal?.toString() || "",
      ultimo_pagamento: toDateInput(row.ultimo_pagamento),
      proximo_vencimento: toDateInput(row.proximo_vencimento),
    });
    setEventos([]);
    carregarEventos(row.company_id);
    setModalOpen(true);
  }

  async function inserirEventos(events: Array<Partial<BillingEvent>>) {
    if (!events.length) return;
    const payload = events.map((event) => ({
      company_id: selecionado?.company_id,
      billing_id: selecionado?.id,
      tipo: event.tipo || "update",
      status: event.status || "pending",
      valor: event.valor ?? null,
      moeda: event.moeda || "BRL",
      referencia: event.referencia || null,
      vencimento: event.vencimento || null,
      pago_em: event.pago_em || null,
    }));

    const { error } = await supabase.from("company_billing_events").insert(payload);
    if (error) {
      console.error(error);
      showToast("Não foi possível salvar o histórico financeiro.", "error");
    }
  }

  async function salvarCobranca(e?: React.FormEvent, override?: Partial<BillingForm>) {
    if (e) e.preventDefault();
    if (!selecionado) return;
    setSalvando(true);
    setErro(null);

    try {
      const mergedForm = { ...form, ...(override || {}) };
      const valorNumero = mergedForm.valor_mensal ? Number(mergedForm.valor_mensal) : null;
      const payload = {
        plan_id: mergedForm.plan_id || null,
        status: mergedForm.status,
        valor_mensal: valorNumero != null && Number.isFinite(valorNumero) ? valorNumero : null,
        ultimo_pagamento: mergedForm.ultimo_pagamento || null,
        proximo_vencimento: mergedForm.proximo_vencimento || null,
      };

      const { error } = await supabase
        .from("company_billing")
        .update(payload)
        .eq("id", selecionado.id);

      if (error) throw error;

      const events: Array<Partial<BillingEvent>> = [];

      if (selecionado.plan_id !== payload.plan_id) {
        const planName = planos.find((p) => p.id === payload.plan_id)?.nome || "—";
        events.push({
          tipo: "plan_changed",
          status: payload.status,
          referencia: `Plano: ${planName}`,
        });
      }

      if (selecionado.status !== payload.status) {
        events.push({
          tipo: "status_changed",
          status: payload.status,
          referencia: `Status: ${payload.status}`,
        });
      }

      if (payload.ultimo_pagamento && payload.ultimo_pagamento !== selecionado.ultimo_pagamento) {
        events.push({
          tipo: "payment_registered",
          status: "paid",
          valor: payload.valor_mensal ?? undefined,
          vencimento: payload.proximo_vencimento || undefined,
          pago_em: new Date(payload.ultimo_pagamento).toISOString(),
          referencia: "Pagamento registrado",
        });
      }

      await inserirEventos(events);
      showToast("Cobrança atualizada.", "success");
      setModalOpen(false);
      setSelecionado(null);
      setEventos([]);
      await carregarDados();
    } catch (e) {
      console.error(e);
      setErro("Erro ao atualizar cobrança.");
    } finally {
      setSalvando(false);
    }
  }

  async function registrarPagamentoHoje() {
    if (!selecionado) return;

    const today = new Date();
    const next = addMonths(today, 1);
    const todayStr = today.toISOString().slice(0, 10);
    const nextStr = next.toISOString().slice(0, 10);

    const planValue = planos.find((p) => p.id === form.plan_id)?.valor_mensal;
    const valorNumero = form.valor_mensal ? Number(form.valor_mensal) : planValue ?? null;

    const override: Partial<BillingForm> = {
      status: "active",
      ultimo_pagamento: todayStr,
      proximo_vencimento: nextStr,
      valor_mensal: valorNumero != null ? valorNumero.toString() : "",
    };

    setForm((prev) => ({ ...prev, ...override }));
    await salvarCobranca(undefined, override);
  }

  async function atualizarStatus(row: BillingRow, status: string) {
    try {
      const { error } = await supabase
        .from("company_billing")
        .update({ status })
        .eq("id", row.id);

      if (error) throw error;

      await supabase.from("company_billing_events").insert({
        company_id: row.company_id,
        billing_id: row.id,
        tipo: "status_changed",
        status,
        referencia: `Status: ${status}`,
      });

      await carregarDados();
    } catch (e) {
      console.error(e);
      showToast("Erro ao atualizar status financeiro.", "error");
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <AppCard tone="config" className="admin-page admin-financeiro-page">
        Apenas administradores podem acessar o financeiro.
      </AppCard>
    );
  }

  return (
    <div className="mt-6 admin-page admin-financeiro-page">
      <AppCard
        tone="config"
        className="list-toolbar-sticky"
        title="Controle financeiro"
        subtitle="Status, planos e cobrancas das empresas."
      />

      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}

      {loading ? (
        <AppCard tone="config">Carregando financeiro...</AppCard>
      ) : (
        <AppCard tone="config">
          {registros.length === 0 ? (
            <EmptyState title="Nenhuma cobranca encontrada" />
          ) : (
            <DataTable
              className="table-header-blue table-mobile-cards min-w-[860px]"
              headers={
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Ult. pagamento</th>
                  <th>Prox. vencimento</th>
                  <th>Valor</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              colSpan={8}
            >
              {registros.map((r) => (
                <tr key={r.id}>
                  <td data-label="Empresa">{r.companies?.nome_fantasia || "—"}</td>
                  <td data-label="CNPJ">{r.companies?.cnpj || "—"}</td>
                  <td data-label="Plano">{r.plan?.nome || "—"}</td>
                  <td data-label="Status">
                    <span className="font-bold capitalize" style={{ color: statusColors[r.status] }}>
                      {statusLabels[r.status] || r.status}
                    </span>
                  </td>
                  <td data-label="Ult. pagamento">{formatarData(r.ultimo_pagamento)}</td>
                  <td data-label="Prox. vencimento">{formatarData(r.proximo_vencimento)}</td>
                  <td data-label="Valor">{formatarValor(r.valor_mensal)}</td>
                  <td className="th-actions" data-label="Ações">
                    <div className="action-buttons">
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() => openModal(r)}
                        title="Editar cobranca"
                        aria-label="Editar cobranca"
                      >
                        <i className="pi pi-pencil" aria-hidden="true" />
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => atualizarStatus(r, "active")}
                        disabled={r.status === "active"}
                        style={{ color: statusColors.active }}
                        title="Ativar cobrança"
                        aria-label="Ativar cobrança"
                      >
                        <i className="pi pi-check-circle" aria-hidden="true" />
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => atualizarStatus(r, "past_due")}
                        disabled={r.status === "past_due"}
                        style={{ color: statusColors.past_due }}
                        title="Marcar cobrança em atraso"
                        aria-label="Marcar cobrança em atraso"
                      >
                        <i className="pi pi-clock" aria-hidden="true" />
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => atualizarStatus(r, "suspended")}
                        disabled={r.status === "suspended"}
                        style={{ color: statusColors.suspended }}
                        title="Suspender cobrança"
                        aria-label="Suspender cobrança"
                      >
                        <i className="pi pi-ban" aria-hidden="true" />
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="danger"
                        onClick={() => atualizarStatus(r, "canceled")}
                        disabled={r.status === "canceled"}
                        title="Cancelar cobrança"
                        aria-label="Cancelar cobrança"
                      >
                        <i className="pi pi-times-circle" aria-hidden="true" />
                      </AppButton>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </AppCard>
      )}

      {modalOpen && selecionado && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form className="w-full max-w-2xl" onSubmit={salvarCobranca}>
            <AppCard
              tone="config"
              title={`Cobranca: ${selecionado.companies?.nome_fantasia || "Empresa"}`}
              actions={
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={salvando}
                >
                  Fechar
                </AppButton>
              }
            >

            <div className="form-row">
              <AppField
                as="select"
                wrapperClassName="form-group flex-1"
                label="Plano"
                value={form.plan_id}
                onChange={(e) => {
                  const nextPlanId = e.target.value;
                  const planValue = planosAtivos.find((p) => p.id === nextPlanId)?.valor_mensal;
                  setForm((prev) => ({
                    ...prev,
                    plan_id: nextPlanId,
                    valor_mensal:
                      prev.valor_mensal || planValue == null ? prev.valor_mensal : planValue.toString(),
                  }));
                }}
                options={[
                  { value: "", label: "Sem plano" },
                  ...planosAtivos.map((p) => ({
                    value: p.id,
                    label: `${p.nome} (${p.moeda} ${p.valor_mensal.toFixed(2)})`,
                  })),
                ]}
              />
              <AppField
                as="select"
                wrapperClassName="form-group flex-1"
                label="Status"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                options={Object.keys(statusLabels).map((key) => ({
                  value: key,
                  label: statusLabels[key],
                }))}
              />
              <AppField
                as="input"
                type="number"
                min="0"
                step="0.01"
                wrapperClassName="form-group flex-1"
                label="Valor mensal"
                value={form.valor_mensal}
                onChange={(e) => setForm((prev) => ({ ...prev, valor_mensal: e.target.value }))}
              />
            </div>

            <div className="form-row">
              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group flex-1"
                label="Ultimo pagamento"
                value={form.ultimo_pagamento}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => setForm((prev) => ({ ...prev, ultimo_pagamento: e.target.value }))}
              />
              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group flex-1"
                label="Proximo vencimento"
                value={form.proximo_vencimento}
                onFocus={selectAllInputOnFocus}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, proximo_vencimento: e.target.value }))
                }
              />
            </div>

            {eventos.length > 0 && (
              <AppCard tone="info" className="mt-3" title="Historico recente">
                <div className="max-h-48 overflow-y-auto">
                  {eventos.map((ev) => (
                    <div key={ev.id} className="text-sm py-1 border-b border-slate-800">
                      <strong>{ev.tipo}</strong> • {formatarData(ev.created_at)}
                      {ev.valor != null && (
                        <span> • {formatarValor(ev.valor)}</span>
                      )}
                      {ev.referencia && <span> • {ev.referencia}</span>}
                    </div>
                  ))}
                </div>
              </AppCard>
            )}

            <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
              <AppButton type="submit" variant="primary" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={registrarPagamentoHoje}
                disabled={salvando}
              >
                Registrar pagamento hoje
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setModalOpen(false)}
                disabled={salvando}
              >
                Cancelar
              </AppButton>
            </div>
            </AppCard>
          </form>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default FinanceiroAdminIsland;
