import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import TableActions from "../ui/TableActions";
import ConfirmDialog from "../ui/ConfirmDialog";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";
import {
  PRIME_THEME_OPTIONS,
} from "../../lib/primeTheme";
import { usePrimeTheme } from "../../lib/usePrimeTheme";

type Cidade = { id: string; nome: string };
type TipoProduto = { id: string; nome: string; tipo?: string | null };
type UsuarioEmpresa = { id: string; nome_completo: string; email: string };

type Preferencia = {
  id: string;
  tipo_produto_id: string | null;
  cidade_id: string | null;
  nome: string;
  localizacao: string | null;
  classificacao: string | null;
  observacao: string | null;
  created_at: string | null;
  cidade?: Cidade | null;
  tipo_produto?: { id: string; nome: string } | null;
};

type ShareRow = {
  id: string;
  status: "pending" | "accepted" | "revoked" | string;
  created_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  shared_with?: UsuarioEmpresa | null;
};

type ListItem =
  | {
      scope: "owned";
      preferencia: Preferencia;
      shares: ShareRow[];
    }
  | {
      scope: "shared";
      preferencia: Preferencia;
      share: {
        id: string;
        status: "pending" | "accepted" | "revoked" | string;
        shared_by: { id: string; nome_completo: string; email: string } | null;
      };
    };

const initialForm = {
  tipo_produto_id: "",
  cidade_id: "",
  nome: "",
  localizacao: "",
  classificacao: "",
  observacao: "",
};

async function fetchCidadesSugestoes(params: { query: string; limite?: number; signal?: AbortSignal }) {
  const qs = new URLSearchParams();
  qs.set("q", params.query);
  qs.set("limite", String(params.limite ?? 10));
  const resp = await fetch(`/api/v1/preferencias/cidades-busca?${qs.toString()}`, {
    credentials: "same-origin",
    signal: params.signal,
  });
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  const payload = await resp.json();
  return Array.isArray(payload) ? payload : [];
}

export default function MinhasPreferenciasIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;

  const podeVer = can("Minhas Preferências");
  const podeCriar = can("Minhas Preferências", "create");
  const podeEditar = can("Minhas Preferências", "edit");
  const podeExcluir = can("Minhas Preferências", "delete");

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [baseLoading, setBaseLoading] = useState(true);
  const [tipos, setTipos] = useState<TipoProduto[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[]>([]);

  const [busca, setBusca] = useState("");
  const [items, setItems] = useState<ListItem[]>([]);

  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [salvando, setSalvando] = useState(false);

  const [cidadeBusca, setCidadeBusca] = useState("");
  const [cidadeSelecionadaLabel, setCidadeSelecionadaLabel] = useState("");
  const [mostrarSugestoesCidade, setMostrarSugestoesCidade] = useState(false);
  const [resultadosCidade, setResultadosCidade] = useState<Cidade[]>([]);
  const [buscandoCidade, setBuscandoCidade] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [sharePrefId, setSharePrefId] = useState<string | null>(null);
  const [shareUserId, setShareUserId] = useState<string>("");
  const [sharing, setSharing] = useState(false);

  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);
  const {
    themeName: temaVisual,
    isApplying: aplicandoTemaVisual,
    applyTheme: applyPrimeTheme,
  } = usePrimeTheme();

  const sharePrefItem = useMemo(() => {
    if (!sharePrefId) return null;
    const found = items.find((it) => it.scope === "owned" && it.preferencia?.id === sharePrefId);
    return found && found.scope === "owned" ? found : null;
  }, [sharePrefId, items]);

  async function fetchBase() {
    const resp = await fetch("/api/v1/preferencias/base", { credentials: "same-origin" });
    if (!resp.ok) throw new Error(await resp.text());
    const json = (await resp.json()) as { tipos?: TipoProduto[]; usuarios?: UsuarioEmpresa[] };
    return {
      tipos: json.tipos || [],
      usuarios: json.usuarios || [],
    };
  }

  async function fetchList(noCache = false) {
    const params = new URLSearchParams();
    if (busca.trim()) params.set("busca", busca.trim());
    if (noCache) params.set("no_cache", "1");
    const resp = await fetch(`/api/v1/preferencias/list?${params.toString()}`, {
      credentials: "same-origin",
    });
    if (!resp.ok) throw new Error(await resp.text());
    const json = (await resp.json()) as { items?: ListItem[] };
    return json.items || [];
  }

  async function carregar(noCache = false) {
    if (!podeVer) return;
    setLoading(true);
    setErro(null);
    try {
      const list = await fetchList(noCache);
      setItems(list);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar preferências.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarBase() {
    if (!podeVer) return;
    setBaseLoading(true);
    try {
      const base = await fetchBase();
      setTipos(base.tipos);
      setUsuarios(base.usuarios);
    } catch (e) {
      console.error(e);
    } finally {
      setBaseLoading(false);
    }
  }

  useEffect(() => {
    if (loadPerm) return;
    carregarBase();
  }, [loadPerm, podeVer]);

  useEffect(() => {
    if (loadPerm) return;
    carregar();
  }, [loadPerm, podeVer]);

  useEffect(() => {
    if (!podeVer) return;
    const handle = setTimeout(() => {
      carregar();
    }, 250);
    return () => clearTimeout(handle);
  }, [busca]);

  function resetForm() {
    setEditId(null);
    setForm(initialForm);
    setCidadeBusca("");
    setCidadeSelecionadaLabel("");
    setResultadosCidade([]);
    setMostrarSugestoesCidade(false);
  }

  function abrirFormularioNovo() {
    resetForm();
    setErro(null);
    setMostrarFormulario(true);
  }

  function fecharFormulario() {
    resetForm();
    setErro(null);
    setMostrarFormulario(false);
  }

  const editItem = useMemo(() => {
    if (!editId) return null;
    const found = items.find((it) => it.preferencia?.id === editId);
    if (!found || found.scope !== "owned") return null;
    return found.preferencia;
  }, [editId, items]);

  useEffect(() => {
    if (!editItem) return;
    setForm({
      tipo_produto_id: editItem.tipo_produto_id || "",
      cidade_id: editItem.cidade_id || "",
      nome: editItem.nome || "",
      localizacao: editItem.localizacao || "",
      classificacao: editItem.classificacao || "",
      observacao: editItem.observacao || "",
    });
    const label = String(editItem.cidade?.nome || "").trim();
    setCidadeBusca(label);
    setCidadeSelecionadaLabel(label);
    setResultadosCidade([]);
    setMostrarSugestoesCidade(false);
  }, [editItem?.id]);

  useEffect(() => {
    if (!mostrarSugestoesCidade) return;

    const term = cidadeBusca.trim();
    if (term.length < 2) {
      setResultadosCidade([]);
      setBuscandoCidade(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBuscandoCidade(true);
      try {
        const data = await fetchCidadesSugestoes({ query: term, limite: 10, signal: controller.signal });
        if (!controller.signal.aborted) setResultadosCidade((data as Cidade[]) || []);
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error(e);
          setResultadosCidade([]);
        }
      } finally {
        if (!controller.signal.aborted) setBuscandoCidade(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [cidadeBusca, mostrarSugestoesCidade]);

  function selecionarCidade(c: Cidade) {
    setForm((prev) => ({ ...prev, cidade_id: c.id }));
    setCidadeBusca(c.nome);
    setCidadeSelecionadaLabel(c.nome);
    setMostrarSugestoesCidade(false);
    setResultadosCidade([]);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeCriar && !podeEditar) return;
    if (!form.nome.trim()) {
      setErro("Informe o nome.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      const payload: any = {
        id: editId,
        tipo_produto_id: form.tipo_produto_id || null,
        cidade_id: form.cidade_id || null,
        nome: form.nome.trim(),
        localizacao: form.localizacao.trim() || null,
        classificacao: form.classificacao.trim() || null,
        observacao: form.observacao.trim() || null,
      };

      const resp = await fetch("/api/v1/preferencias/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());

      showToast(editId ? "Preferência atualizada." : "Preferência criada.", "success");
      fecharFormulario();
      await carregar(true);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar preferência.");
      showToast("Erro ao salvar preferência.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirConfirmado() {
    const id = confirmDeleteId;
    if (!id) return;
    if (!podeExcluir) return;

    try {
      setConfirmDeleteId(null);
      const resp = await fetch("/api/v1/preferencias/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Preferência excluída.", "success");
      if (editId === id) resetForm();
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao excluir preferência.", "error");
    }
  }

  async function abrirCompartilhar(preferenciaId: string) {
    setSharePrefId(preferenciaId);
    setShareUserId("");
  }

  async function compartilhar() {
    if (!sharePrefId) return;
    if (!shareUserId) {
      showToast("Selecione um usuário.", "error");
      return;
    }

    try {
      setSharing(true);
      const resp = await fetch("/api/v1/preferencias/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ preferencia_id: sharePrefId, shared_with: shareUserId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Convite enviado.", "success");
      setSharePrefId(null);
      setShareUserId("");
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao compartilhar.", "error");
    } finally {
      setSharing(false);
    }
  }

  async function aceitarShare(shareId: string) {
    try {
      const resp = await fetch("/api/v1/preferencias/share-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ share_id: shareId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Compartilhamento aceito.", "success");
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao aceitar.", "error");
    }
  }

  async function revogarShare(shareId: string) {
    try {
      setRevokingShareId(shareId);
      const resp = await fetch("/api/v1/preferencias/share-revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ share_id: shareId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Compartilhamento revogado.", "success");
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao revogar.", "error");
    } finally {
      setRevokingShareId(null);
    }
  }

  async function atualizarTemaVisual(nextThemeName: string) {
    if (String(nextThemeName || "").trim().toLowerCase() === String(temaVisual).trim().toLowerCase()) {
      return;
    }
    try {
      await applyPrimeTheme(nextThemeName);
      showToast("Tema visual atualizado.", "success");
    } catch (error) {
      console.error("Erro ao atualizar tema visual:", error);
      showToast("Erro ao atualizar tema visual.", "error");
    }
  }

  if (loadPerm) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap minhas-preferencias-page">
          <LoadingUsuarioContext />
        </div>
      </AppPrimerProvider>
    );
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap minhas-preferencias-page">
          <AppCard tone="config">Acesso negado ao módulo de Minhas Preferências.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  const colSpan = 7;

  return (
    <AppPrimerProvider>
    <div className="page-content-wrap minhas-preferencias-page vtur-legacy-module">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {!mostrarFormulario && (
        <AppToolbar
          title="Minhas preferências"
          subtitle="Cadastre referências pessoais, compartilhe com a equipe e gerencie convites de acesso."
          tone="info"
          sticky
          actions={
            <AppButton type="button" variant="primary" onClick={abrirFormularioNovo} disabled={!podeCriar}>
              Adicionar preferência
            </AppButton>
          }
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              label="Buscar"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, tipo, cidade, localização..."
            />
          </div>
        </AppToolbar>
      )}

      {!mostrarFormulario && (
        <AppCard
          className="mb-3"
          title="Tema visual"
          subtitle="A alteração é aplicada imediatamente e salva neste navegador."
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              as="select"
              label="Tema"
              value={temaVisual}
              disabled={aplicandoTemaVisual}
              onChange={(event) => void atualizarTemaVisual(event.target.value)}
              options={PRIME_THEME_OPTIONS.map((option) => ({ label: option.label, value: option.name }))}
            />
          </div>
        </AppCard>
      )}

      {mostrarFormulario && (
        <AppCard
          className="form-card mb-3"
          tone="info"
          title={editId ? "Editar preferência" : "Nova preferência"}
          actions={
            <AppButton type="button" variant="default" onClick={fecharFormulario} disabled={salvando}>
              Cancelar
            </AppButton>
          }
        >

          <form onSubmit={salvar}>
          <div className="form-row">
            <div className="form-group" style={{ minWidth: 220, flex: 1 }}>
              <AppField
                as="select"
                label="Tipo"
                value={form.tipo_produto_id}
                disabled={baseLoading}
                onChange={(e) => setForm((prev) => ({ ...prev, tipo_produto_id: e.target.value }))}
                options={[
                  { label: "(Selecione)", value: "" },
                  ...tipos.map((t) => ({ label: t.nome, value: t.id })),
                ]}
              />
            </div>

            <div className="form-group relative" style={{ minWidth: 220, flex: 1 }}>
              <label className="form-label">Cidade</label>
              <input
                className="form-input"
                placeholder="Digite a cidade"
                value={cidadeBusca}
                onChange={(e) => {
                  const value = e.target.value;
                  setCidadeBusca(value);
                  setMostrarSugestoesCidade(true);

                  const valueTrim = value.trim();
                  if (!valueTrim) {
                    setForm((prev) => ({ ...prev, cidade_id: "" }));
                    setCidadeSelecionadaLabel("");
                    return;
                  }

                  if (cidadeSelecionadaLabel && valueTrim !== cidadeSelecionadaLabel) {
                    setForm((prev) => ({ ...prev, cidade_id: "" }));
                    setCidadeSelecionadaLabel("");
                  }
                }}
                onFocus={() => {
                  if (cidadeBusca.trim().length >= 2) setMostrarSugestoesCidade(true);
                }}
                onBlur={() => setTimeout(() => setMostrarSugestoesCidade(false), 150)}
                disabled={baseLoading}
                style={{ marginBottom: 6 }}
              />

              {mostrarSugestoesCidade && (buscandoCidade || cidadeBusca.trim().length >= 2) && (
                <AppCard
                  className="card-config"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    maxHeight: 180,
                    overflowY: "auto",
                    zIndex: 20,
                    padding: "4px 0",
                  }}
                >
                  {buscandoCidade && (
                    <div style={{ padding: "6px 12px", color: "#64748b" }}>Buscando cidades...</div>
                  )}

                  {!buscandoCidade && resultadosCidade.length === 0 && cidadeBusca.trim().length >= 2 && (
                    <div style={{ padding: "6px 12px", color: "#64748b" }}>Nenhuma cidade encontrada.</div>
                  )}

                  {!buscandoCidade &&
                    resultadosCidade.map((c) => (
                      <AppButton
                        key={c.id}
                        type="button"
                        variant="ghost"
                        className="w-full text-left"
                        style={{ padding: "6px 12px" }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selecionarCidade(c)}
                      >
                        {c.nome}
                      </AppButton>
                    ))}
                </AppCard>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 2, minWidth: 240 }}>
              <AppField
                label="Nome *"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 240 }}>
              <AppField
                label="Localização"
                value={form.localizacao}
                onChange={(e) => setForm((prev) => ({ ...prev, localizacao: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
              <AppField
                label="Classificação"
                value={form.classificacao}
                onChange={(e) => setForm((prev) => ({ ...prev, classificacao: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: 3, minWidth: 260 }}>
              <AppField
                label="Observação"
                value={form.observacao}
                onChange={(e) => setForm((prev) => ({ ...prev, observacao: e.target.value }))}
              />
            </div>
          </div>

          {erro && <AlertMessage variant="error">{erro}</AlertMessage>}

          <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
            <AppButton
              type="submit"
              variant="primary"
              disabled={
                salvando || (editId ? !podeEditar : !podeCriar)
              }
            >
              {salvando ? "Salvando..." : editId ? "Salvar" : "Criar"}
            </AppButton>
          </div>
          </form>
        </AppCard>
      )}

      {!mostrarFormulario && (
        <DataTable
          className="table-default table-header-blue table-mobile-cards"
          headers={
            <tr>
              <th>Escopo</th>
              <th>Tipo</th>
              <th>Nome</th>
              <th>Cidade</th>
              <th>Localização</th>
              <th>Status</th>
              <th className="th-actions" style={{ width: 140, textAlign: "center" }}>
                Ações
              </th>
            </tr>
          }
          loading={loading}
          empty={!loading && items.length === 0}
          colSpan={colSpan}
        >
          {items.map((row) => {
            const pref = row.preferencia;
            const isOwned = row.scope === "owned";
            const shareStatus = row.scope === "shared" ? String(row.share?.status || "") : "";

            return (
              <tr key={`${row.scope}-${pref.id}`}>
                <td data-label="Escopo">{isOwned ? "Minha" : "Compart."}</td>
                <td data-label="Tipo">{pref.tipo_produto?.nome || "-"}</td>
                <td data-label="Nome">{pref.nome}</td>
                <td data-label="Cidade">{pref.cidade?.nome || "-"}</td>
                <td data-label="Localização">{pref.localizacao || "-"}</td>
                <td data-label="Status">
                  {row.scope === "shared" ? (
                    shareStatus === "pending" ? "Pendente" : "Aceito"
                  ) : (row.shares || []).length > 0 ? (
                    `Compartilhado (${(row.shares || []).length})`
                  ) : (
                    "-"
                  )}
                </td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    actions={(() => {
                      const actions: any[] = [];

                      if (row.scope === "owned") {
                        actions.push({
                          key: "edit",
                          label: "Editar",
                          icon: <i className="pi pi-pencil" aria-hidden="true" />,
                          onClick: () => {
                            setErro(null);
                            setEditId(pref.id);
                            setMostrarFormulario(true);
                          },
                          disabled: !podeEditar,
                        });
                        actions.push({
                          key: "share",
                          label: "Compartilhar",
                          icon: <i className="pi pi-share-alt" aria-hidden="true" />,
                          onClick: () => abrirCompartilhar(pref.id),
                          disabled: !podeEditar,
                        });
                        actions.push({
                          key: "delete",
                          label: "Excluir",
                          icon: <i className="pi pi-trash" aria-hidden="true" />,
                          variant: "danger",
                          onClick: () => setConfirmDeleteId(pref.id),
                          disabled: !podeExcluir,
                        });
                      } else {
                        actions.push({
                          key: "accept",
                          label: "Aceitar",
                          icon: <i className="pi pi-check-circle" aria-hidden="true" />,
                          variant: "primary",
                          onClick: () => {
                            if ((row as any).share?.id) aceitarShare((row as any).share.id);
                          },
                          disabled: (row as any).share?.status !== "pending",
                          title: "Aceitar",
                        });
                        actions.push({
                          key: "remove",
                          label: "Remover",
                          icon: <i className="pi pi-ban" aria-hidden="true" />,
                          variant: "ghost",
                          onClick: () => {
                            if ((row as any).share?.id) revogarShare((row as any).share.id);
                          },
                          disabled: revokingShareId === (row as any).share?.id,
                          title: "Remover compartilhamento",
                        });
                      }

                      return actions;
                    })()}
                  />
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="Excluir preferência?"
        message="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        confirmVariant="danger"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={excluirConfirmado}
      />

      {sharePrefId && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setSharePrefId(null)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 520, width: "92vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">Compartilhar</div>
              <AppButton variant="ghost" onClick={() => setSharePrefId(null)} aria-label="Fechar">
                x
              </AppButton>
            </div>
            <div className="modal-body">
              {sharePrefItem && (sharePrefItem.shares || []).length > 0 && (
                <div className="mb-3">
                  <strong>Compartilhado com</strong>
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {(sharePrefItem.shares || []).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between"
                        style={{ gap: 12 }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>
                            {s.shared_with?.nome_completo || s.shared_with?.email || "Usuário"}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            {String(s.status || "").toUpperCase()}
                          </div>
                        </div>
                        <AppButton
                          type="button"
                          variant="secondary"
                          onClick={() => revogarShare(s.id)}
                          disabled={revokingShareId === s.id || !podeEditar}
                        >
                          {revokingShareId === s.id ? "Revogando..." : "Revogar"}
                        </AppButton>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <AppField
                  as="select"
                  label="Usuário"
                  value={shareUserId}
                  disabled={baseLoading}
                  onChange={(e) => setShareUserId(e.target.value)}
                  options={[
                    { label: "(Selecione)", value: "" },
                    ...usuarios.map((u) => ({ label: u.nome_completo || u.email, value: u.id })),
                  ]}
                />
              </div>
            </div>
            <div className="modal-footer">
              <AppButton type="button" variant="default" onClick={() => setSharePrefId(null)}>
                Cancelar
              </AppButton>
              <AppButton type="button" variant="primary" onClick={compartilhar} disabled={sharing}>
                {sharing ? "Enviando..." : "Enviar convite"}
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppPrimerProvider>
  );
}
