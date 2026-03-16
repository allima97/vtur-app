import React, { useEffect, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { normalizeText } from "../../lib/normalizeText";

type TermoNaoComissionavel = {
  id: string;
  termo: string;
  termo_normalizado?: string | null;
  ativo: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

const initialForm = {
  termo: "",
  ativo: true,
};

export default function ParametrosNaoComissionaveisIsland() {
  const { loading: loadingPerms, ready, isSystemAdmin, can } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = isSystemAdmin || can("Admin") || can("AdminDashboard");
  const podeEditar = isSystemAdmin || can("Admin");

  const [termos, setTermos] = useState<TermoNaoComissionavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    if (loadingPerm) return;
    if (!podeVer) return;
    carregar();
  }, [loadingPerm, podeVer]);

  async function carregar() {
    try {
      setLoading(true);
      setErro(null);
      const resp = await fetch("/api/v1/parametros/nao-comissionaveis");
      if (!resp.ok) throw new Error(await resp.text());
      const payload = (await resp.json()) as { items?: TermoNaoComissionavel[] };
      setTermos((payload.items || []) as TermoNaoComissionavel[]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar critérios.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(initialForm);
    setEditId(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEditar) return;
    const termo = form.termo.trim();
    if (!termo) {
      setErro("Informe o termo.");
      return;
    }

    const termo_normalizado = normalizeText(termo, { trim: true, collapseWhitespace: true });
    if (!termo_normalizado) {
      setErro("Termo inválido.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);
      const payload = {
        id: editId,
        termo,
        ativo: Boolean(form.ativo),
      };
      const resp = await fetch("/api/v1/parametros/nao-comissionaveis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.status === 409) {
        setErro("Termo já cadastrado.");
        showToast("Erro ao salvar critério.", "error");
        return;
      }
      if (!resp.ok) throw new Error(await resp.text());
      showToast(editId ? "Critério atualizado." : "Critério criado.", "success");

      resetForm();
      await carregar();
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao salvar critério.");
      showToast("Erro ao salvar critério.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!podeEditar) return;
    try {
      setExcluindoId(id);
      const resp = await fetch("/api/v1/parametros/nao-comissionaveis", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Critério excluído.", "success");
      await carregar();
    } catch (e) {
      console.error(e);
      showToast("Erro ao excluir critério.", "error");
    } finally {
      setExcluindoId(null);
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <AppCard tone="config">
        <strong>Acesso negado ao modulo.</strong>
      </AppCard>
    );
  }

  return (
    <div className="page-content-wrap">
      <AppCard
        tone="config"
        className="mb-3"
        title="Criterios de nao comissao"
        subtitle="Sobrescreve paga_comissao e remove valores de metas, comissoes e relatorios."
      />
      <AppCard tone="config">
        <form onSubmit={salvar}>
          <div className="form-row">
            <AppField
              as="input"
              wrapperClassName="form-group"
              label="Termo *"
              value={form.termo}
              onChange={(e) => setForm((prev) => ({ ...prev, termo: e.target.value }))}
              placeholder="Ex.: Credito diversos"
              required
            />
            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Ativo"
              value={form.ativo ? "sim" : "nao"}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, ativo: e.target.value === "sim" }))
              }
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Nao" },
              ]}
            />
          </div>
          {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <AppButton variant="primary" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : editId ? "Atualizar" : "Salvar"}
            </AppButton>
            {editId && (
              <AppButton variant="secondary" type="button" onClick={resetForm}>
                Cancelar
              </AppButton>
            )}
          </div>
        </form>
      </AppCard>

      <AppCard tone="config" title="Termos cadastrados">
        {loading ? (
          <p>Carregando...</p>
        ) : termos.length === 0 ? (
          <EmptyState title="Nenhum criterio cadastrado" />
        ) : (
          <DataTable
            className="table-header-blue table-mobile-cards"
            headers={
              <tr>
                <th>Termo</th>
                <th>Ativo</th>
                <th className="th-actions">Ações</th>
              </tr>
            }
            colSpan={3}
            empty={termos.length === 0}
          >
            {termos.map((t) => (
              <tr key={t.id}>
                <td data-label="Termo">{t.termo}</td>
                <td data-label="Ativo">{t.ativo ? "Sim" : "Nao"}</td>
                <td className="th-actions" data-label="Ações">
                  <div className="action-buttons">
                    {podeEditar && (
                      <AppButton
                        type="button"
                        variant="ghost"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => {
                          setEditId(t.id);
                          setForm({
                            termo: t.termo || "",
                            ativo: Boolean(t.ativo),
                          });
                        }}
                      >
                        <i className="pi pi-pencil" aria-hidden="true" />
                      </AppButton>
                    )}
                    {podeEditar && (
                      <AppButton
                        type="button"
                        variant="danger"
                        disabled={excluindoId === t.id}
                        title={excluindoId === t.id ? "Excluindo" : "Excluir"}
                        aria-label={excluindoId === t.id ? "Excluindo" : "Excluir"}
                        onClick={() => excluir(t.id)}
                      >
                        <i className={excluindoId === t.id ? "pi pi-spin pi-spinner" : "pi pi-trash"} aria-hidden="true" />
                      </AppButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </AppCard>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
