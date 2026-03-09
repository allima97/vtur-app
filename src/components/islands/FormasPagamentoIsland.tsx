import React, { useEffect, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { formatNumberBR } from "../../lib/format";

type FormaPagamento = {
  id: string;
  company_id: string;
  nome: string;
  descricao: string | null;
  paga_comissao: boolean;
  permite_desconto: boolean;
  desconto_padrao_pct: number | null;
  ativo: boolean;
  created_at: string | null;
};

const initialForm = {
  nome: "",
  descricao: "",
  paga_comissao: true,
  permite_desconto: false,
  desconto_padrao_pct: "",
  ativo: true,
};

export default function FormasPagamentoIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;
  const podeVer = can("Formas de Pagamento");
  const podeCriar = can("Formas de Pagamento", "create");
  const podeEditar = can("Formas de Pagamento", "edit");
  const podeExcluir = can("Formas de Pagamento", "delete");

  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  async function fetchFormas(noCache = false) {
    const params = new URLSearchParams();
    if (noCache) params.set("no_cache", "1");
    const resp = await fetch(`/api/v1/formas-pagamento/list?${params.toString()}`);
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    const json = (await resp.json()) as { items?: FormaPagamento[] };
    return json.items || [];
  }

  async function carregar(noCache = false) {
    if (!podeVer) return;
    setLoading(true);
    setErro(null);
    try {
      const items = await fetchFormas(noCache);
      setFormas(items as FormaPagamento[]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar formas de pagamento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loadPerm) return;
    carregar();
  }, [loadPerm, podeVer]);

  function resetForm() {
    setForm(initialForm);
    setEditId(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeCriar && !podeEditar) return;
    if (!form.nome.trim()) {
      setErro("Informe o nome da forma de pagamento.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        paga_comissao: Boolean(form.paga_comissao),
        permite_desconto: Boolean(form.permite_desconto),
        desconto_padrao_pct: form.desconto_padrao_pct
          ? Number(String(form.desconto_padrao_pct).replace(",", "."))
          : null,
        ativo: Boolean(form.ativo),
      } as any;

      if (!editId) {
        const resp = await fetch("/api/v1/formas-pagamento/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error(await resp.text());
        showToast("Forma de pagamento criada.", "success");
      } else {
        const resp = await fetch("/api/v1/formas-pagamento/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: editId }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        showToast("Forma de pagamento atualizada.", "success");
      }

      resetForm();
      await carregar(true);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar forma de pagamento.");
      showToast("Erro ao salvar forma de pagamento.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!podeExcluir) return;
    try {
      setExcluindoId(id);
      const params = new URLSearchParams({ id });
      const resp = await fetch(`/api/v1/formas-pagamento/delete?${params.toString()}`, {
        method: "DELETE",
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Forma de pagamento excluída.", "success");
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao excluir forma de pagamento.", "error");
    } finally {
      setExcluindoId(null);
    }
  }

  if (loadPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <div className="card-base card-config">
        <strong>Acesso negado ao módulo de Formas de Pagamento.</strong>
      </div>
    );
  }

  return (
    <div className="page-content-wrap">
      <div className="card-base mb-3">
        <h3 style={{ marginTop: 0 }}>Cadastro</h3>
        <form onSubmit={salvar}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2, minWidth: 220 }}>
              <label className="form-label">Nome *</label>
              <input
                className="form-input"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 220 }}>
              <label className="form-label">Descrição</label>
              <input
                className="form-input"
                value={form.descricao}
                onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ minWidth: 180 }}>
              <label className="form-label">Paga comissão</label>
              <select
                className="form-select"
                value={form.paga_comissao ? "sim" : "nao"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, paga_comissao: e.target.value === "sim" }))
                }
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 180 }}>
              <label className="form-label">Permite desconto</label>
              <select
                className="form-select"
                value={form.permite_desconto ? "sim" : "nao"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, permite_desconto: e.target.value === "sim" }))
                }
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 180 }}>
              <label className="form-label">Desconto padrão (%)</label>
              <input
                className="form-input"
                inputMode="decimal"
                placeholder="0"
                value={form.desconto_padrao_pct}
                onChange={(e) => setForm((prev) => ({ ...prev, desconto_padrao_pct: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label">Ativo</label>
              <select
                className="form-select"
                value={form.ativo ? "sim" : "nao"}
                onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.value === "sim" }))}
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
        <h3 style={{ marginTop: 0 }}>Formas cadastradas</h3>
        {loading ? (
          <p>Carregando...</p>
        ) : formas.length === 0 ? (
          <p>Nenhuma forma cadastrada.</p>
        ) : (
          <div className="table-container overflow-x-auto">
            <table className="table-default table-header-blue table-mobile-cards">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Comissão</th>
                  <th>Desconto</th>
                  <th>Ativo</th>
                  <th className="th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {formas.map((f) => (
                  <tr key={f.id}>
                    <td data-label="Nome">{f.nome}</td>
                    <td data-label="Comissão">{f.paga_comissao ? "Sim" : "Não"}</td>
                    <td data-label="Desconto">
                      {f.permite_desconto
                        ? f.desconto_padrao_pct
                          ? `${formatNumberBR(f.desconto_padrao_pct, 2)}%`
                          : "Sim"
                        : "Não"}
                    </td>
                    <td data-label="Ativo">{f.ativo ? "Sim" : "Não"}</td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons">
                        {(podeEditar || podeCriar) && (
                          <button
                            type="button"
                            className="btn-icon"
                            title="Editar"
                            onClick={() => {
                              setEditId(f.id);
                              setForm({
                                nome: f.nome || "",
                                descricao: f.descricao || "",
                                paga_comissao: Boolean(f.paga_comissao),
                                permite_desconto: Boolean(f.permite_desconto),
                                desconto_padrao_pct: f.desconto_padrao_pct?.toString() || "",
                                ativo: Boolean(f.ativo),
                              });
                            }}
                          >
                            ✏️
                          </button>
                        )}
                        {podeExcluir && (
                          <button
                            type="button"
                            className="btn-icon btn-danger"
                            disabled={excluindoId === f.id}
                            onClick={() => excluir(f.id)}
                          >
                            {excluindoId === f.id ? "…" : "🗑️"}
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
