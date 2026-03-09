import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import {
  agruparModulosPorSecao,
  MAPA_MODULOS,
  MODULO_ALIASES,
  MODULOS_ADMIN_PERMISSOES,
  normalizeModuloLabel,
  SECOES_PERMISSOES,
} from "../../config/modulos";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import ConfirmDialog from "../ui/ConfirmDialog";
import { ToastStack, useToastQueue } from "../ui/Toast";

type NivelPermissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

type UserTypeRow = {
  id: string;
  name: string;
  description: string | null;
  created_at?: string | null;
};

type DefaultPermRow = {
  id: string;
  user_type_id: string;
  modulo: string;
  permissao: NivelPermissao;
  ativo: boolean;
};

const NIVEIS: Array<{ value: NivelPermissao; label: string }> = [
  { value: "none", label: "Nenhum" },
  { value: "view", label: "Ver" },
  { value: "create", label: "Criar" },
  { value: "edit", label: "Editar" },
  { value: "delete", label: "Excluir" },
  { value: "admin", label: "Admin" },
];

const MODULES_BASE = MODULOS_ADMIN_PERMISSOES;

function isTableMissing(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || message.includes("does not exist");
}

const normalizeNivel = (value?: string | null): NivelPermissao => {
  if (!value) return "none";
  const norm = value.toLowerCase();
  if (norm === "admin") return "admin";
  if (norm === "delete") return "delete";
  if (norm === "edit") return "edit";
  if (norm === "create") return "create";
  if (norm === "view") return "view";
  if (norm === "none") return "none";
  return "none";
};

const normalizeModuloKey = (value?: string | null) => {
  const key = String(value || "").trim().toLowerCase();
  return MODULO_ALIASES[key] || key;
};

const toModuloDbKey = (modulo: string) => MAPA_MODULOS[modulo] || modulo;
const toModuloKey = (modulo: string) => normalizeModuloKey(toModuloDbKey(modulo));

export default function AdminUserTypesIsland() {
  const { can, loading: loadingPerms, ready, isSystemAdmin } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminUserTypes") || can("Admin");

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [tipos, setTipos] = useState<UserTypeRow[]>([]);
  const [defaultCounts, setDefaultCounts] = useState<Record<string, number>>({});

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<UserTypeRow | null>(null);
  const [formNome, setFormNome] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [salvandoTipo, setSalvandoTipo] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserTypeRow | null>(null);
  const [deletando, setDeletando] = useState(false);

  const [permsModalOpen, setPermsModalOpen] = useState(false);
  const [permsTarget, setPermsTarget] = useState<UserTypeRow | null>(null);
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsError, setPermsError] = useState<string | null>(null);
  const [permsSearch, setPermsSearch] = useState("");
  const [permsModules, setPermsModules] = useState<string[]>(MODULES_BASE);
  const [permsForm, setPermsForm] = useState<Record<string, NivelPermissao>>({});
  const [salvandoPerms, setSalvandoPerms] = useState(false);

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const modulosPorSecao = useMemo(() => agruparModulosPorSecao(permsModules), [permsModules]);
  const secoesLabels = useMemo(() => {
    const map = new Map<string, string>();
    SECOES_PERMISSOES.forEach((s) => map.set(s.id, s.titulo));
    return map;
  }, []);
  const modulosPorSecaoVisiveis = useMemo(() => {
    const term = permsSearch.trim().toLowerCase();
    if (!term) {
      return modulosPorSecao.map((secao) => ({ ...secao, modulosVisiveis: secao.modulos }));
    }
    return modulosPorSecao
      .map((secao) => ({
        ...secao,
        modulosVisiveis: secao.modulos.filter((m) => m.toLowerCase().includes(term)),
      }))
      .filter((secao) => secao.modulosVisiveis.length > 0);
  }, [modulosPorSecao, permsSearch]);

  const tiposFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return tipos;
    return tipos.filter((t) => {
      const hay = `${t.name || ""} ${t.description || ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [tipos, busca]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase
        .from("user_types")
        .select("id, name, description, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      setTipos((data || []) as UserTypeRow[]);

      const { data: defaults, error: defaultsErr } = await supabase
        .from("user_type_default_perms")
        .select("user_type_id, modulo, permissao, ativo");

      if (defaultsErr) {
        if (isTableMissing(defaultsErr)) {
          setDefaultCounts({});
        } else {
          throw defaultsErr;
        }
      } else {
        const map: Record<string, Set<string>> = {};
        (defaults || []).forEach((row: any) => {
          const userTypeId = String(row.user_type_id || "");
          const modulo = String(row.modulo || "");
          const permissao = String(row.permissao || "none").toLowerCase();
          const ativo = row.ativo !== false;
          if (!userTypeId || !modulo) return;
          if (!ativo || permissao === "none") return;
          if (!map[userTypeId]) map[userTypeId] = new Set<string>();
          map[userTypeId].add(normalizeModuloKey(modulo));
        });
        const counts: Record<string, number> = {};
        Object.entries(map).forEach(([id, set]) => {
          counts[id] = set.size;
        });
        setDefaultCounts(counts);
      }
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar tipos de usuário.");
      setTipos([]);
      setDefaultCounts({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loadingPerm && podeVer && isSystemAdmin) {
      carregar();
    }
  }, [loadingPerm, podeVer, isSystemAdmin]);

  function abrirNovoTipo() {
    setEditingType(null);
    setFormNome("");
    setFormDesc("");
    setErro(null);
    setEditModalOpen(true);
  }

  function abrirEdicaoTipo(tipo: UserTypeRow) {
    setEditingType(tipo);
    setFormNome(tipo.name || "");
    setFormDesc(tipo.description || "");
    setErro(null);
    setEditModalOpen(true);
  }

  async function salvarTipo(e: React.FormEvent) {
    e.preventDefault();
    if (!isSystemAdmin) {
      setErro("Somente ADMIN pode gerenciar tipos de usuário.");
      return;
    }

    const nome = formNome.trim();
    const description = formDesc.trim();
    if (!nome) {
      setErro("Nome do tipo é obrigatório.");
      return;
    }

    setSalvandoTipo(true);
    setErro(null);
    try {
      if (editingType?.id) {
        const { error } = await supabase
          .from("user_types")
          .update({ name: nome, description: description || null })
          .eq("id", editingType.id);
        if (error) throw error;
        showToast("Tipo de usuário atualizado.", "success");
      } else {
        const { error } = await supabase
          .from("user_types")
          .insert({ name: nome, description: description || null });
        if (error) throw error;
        showToast("Tipo de usuário criado.", "success");
      }
      setEditModalOpen(false);
      setEditingType(null);
      await carregar();
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setErro("Já existe um tipo de usuário com este nome.");
      } else {
        setErro("Erro ao salvar tipo de usuário.");
      }
    } finally {
      setSalvandoTipo(false);
    }
  }

  async function confirmarDeleteTipo() {
    if (!deleteTarget?.id) return;
    setDeletando(true);
    try {
      const { error } = await supabase.from("user_types").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      showToast("Tipo de usuário excluído.", "success");
      setDeleteTarget(null);
      await carregar();
    } catch (err: any) {
      console.error(err);
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("violates foreign key")) {
        showToast("Não foi possível excluir: há usuários ou convites vinculados.", "error");
      } else {
        showToast("Erro ao excluir tipo de usuário.", "error");
      }
    } finally {
      setDeletando(false);
    }
  }

  async function abrirPermissoes(tipo: UserTypeRow) {
    setPermsTarget(tipo);
    setPermsModalOpen(true);
    setPermsError(null);
    setPermsSearch("");
    setPermsLoading(true);

    try {
      const [
        { data, error },
        { data: allTypeModsData },
        { data: acessoModsData },
      ] = await Promise.all([
        supabase
          .from("user_type_default_perms")
          .select("id, user_type_id, modulo, permissao, ativo")
          .eq("user_type_id", tipo.id)
          .order("modulo", { ascending: true }),
        supabase.from("user_type_default_perms").select("modulo"),
        supabase.from("modulo_acesso").select("modulo"),
      ]);
      if (error) throw error;

      const rows = (data || []) as DefaultPermRow[];
      const seenKeys = new Set<string>();
      const modules: string[] = [];
      const addModule = (label: string) => {
        const key = toModuloKey(label);
        if (!key) return;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        modules.push(label);
      };
      MODULES_BASE.forEach(addModule);
      (allTypeModsData || []).forEach((row: any) => {
        const raw = String(row?.modulo || "").trim();
        if (!raw) return;
        addModule(normalizeModuloLabel(raw));
      });
      (acessoModsData || []).forEach((row: any) => {
        const raw = String(row?.modulo || "").trim();
        if (!raw) return;
        addModule(normalizeModuloLabel(raw));
      });
      rows.forEach((row) => {
        const raw = String(row.modulo || "").trim();
        if (!raw) return;
        addModule(normalizeModuloLabel(raw));
      });
      setPermsModules(modules);

      const initial: Record<string, NivelPermissao> = {};
      modules.forEach((m) => {
        initial[m] = "none";
      });
      const labelByKey = new Map<string, string>();
      modules.forEach((label) => labelByKey.set(toModuloKey(label), label));
      rows.forEach((row) => {
        const key = normalizeModuloKey(row.modulo);
        const modulo = key ? labelByKey.get(key) : null;
        if (!modulo) return;
        initial[modulo] = row.ativo !== false ? normalizeNivel(row.permissao) : "none";
      });

      setPermsForm(initial);
    } catch (err: any) {
      console.error(err);
      if (isTableMissing(err)) {
        setPermsError(
          "Tabela de permissões padrão não existe. Aplique a migration database/migrations/20260312_user_types_default_perms.sql."
        );
      } else {
        setPermsError("Erro ao carregar permissões padrão.");
      }
    } finally {
      setPermsLoading(false);
    }
  }

  function getSecaoNivel(modulos: string[]) {
    const niveis = (modulos || []).map((m) => permsForm[m] || "none");
    const unique = Array.from(new Set(niveis));
    return unique.length === 1 ? unique[0] : "";
  }

  function aplicarNivelSecao(modulos: string[], nivel: NivelPermissao) {
    setPermsForm((prev) => {
      const next = { ...prev };
      (modulos || []).forEach((modulo) => {
        next[modulo] = nivel;
      });
      return next;
    });
  }

  async function salvarPermissoesPadrao() {
    if (!permsTarget?.id) return;
    if (!isSystemAdmin) {
      setPermsError("Somente ADMIN pode alterar permissões padrão.");
      return;
    }

    setSalvandoPerms(true);
    setPermsError(null);

    try {
      const { error: delErr } = await supabase
        .from("user_type_default_perms")
        .delete()
        .eq("user_type_id", permsTarget.id);
      if (delErr) throw delErr;

      const rows = permsModules
        .map((modulo) => {
          const permissao = permsForm[modulo] || "none";
          if (permissao === "none") return null;
          return {
            user_type_id: permsTarget.id,
            modulo: toModuloDbKey(modulo),
            permissao,
            ativo: true,
          };
        })
        .filter(Boolean) as Array<{ user_type_id: string; modulo: string; permissao: NivelPermissao; ativo: boolean }>;

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("user_type_default_perms").insert(rows);
        if (insErr) throw insErr;
      }

      showToast("Permissões padrão atualizadas.", "success");
      setPermsModalOpen(false);
      setPermsTarget(null);
      await carregar();
    } catch (err: any) {
      console.error(err);
      if (isTableMissing(err)) {
        setPermsError(
          "Tabela de permissões padrão não existe. Aplique a migration database/migrations/20260312_user_types_default_perms.sql."
        );
      } else {
        setPermsError("Erro ao salvar permissões padrão.");
      }
    } finally {
      setSalvandoPerms(false);
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) return <div>Acesso negado.</div>;
  if (!isSystemAdmin) return <div>Somente usuários ADMIN podem gerenciar tipos de usuário.</div>;

  return (
    <div className="admin-page admin-user-types-page mt-6">
      <div className="card-base card-blue mb-3 list-toolbar-sticky">
        <div
          className="form-row mobile-stack"
          style={{
            gap: 12,
            gridTemplateColumns: "minmax(240px, 1fr) auto",
            alignItems: "flex-end",
          }}
        >
          <div className="form-group">
            <h3 className="page-title">🧩 Tipos de usuário</h3>
            <p className="page-subtitle">
              Crie cargos e defina permissões padrão (aplicadas a novos usuários).
            </p>
          </div>
          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <button className="btn btn-primary w-full sm:w-auto" onClick={abrirNovoTipo}>
              Novo tipo
            </button>
          </div>
        </div>
        <div className="form-row mobile-stack" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Buscar</label>
            <input
              className="form-input"
              placeholder="Ex.: Vendedor, Financeiro..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      </div>

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {loading ? (
        <LoadingUsuarioContext />
      ) : (
        <div className="table-container overflow-x-auto">
          <table className="table-default table-header-red table-mobile-cards min-w-[820px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Permissões padrão</th>
                <th className="th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tiposFiltrados.length === 0 && (
                <tr>
                  <td colSpan={4}>Nenhum tipo encontrado.</td>
                </tr>
              )}
              {tiposFiltrados.map((tipo) => (
                <tr key={tipo.id}>
                  <td data-label="Nome">{tipo.name}</td>
                  <td data-label="Descrição">{tipo.description || "-"}</td>
                  <td data-label="Permissões padrão">
                    {(defaultCounts[tipo.id] ?? 0) > 0
                      ? `${defaultCounts[tipo.id]} módulo(s)`
                      : "Nenhuma"}
                  </td>
                  <td className="th-actions" data-label="Ações">
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="btn btn-light"
                        onClick={() => abrirPermissoes(tipo)}
                      >
                        Permissões
                      </button>
                      <button
                        type="button"
                        className="btn-icon icon-action-btn"
                        onClick={() => abrirEdicaoTipo(tipo)}
                        title="Editar tipo"
                        aria-label="Editar tipo"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-danger"
                        onClick={() => setDeleteTarget(tipo)}
                        title="Excluir tipo"
                        aria-label="Excluir tipo"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => !salvandoTipo && setEditModalOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 560, width: "95vw", background: "#f8fafc" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ color: "#b91c1c", fontSize: "1.1rem", fontWeight: 800 }}>
                {editingType ? "Editar tipo de usuário" : "Novo tipo de usuário"}
              </div>
              <button className="btn-ghost" type="button" onClick={() => setEditModalOpen(false)} disabled={salvandoTipo}>
                ✖
              </button>
            </div>
            <form onSubmit={salvarTipo}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nome *</label>
                  <input
                    className="form-input"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    placeholder="Ex.: Financeiro"
                    disabled={salvandoTipo}
                  />
                </div>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label className="form-label">Descrição</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Opcional"
                    disabled={salvandoTipo}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
                  Dica: evite renomear tipos usados por funções do sistema (ex.: MASTER, ADMIN, GESTOR, VENDEDOR).
                </div>
              </div>
              <div className="modal-footer mobile-stack-buttons">
                <button type="button" className="btn btn-light w-full sm:w-auto" onClick={() => setEditModalOpen(false)} disabled={salvandoTipo}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={salvandoTipo}>
                  {salvandoTipo ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {permsModalOpen && permsTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => !salvandoPerms && setPermsModalOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 720, width: "95vw", background: "#f8fafc" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ color: "#b91c1c", fontSize: "1.1rem", fontWeight: 800 }}>
                Permissões padrão: {permsTarget.name}
              </div>
              <button className="btn-ghost" type="button" onClick={() => setPermsModalOpen(false)} disabled={salvandoPerms}>
                ✖
              </button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
                Essas permissões são copiadas para <code>modulo_acesso</code> quando um usuário é criado/vinculado com este tipo.
                Usuários já existentes não são alterados automaticamente.
              </div>

              {permsError && (
                <div className="mb-3">
                  <AlertMessage variant="error">{permsError}</AlertMessage>
                </div>
              )}

              <div className="form-row mobile-stack" style={{ gap: 10, alignItems: "flex-end" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Buscar módulo</label>
                  <input
                    className="form-input"
                    placeholder="Ex.: Vendas, Agenda..."
                    value={permsSearch}
                    onChange={(e) => setPermsSearch(e.target.value)}
                    disabled={permsLoading || salvandoPerms}
                  />
                </div>
              </div>

              {permsLoading ? (
                <p style={{ marginTop: 12 }}>Carregando permissões...</p>
              ) : (
                <div className="table-container overflow-x-auto" style={{ marginTop: 12 }}>
                  <table className="table-default table-header-red table-mobile-cards min-w-[720px]">
                    <thead>
                      <tr>
                        <th>Módulo</th>
                        <th>Permissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modulosPorSecaoVisiveis.length === 0 && (
                        <tr>
                          <td colSpan={2}>Nenhum módulo encontrado.</td>
                        </tr>
                      )}
                      {modulosPorSecaoVisiveis.map((secao) => (
                        <React.Fragment key={secao.id}>
                          <tr>
                            <td colSpan={2} style={{ background: "#eff6ff" }}>
                              <div className="flex flex-wrap gap-2 items-center justify-between">
                                <div>
                                  <strong>{secao.titulo}</strong>
                                  {secao.includes.length > 0 && (
                                    <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}>
                                      (inclui:{" "}
                                      {secao.includes
                                        .map((id) => secoesLabels.get(id) || id)
                                        .join(", ")}
                                      )
                                    </span>
                                  )}
                                </div>
                                {secao.applyModulos.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span style={{ fontSize: 12, opacity: 0.8 }}>
                                      Aplicar em {secao.applyModulos.length}:
                                    </span>
                                    <select
                                      className="form-select"
                                      value={getSecaoNivel(secao.applyModulos)}
                                      onChange={(e) => {
                                        const value = e.target.value as NivelPermissao;
                                        if (!value) return;
                                        aplicarNivelSecao(secao.applyModulos, value);
                                      }}
                                      disabled={salvandoPerms}
                                    >
                                      <option value="">—</option>
                                      {NIVEIS.map((n) => (
                                        <option key={n.value} value={n.value}>
                                          {n.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>

                          {secao.modulosVisiveis.map((modulo) => (
                            <tr key={`${secao.id}:${modulo}`}>
                              <td data-label="Módulo">{modulo}</td>
                              <td data-label="Permissão">
                                <select
                                  className="form-select"
                                  value={permsForm[modulo] || "none"}
                                  onChange={(e) =>
                                    setPermsForm((prev) => ({
                                      ...prev,
                                      [modulo]: e.target.value as NivelPermissao,
                                    }))
                                  }
                                  disabled={salvandoPerms}
                                >
                                  {NIVEIS.map((n) => (
                                    <option key={n.value} value={n.value}>
                                      {n.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer mobile-stack-buttons">
              <button type="button" className="btn btn-light w-full sm:w-auto" onClick={() => setPermsModalOpen(false)} disabled={salvandoPerms}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={salvarPermissoesPadrao} disabled={salvandoPerms || permsLoading}>
                {salvandoPerms ? "Salvando..." : "Salvar permissões"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir tipo de usuário"
        message={`Excluir ${deleteTarget?.name || "este tipo"}?`}
        confirmLabel={deletando ? "Excluindo..." : "Excluir"}
        confirmVariant="danger"
        confirmDisabled={deletando}
        onCancel={() => (deletando ? null : setDeleteTarget(null))}
        onConfirm={confirmarDeleteTipo}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
