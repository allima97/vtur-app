import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import { ToastStack, useToastQueue } from "../ui/Toast";

type PlanoRow = {
  id: string;
  nome: string;
  descricao: string | null;
  valor_mensal: number;
  moeda: string;
  ativo: boolean;
};

type PlanoForm = {
  id?: string;
  nome: string;
  descricao: string;
  valor_mensal: string;
  moeda: string;
  ativo: boolean;
};

const defaultForm: PlanoForm = {
  nome: "",
  descricao: "",
  valor_mensal: "",
  moeda: "BRL",
  ativo: true,
};

const PlanosAdminIsland: React.FC = () => {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminPlanos") || can("AdminDashboard") || can("Admin");

  const [planos, setPlanos] = useState<PlanoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PlanoForm>(defaultForm);
  const [salvando, setSalvando] = useState(false);

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    carregarPlanos();
  }, []);

  async function carregarPlanos() {
    try {
      setLoading(true);
      setErro(null);
      const { data, error } = await supabase
        .from("plans")
        .select("id, nome, descricao, valor_mensal, moeda, ativo")
        .order("nome", { ascending: true });
      if (error) throw error;
      setPlanos((data as PlanoRow[]) || []);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar planos.");
    } finally {
      setLoading(false);
    }
  }

  function openModal(plano?: PlanoRow) {
    if (plano) {
      setForm({
        id: plano.id,
        nome: plano.nome,
        descricao: plano.descricao || "",
        valor_mensal: plano.valor_mensal?.toString() || "",
        moeda: plano.moeda || "BRL",
        ativo: plano.ativo,
      });
    } else {
      setForm(defaultForm);
    }
    setModalOpen(true);
  }

  async function salvarPlano(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);

    try {
      const valor = form.valor_mensal.trim();
      const valorNumero = valor ? Number(valor) : 0;

      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        valor_mensal: Number.isFinite(valorNumero) ? valorNumero : 0,
        moeda: form.moeda || "BRL",
        ativo: form.ativo,
      };

      if (!payload.nome) {
        setErro("Informe o nome do plano.");
        return;
      }

      if (form.id) {
        const { error } = await supabase
          .from("plans")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("plans")
          .insert(payload);
        if (error) throw error;
      }

      showToast("Plano salvo com sucesso.", "success");
      setModalOpen(false);
      setForm(defaultForm);
      await carregarPlanos();
    } catch (err) {
      console.error(err);
      setErro("Não foi possível salvar o plano.");
    } finally {
      setSalvando(false);
    }
  }

  async function toggleStatus(plano: PlanoRow) {
    try {
      const { error } = await supabase
        .from("plans")
        .update({ ativo: !plano.ativo })
        .eq("id", plano.id);
      if (error) throw error;
      await carregarPlanos();
    } catch (err) {
      console.error(err);
      showToast("Erro ao atualizar status do plano.", "error");
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <AppCard tone="config" className="admin-page admin-planos-page">
        Apenas administradores podem acessar os planos.
      </AppCard>
    );
  }

  return (
    <div className="admin-page admin-planos-page">
      <AppCard
        tone="config"
        className="mb-3"
        title="Planos do sistema"
        subtitle="Cadastro e configuracao de planos."
        actions={
          <AppButton type="button" variant="primary" onClick={() => openModal()}>
            Novo plano
          </AppButton>
        }
      />

      {erro && (
        <AlertMessage variant="error">{erro}</AlertMessage>
      )}

      {loading ? (
        <AppCard tone="config">Carregando planos...</AppCard>
      ) : (
        <AppCard tone="config">
          <DataTable
            className="table-header-blue table-mobile-cards min-w-[720px]"
            headers={
              <tr>
                <th>Plano</th>
                <th>Descricao</th>
                <th>Valor mensal</th>
                <th>Moeda</th>
                <th>Ativo</th>
                <th className="th-actions">Ações</th>
              </tr>
            }
            colSpan={6}
            empty={planos.length === 0}
            emptyMessage="Nenhum plano cadastrado."
          >
            {planos.map((p) => (
              <tr key={p.id}>
                <td data-label="Plano">{p.nome}</td>
                <td data-label="Descricao">{p.descricao || "-"}</td>
                <td data-label="Valor mensal">R$ {p.valor_mensal.toFixed(2)}</td>
                <td data-label="Moeda">{p.moeda}</td>
                <td
                  data-label="Ativo"
                  className={p.ativo ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}
                >
                  {p.ativo ? "Sim" : "Nao"}
                </td>
                <td className="th-actions" data-label="Ações">
                  <div className="action-buttons">
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => openModal(p)}
                      title="Editar plano"
                      aria-label="Editar plano"
                    >
                      <i className="pi pi-pencil" aria-hidden="true" />
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={() => toggleStatus(p)}
                      title={p.ativo ? "Desativar plano" : "Ativar plano"}
                      aria-label={p.ativo ? "Desativar plano" : "Ativar plano"}
                    >
                      <i className={p.ativo ? "pi pi-times-circle" : "pi pi-check-circle"} aria-hidden="true" />
                    </AppButton>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form
            className="w-full max-w-xl"
            onSubmit={salvarPlano}
          >
            <AppCard
              tone="config"
              title={form.id ? "Editar plano" : "Novo plano"}
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
              <AppField
                as="input"
                label="Nome"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                required
              />

              <AppField
                as="textarea"
                label="Descricao"
                rows={3}
                value={form.descricao}
                onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
              />

              <div className="form-row">
                <AppField
                  as="input"
                  type="number"
                  min="0"
                  step="0.01"
                  label="Valor mensal"
                  wrapperClassName="form-group flex-1"
                  value={form.valor_mensal}
                  onChange={(e) => setForm((prev) => ({ ...prev, valor_mensal: e.target.value }))}
                />
                <AppField
                  as="select"
                  label="Moeda"
                  wrapperClassName="form-group flex-1"
                  value={form.moeda}
                  onChange={(e) => setForm((prev) => ({ ...prev, moeda: e.target.value }))}
                  options={[
                    { value: "BRL", label: "BRL" },
                    { value: "USD", label: "USD" },
                    { value: "EUR", label: "EUR" },
                  ]}
                />
                <AppField
                  as="select"
                  label="Ativo?"
                  wrapperClassName="form-group flex-1"
                  value={form.ativo ? "true" : "false"}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ativo: e.target.value === "true" }))
                  }
                  options={[
                    { value: "true", label: "Sim" },
                    { value: "false", label: "Nao" },
                  ]}
                />
              </div>

              <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
                <AppButton type="submit" variant="primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
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

export default PlanosAdminIsland;
