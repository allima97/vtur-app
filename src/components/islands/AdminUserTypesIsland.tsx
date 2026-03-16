import { Dialog, Select } from "../ui/primer/legacyCompat";
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
import DataTable from "../ui/DataTable";
import TableActions from "../ui/TableActions";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

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
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap admin-page admin-user-types-page">
          <AppCard tone="config">Acesso negado.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }
  if (!isSystemAdmin) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap admin-page admin-user-types-page">
          <AppCard tone="config">Somente usuarios ADMIN podem gerenciar tipos de usuario.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap admin-page admin-user-types-page">
        <AppCard
          title="Tipos de usuario"
          subtitle="Crie cargos e defina permissoes padrao que serao aplicadas a novos usuarios."
          tone="info"
          className="mb-3 list-toolbar-sticky"
          actions={
            <AppButton type="button" variant="primary" onClick={abrirNovoTipo}>
              Novo tipo
            </AppButton>
          }
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              label="Buscar"
              placeholder="Ex.: Vendedor, Financeiro..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </AppCard>

        {erro && <AlertMessage variant="error">{erro}</AlertMessage>}

        {loading ? (
          <LoadingUsuarioContext />
        ) : (
          <AppCard
            title="Cargos cadastrados"
            subtitle={`${tiposFiltrados.length} tipo(s) encontrado(s).`}
            tone="info"
          >
            <DataTable
              headers={
                <tr>
                  <th>Nome</th>
                  <th>Descricao</th>
                  <th>Permissoes padrao</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              empty={tiposFiltrados.length === 0}
              emptyMessage="Nenhum tipo encontrado."
              colSpan={4}
              className="table-mobile-cards table-header-red min-w-[820px]"
            >
              {tiposFiltrados.map((tipo) => (
                <tr key={tipo.id}>
                  <td data-label="Nome">{tipo.name}</td>
                  <td data-label="Descricao">{tipo.description || "-"}</td>
                  <td data-label="Permissoes padrao">
                    {(defaultCounts[tipo.id] ?? 0) > 0 ? `${defaultCounts[tipo.id]} modulo(s)` : "Nenhuma"}
                  </td>
                  <td className="th-actions" data-label="Ações">
                    <TableActions
                      actions={[
                        {
                          key: "perms",
                          label: "Permissoes",
                          title: "Editar permissoes padrao",
                          onClick: () => abrirPermissoes(tipo),
                          icon: <i className="pi pi-lock" aria-hidden="true" />,
                          variant: "primary",
                        },
                        {
                          key: "edit",
                          label: "Editar",
                          title: "Editar tipo",
                          onClick: () => abrirEdicaoTipo(tipo),
                          icon: <i className="pi pi-pencil" aria-hidden="true" />,
                          variant: "ghost",
                        },
                        {
                          key: "delete",
                          label: "Excluir",
                          title: "Excluir tipo",
                          onClick: () => setDeleteTarget(tipo),
                          icon: <i className="pi pi-trash" aria-hidden="true" />,
                          variant: "danger",
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </AppCard>
        )}

        {editModalOpen && (
          <Dialog
            title={editingType ? "Editar tipo de usuario" : "Novo tipo de usuario"}
            onClose={() => !salvandoTipo && setEditModalOpen(false)}
            footerButtons={[
              {
                content: "Cancelar",
                buttonType: "default",
                onClick: () => setEditModalOpen(false),
                disabled: salvandoTipo,
              },
              {
                content: salvandoTipo ? "Salvando..." : "Salvar",
                buttonType: "primary",
                onClick: () => {
                  const form = document.getElementById("admin-user-type-form") as HTMLFormElement | null;
                  form?.requestSubmit();
                },
                disabled: salvandoTipo,
              },
            ]}
          >
            <form id="admin-user-type-form" onSubmit={salvarTipo}>
              <div className="vtur-modal-body-stack">
                <AppCard tone="info" title="Dados do tipo" subtitle="Configure nome e descricao do cargo.">
                  <div className="vtur-form-grid vtur-form-grid-2">
                    <AppField
                      label="Nome"
                      value={formNome}
                      onChange={(e) => setFormNome(e.target.value)}
                      placeholder="Ex.: Financeiro"
                      disabled={salvandoTipo}
                    />
                    <AppField
                      as="textarea"
                      label="Descricao"
                      rows={3}
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Opcional"
                      disabled={salvandoTipo}
                    />
                  </div>
                  <p style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
                    Dica: evite renomear tipos usados por funcoes do sistema, como MASTER, ADMIN, GESTOR e VENDEDOR.
                  </p>
                </AppCard>
              </div>
            </form>
          </Dialog>
        )}

        {permsModalOpen && permsTarget && (
          <Dialog
            title={`Permissoes padrao: ${permsTarget.name}`}
            width="xlarge"
            onClose={() => !salvandoPerms && setPermsModalOpen(false)}
            footerButtons={[
              {
                content: "Cancelar",
                buttonType: "default",
                onClick: () => setPermsModalOpen(false),
                disabled: salvandoPerms,
              },
              {
                content: salvandoPerms ? "Salvando..." : "Salvar permissoes",
                buttonType: "primary",
                onClick: salvarPermissoesPadrao,
                disabled: salvandoPerms || permsLoading,
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                tone="info"
                title="Permissoes padrao"
                subtitle="Essas permissoes sao copiadas para modulo_acesso quando um usuario e criado ou vinculado a este tipo."
              >
                <div className="vtur-form-grid vtur-form-grid-2">
                  <AppField
                    label="Buscar modulo"
                    placeholder="Ex.: Vendas, Agenda..."
                    value={permsSearch}
                    onChange={(e) => setPermsSearch(e.target.value)}
                    disabled={permsLoading || salvandoPerms}
                  />
                </div>
              </AppCard>

              {permsError && <AlertMessage variant="error">{permsError}</AlertMessage>}

              {permsLoading ? (
                <AppCard tone="config">Carregando permissoes...</AppCard>
              ) : (
                <AppCard tone="info" title="Matriz de modulos" subtitle="Aplique niveis por modulo ou em bloco por secao.">
                  <DataTable
                    headers={
                      <tr>
                        <th>Modulo</th>
                        <th>Permissao</th>
                      </tr>
                    }
                    empty={modulosPorSecaoVisiveis.length === 0}
                    emptyMessage="Nenhum modulo encontrado."
                    colSpan={2}
                    className="table-mobile-cards table-header-red min-w-[720px]"
                  >
                    {modulosPorSecaoVisiveis.map((secao) => (
                      <React.Fragment key={secao.id}>
                        <tr>
                          <td colSpan={2} style={{ background: "#eff6ff" }}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <strong>{secao.titulo}</strong>
                                {secao.includes.length > 0 && (
                                  <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}>
                                    (inclui: {secao.includes.map((id) => secoesLabels.get(id) || id).join(", ")})
                                  </span>
                                )}
                              </div>
                              {secao.applyModulos.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <span style={{ fontSize: 12, opacity: 0.8 }}>
                                    Aplicar em {secao.applyModulos.length}:
                                  </span>
                                  <Select
                                    aria-label={`Nivel da secao ${secao.titulo}`}
                                    value={getSecaoNivel(secao.applyModulos)}
                                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                      const value = e.target.value as NivelPermissao;
                                      if (!value) return;
                                      aplicarNivelSecao(secao.applyModulos, value);
                                    }}
                                    disabled={salvandoPerms}
                                    className="vtur-dashboard-select"
                                  >
                                    <Select.Option value="">-</Select.Option>
                                    {NIVEIS.map((n) => (
                                      <Select.Option key={n.value} value={n.value}>
                                        {n.label}
                                      </Select.Option>
                                    ))}
                                  </Select>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>

                        {secao.modulosVisiveis.map((modulo) => (
                          <tr key={`${secao.id}:${modulo}`}>
                            <td data-label="Modulo">{modulo}</td>
                            <td data-label="Permissao">
                              <Select
                                block
                                aria-label={`Permissao do modulo ${modulo}`}
                                value={permsForm[modulo] || "none"}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                  setPermsForm((prev) => ({
                                    ...prev,
                                    [modulo]: e.target.value as NivelPermissao,
                                  }))
                                }
                                disabled={salvandoPerms}
                              >
                                {NIVEIS.map((n) => (
                                  <Select.Option key={n.value} value={n.value}>
                                    {n.label}
                                  </Select.Option>
                                ))}
                              </Select>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </DataTable>
                </AppCard>
              )}
            </div>
          </Dialog>
        )}

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Excluir tipo de usuario"
          message={`Excluir ${deleteTarget?.name || "este tipo"}?`}
          confirmLabel={deletando ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={deletando}
          onCancel={() => (deletando ? null : setDeleteTarget(null))}
          onConfirm={confirmarDeleteTipo}
        />

        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
