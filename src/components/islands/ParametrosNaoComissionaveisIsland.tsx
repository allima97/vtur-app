import React, { useEffect, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
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
      <div className="card-base card-config">
        <strong>Acesso negado ao módulo.</strong>
      </div>
    );
  }

  return (
      <div className="page-content-wrap">
      <div className="card-base mb-3">
        <h3 style={{ marginTop: 0 }}>Critérios de não comissão</h3>
        <p style={{ color: "#64748b", marginTop: 4 }}>
          Estes termos sobrescrevem o campo <strong>paga_comissão</strong> e não entram em meta,
          comissão e relatórios.
        </p>
        <form onSubmit={salvar}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2, minWidth: 240 }}>
              <label className="form-label">Termo *</label>
              <input
                className="form-input"
                value={form.termo}
                onChange={(e) => setForm((prev) => ({ ...prev, termo: e.target.value }))}
                placeholder="Ex.: Crédito diversos"
                required
              />
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label">Ativo</label>
              <select
                className="form-select"
                value={form.ativo ? "sim" : "nao"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ativo: e.target.value === "sim" }))
                }
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
          </div>
          {erro && <div style={{ color: "#b91c1c", marginTop: 8 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : editId ? "Atualizar" : "Salvar"}
            </button>
            {editId && (
              <button className="btn btn-light" type="button" onClick={resetForm}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card-base">
        <h3 style={{ marginTop: 0 }}>Termos cadastrados</h3>
        {loading ? (
          <p>Carregando...</p>
        ) : termos.length === 0 ? (
          <p>Nenhum critério cadastrado.</p>
        ) : (
          <div className="table-container overflow-x-auto">
            <table className="table-default table-header-blue table-mobile-cards">
              <thead>
                <tr>
                  <th>Termo</th>
                  <th>Ativo</th>
                  <th className="th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {termos.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Termo">{t.termo}</td>
                    <td data-label="Ativo">{t.ativo ? "Sim" : "Não"}</td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons">
                        {podeEditar && (
                          <button
                            type="button"
                            className="btn-icon"
                            title="Editar"
                            onClick={() => {
                              setEditId(t.id);
                              setForm({
                                termo: t.termo || "",
                                ativo: Boolean(t.ativo),
                              });
                            }}
                          >
                            ✏️
                          </button>
                        )}
                        {podeEditar && (
                          <button
                            type="button"
                            className="btn-icon btn-danger"
                            disabled={excluindoId === t.id}
                            onClick={() => excluir(t.id)}
                          >
                            {excluindoId === t.id ? "…" : "🗑️"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
