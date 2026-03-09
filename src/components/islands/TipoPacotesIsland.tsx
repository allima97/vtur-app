import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { AlertTriangle } from "lucide-react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { normalizeText } from "../../lib/normalizeText";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { useCrudResource } from "../../lib/useCrudResource";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";

type TipoPacote = {
  id: string;
  nome: string;
  rule_id?: string | null;
  fix_meta_nao_atingida?: number | null;
  fix_meta_atingida?: number | null;
  fix_super_meta?: number | null;
  ativo: boolean;
};

type Regra = {
  id: string;
  nome: string;
  tipo: string;
};

export default function TipoPacotesIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Parametros");
  const podeCriar = can("Parametros", "create");
  const podeEditar = can("Parametros", "edit");
  const podeExcluir = can("Parametros", "admin");
  const modoSomenteLeitura = !podeCriar && !podeEditar;

  const {
    items: tiposPacote,
    loading: loadingTipos,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load,
    create,
    update,
    remove,
  } = useCrudResource<TipoPacote>({
    table: "tipo_pacotes",
    select: "*",
  });

  const [regras, setRegras] = useState<Regra[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [busca, setBusca] = useState("");

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tipoParaExcluir, setTipoParaExcluir] = useState<TipoPacote | null>(null);

  const [form, setForm] = useState({ nome: "", ativo: true });
  const [regraSelecionada, setRegraSelecionada] = useState<string>("");
  const [fixMetaNao, setFixMetaNao] = useState<string>("");
  const [fixMetaAtingida, setFixMetaAtingida] = useState<string>("");
  const [fixSuperMeta, setFixSuperMeta] = useState<string>("");
  const [modalDuplicado, setModalDuplicado] = useState<{ entity: "Tipo de Pacote" } | null>(null);

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  function iniciarNovo() {
    setForm({ nome: "", ativo: true });
    setRegraSelecionada("");
    setFixMetaNao("");
    setFixMetaAtingida("");
    setFixSuperMeta("");
    setEditandoId(null);
    setErro(null);
  }

  function abrirFormulario() {
    iniciarNovo();
    setMostrarFormulario(true);
  }

  function fecharFormulario() {
    iniciarNovo();
    setMostrarFormulario(false);
  }

  function iniciarEdicao(item: TipoPacote) {
    setEditandoId(item.id);
    setForm({
      nome: item.nome || "",
      ativo: item.ativo,
    });
    setRegraSelecionada(item.rule_id || "");
    setFixMetaNao(item.fix_meta_nao_atingida != null ? String(item.fix_meta_nao_atingida) : "");
    setFixMetaAtingida(item.fix_meta_atingida != null ? String(item.fix_meta_atingida) : "");
    setFixSuperMeta(item.fix_super_meta != null ? String(item.fix_super_meta) : "");
    setMostrarFormulario(true);
    setErro(null);
  }

  async function carregar() {
    setLoadingExtras(true);
    setErro(null);
    try {
      const [loadRes, regrasRes] = await Promise.all([
        load({
          order: { column: "nome", ascending: true },
          errorMessage: "Erro ao carregar tipos de pacote.",
        }),
        supabase
          .from("commission_rule")
          .select("id, nome, tipo")
          .eq("ativo", true)
          .order("nome"),
      ]);

      if (loadRes.error) return;
      setRegras((regrasRes.data as any) || []);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar tipos de pacote.");
    } finally {
      setLoadingExtras(false);
    }
  }

  useEffect(() => {
    if (!loadingPerm && podeVer) carregar();
  }, [loadingPerm, podeVer]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (modoSomenteLeitura) {
      setErro("Você não tem permissão para salvar tipos de pacote.");
      return;
    }

    const nome = titleCaseWithExceptions(form.nome.trim());
    if (!nome) {
      setErro("Nome é obrigatório.");
      return;
    }

    const normalizedNome = normalizeText(nome).trim();
    const existeDuplicado = tiposPacote.some(
      (tipo) =>
        tipo.id !== editandoId &&
        normalizeText(tipo.nome || "").trim() === normalizedNome
    );
    if (existeDuplicado) {
      setModalDuplicado({ entity: "Tipo de Pacote" });
      return;
    }

    const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const payload = {
      nome,
      ativo: form.ativo,
      rule_id: regraSelecionada || null,
      fix_meta_nao_atingida: toNumberOrNull(fixMetaNao),
      fix_meta_atingida: toNumberOrNull(fixMetaAtingida),
      fix_super_meta: toNumberOrNull(fixSuperMeta),
    };

    try {
      setErro(null);
      if (editandoId) {
        const result = await update(editandoId, payload, {
          errorMessage: "Erro ao salvar tipo de pacote.",
        });
        if (result.error) return;
      } else {
        const result = await create(payload, {
          errorMessage: "Erro ao salvar tipo de pacote.",
        });
        if (result.error) return;
      }
      fecharFormulario();
      await carregar();
      showToast("Tipo de pacote salvo.", "success");
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar tipo de pacote.");
    }
  }

  async function excluir(id: string) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir tipos de pacote.", "error");
      return;
    }
    try {
      const result = await remove(id, {
        errorMessage: "Erro ao excluir tipo de pacote. Talvez esteja vinculado a vendas/recibos.",
      });
      if (result.error) return;
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Erro ao excluir tipo de pacote.");
    }
  }

  function solicitarExclusao(item: TipoPacote) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir tipos de pacote.", "error");
      return;
    }
    setTipoParaExcluir(item);
  }

  async function confirmarExclusao() {
    if (!tipoParaExcluir) return;
    await excluir(tipoParaExcluir.id);
    setTipoParaExcluir(null);
  }

  const tiposFiltrados = useMemo(() => {
    if (!busca.trim()) return tiposPacote;
    const termo = normalizeText(busca);
    return tiposPacote.filter((p) => normalizeText(p.nome || "").includes(termo));
  }, [busca, tiposPacote]);

  const regrasMap = useMemo(() => {
    const map = new Map<string, Regra>();
    regras.forEach((r) => map.set(r.id, r));
    return map;
  }, [regras]);

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) return <div>Você não possui acesso ao módulo de Parâmetros.</div>;

  return (
    <div className="produtos-page tipo-pacotes-page">
      {mostrarFormulario && (
        <div className="card-base card-blue form-card mb-3">
          <form onSubmit={salvar}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input
                  className="form-input"
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                  onBlur={(e) =>
                    setForm((prev) => ({ ...prev, nome: titleCaseWithExceptions(e.target.value) }))
                  }
                  disabled={modoSomenteLeitura}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ativo?</label>
                <select
                  className="form-input"
                  value={form.ativo ? "1" : "0"}
                  onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.value === "1" }))}
                  disabled={modoSomenteLeitura}
                >
                  <option value="1">Sim</option>
                  <option value="0">Não</option>
                </select>
              </div>
            </div>

            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-group flex-1 min-w-[220px]">
                <label className="form-label">Regra de Comissão</label>
                <select
                  className="form-input"
                  value={regraSelecionada}
                  onChange={(e) => setRegraSelecionada(e.target.value)}
                  disabled={modoSomenteLeitura}
                >
                  <option value="">Usar comissão fixa</option>
                  {regras.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome} ({r.tipo})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group flex-1 min-w-[160px]">
                <label className="form-label">Meta não atingida %</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={fixMetaNao}
                  onChange={(e) => setFixMetaNao(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
              </div>
              <div className="form-group flex-1 min-w-[160px]">
                <label className="form-label">Meta atingida %</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={fixMetaAtingida}
                  onChange={(e) => setFixMetaAtingida(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
              </div>
              <div className="form-group flex-1 min-w-[160px]">
                <label className="form-label">Super meta %</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={fixSuperMeta}
                  onChange={(e) => setFixSuperMeta(e.target.value)}
                  disabled={modoSomenteLeitura}
                />
              </div>
            </div>

            {!modoSomenteLeitura && (
              <div className="mobile-stack-buttons" style={{ marginTop: 12 }}>
                <button className="btn btn-primary w-full sm:w-auto" type="submit">
                  {editandoId ? "Salvar alterações" : "Salvar tipo"}
                </button>
                <button
                  type="button"
                  className="btn btn-light w-full sm:w-auto"
                  onClick={fecharFormulario}
                >
                  Cancelar
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      <div className="card-base card-blue mb-3">
        <div
          className="form-row mobile-stack"
          style={{
            marginTop: 8,
            gap: 8,
            gridTemplateColumns: "minmax(220px, 1fr) auto",
            alignItems: "flex-end",
          }}
        >
          <div className="form-group" style={{ minWidth: 220 }}>
            <label className="form-label">Buscar tipo de pacote</label>
            <input
              className="form-input"
              placeholder="Digite o nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          {!modoSomenteLeitura && (
            <div className="form-group tipo-pacotes-actions" style={{ alignItems: "flex-end" }}>
              <span style={{ visibility: "hidden" }}>botão</span>
              <button
                className="btn btn-primary w-full sm:w-auto"
                type="button"
                onClick={abrirFormulario}
              >
                Novo tipo
              </button>
            </div>
          )}
        </div>
      </div>

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      <div className="card-base card-blue">
        <DataTable
          className="table-default table-header-blue table-mobile-cards min-w-[780px]"
          colSpan={6}
          headers={
            <tr>
              <th>Tipo de Pacote</th>
              <th>Regra</th>
              <th>Meta não</th>
              <th>Meta</th>
              <th>Super</th>
              <th className="th-actions">Ações</th>
            </tr>
          }
          loading={loadingTipos || loadingExtras}
          empty={tiposFiltrados.length === 0}
          emptyMessage="Nenhum tipo de pacote encontrado."
        >
          {tiposFiltrados.map((item) => {
            const regra = item.rule_id ? regrasMap.get(item.rule_id) : null;
            const regraLabel = regra ? `${regra.nome} (${regra.tipo})` : "Fixa";
            return (
              <tr key={item.id}>
                <td data-label="Tipo">{item.nome}</td>
                <td data-label="Regra">{regraLabel}</td>
                <td data-label="Meta não">{item.fix_meta_nao_atingida ?? "-"}</td>
                <td data-label="Meta">{item.fix_meta_atingida ?? "-"}</td>
                <td data-label="Super">{item.fix_super_meta ?? "-"}</td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    onEdit={podeEditar ? () => iniciarEdicao(item) : undefined}
                    onDelete={podeExcluir ? () => solicitarExclusao(item) : undefined}
                    editDisabled={!podeEditar}
                    deleteDisabled={excluindoId === item.id}
                  />
                </td>
              </tr>
            );
          })}
        </DataTable>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog
        open={Boolean(tipoParaExcluir)}
        title="Excluir tipo de pacote"
        message="Tem certeza que deseja excluir este tipo de pacote?"
        confirmLabel="Excluir"
        confirmVariant="danger"
        onCancel={() => setTipoParaExcluir(null)}
        onConfirm={confirmarExclusao}
      />
      {modalDuplicado && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Aviso: ${modalDuplicado.entity}`}
        >
          <div className="modal-panel" style={{ maxWidth: 520, width: "95vw" }}>
            <div className="modal-header" style={{ alignItems: "center", gap: 10 }}>
              <div
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#b45309",
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={20} strokeWidth={2} />
                ATENÇÃO!
              </div>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0 }}>{modalDuplicado.entity} já cadastrado.</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setModalDuplicado(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
