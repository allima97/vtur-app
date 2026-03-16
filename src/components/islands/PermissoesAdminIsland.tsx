import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { MODULOS_ADMIN_PERMISSOES } from "../../config/modulos";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import { ToastStack, useToastQueue } from "../ui/Toast";

type Usuario = {
  id: string;
  nome_completo: string;
  email: string | null;
  tipo: string;
};

type Permissao = {
  id: string;
  usuario_id: string;
  modulo: string;
  permissao: "view" | "edit" | "admin";
  ativo: boolean;
};

const MODULOS = MODULOS_ADMIN_PERMISSOES;
const PERMISSAO_OPTIONS = [
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
  { value: "admin", label: "Admin" },
];

export default function PermissoesAdminIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminDashboard");

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState("");
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const [isAdmin, setIsAdmin] = useState(false);

  // -----------------------
  // Validar se é ADMIN
  // -----------------------
  useEffect(() => {
    async function loadType() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const { data: u } = await supabase
        .from("users")
        .select("id, user_types(name)")
        .eq("id", auth.user.id)
        .maybeSingle();

      const tipo = Array.isArray(u?.user_types) && u.user_types.length > 0
        ? u.user_types[0].name?.toUpperCase() || ""
        : "";
      setIsAdmin(tipo.includes("ADMIN"));
    }
    loadType();
  }, []);

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer || !isAdmin)
    return (
      <AppCard className="permissoes-admin-page admin-page" tone="config">
        Apenas administradores podem acessar este modulo.
      </AppCard>
    );

  // -----------------------
  // Carregar usuários + permissões
  // -----------------------
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErro(null);

        const { data: us } = await supabase
          .from("users")
          .select("id, nome_completo, email, user_types(name)")
          .order("nome_completo");

        const listaUsers =
          us?.map((u) => ({
            id: u.id,
            nome_completo: u.nome_completo,
            email: u.email,
            tipo: Array.isArray(u.user_types) && u.user_types.length > 0
              ? u.user_types[0].name || "OUTRO"
              : "OUTRO",
          })) || [];

        setUsuarios(listaUsers);

        const { data: perm } = await supabase
          .from("modulo_acesso")
          .select("id, usuario_id, modulo, permissao, ativo");

        setPermissoes(perm || []);
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!usuarioSelecionadoId && usuarios.length > 0) {
      setUsuarioSelecionadoId(usuarios[0].id);
    }
  }, [usuarioSelecionadoId, usuarios]);

  // -----------------------
  // Helpers
  // -----------------------

  function getPermissao(usuarioId: string, modulo: string): Permissao {
    const item = permissaoEncontrada(usuarioId, modulo);
    if (item) return item;

    // se não existir → criar temporário
    return {
      id: "",
      usuario_id: usuarioId,
      modulo,
      permissao: "view",
      ativo: false,
    };
  }

  function permissaoEncontrada(usuarioId: string, modulo: string) {
    return permissaoList.find(
      (p) => p.usuario_id === usuarioId && p.modulo === modulo
    );
  }

  const permissaoList = podeVer ? permissoes : [];
  const usuarioSelecionado = usuarios.find((u) => u.id === usuarioSelecionadoId) || null;

  // -----------------------
  // Salvar alterações
  // -----------------------

  async function salvar(per: Permissao) {
    try {
      if (!per.id) {
        // criar
        const { error } = await supabase.from("modulo_acesso").insert({
          usuario_id: per.usuario_id,
          modulo: per.modulo,
          permissao: per.permissao,
          ativo: per.ativo,
        });

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("modulo_acesso")
          .update({
            permissao: per.permissao,
            ativo: per.ativo,
          })
          .eq("id", per.id);

        if (error) throw error;
      }

      // recarregar
      const { data } = await supabase.from("modulo_acesso").select("id, usuario_id, modulo, permissao, ativo");
      setPermissoes(data || []);
    } catch (e) {
      console.error(e);
      showToast("Erro ao salvar permissão.", "error");
    }
  }

  // -----------------------
  // Renderização
  // -----------------------

  return (
    <div className="permissoes-admin-page admin-page">
      <AppCard
        tone="config"
        className="mb-3"
        title="Editor de Permissoes"
        subtitle="Controle total dos modulos por usuario."
      />

      {erro && (
        <AlertMessage variant="error">{erro}</AlertMessage>
      )}

      {loading && <AppCard tone="config">Carregando...</AppCard>}

      {/* LISTAGEM */}
      {!loading && (
        <div className="sm:hidden">
          <AppCard tone="config">
            <AppField
              as="select"
              label="Usuario"
              value={usuarioSelecionadoId}
              onChange={(e) => setUsuarioSelecionadoId(e.target.value)}
              options={usuarios.map((u) => ({ value: u.id, label: u.nome_completo }))}
            />
          </AppCard>

          {usuarioSelecionado ? (
            <AppCard tone="config" title={`Permissoes de ${usuarioSelecionado.nome_completo}`}>
              <div className="flex flex-col gap-2">
                {MODULOS.map((m) => {
                  const per = getPermissao(usuarioSelecionado.id, m);
                  return (
                    <AppCard
                      key={m}
                      tone="info"
                      title={m}
                      actions={
                        <label className="text-xs">
                          <input
                            type="checkbox"
                            checked={per.ativo}
                            onChange={(e) =>
                              salvar({
                                ...per,
                                ativo: e.target.checked,
                              })
                            }
                          />{" "}
                          ativo
                        </label>
                      }
                    >
                      <AppField
                        as="select"
                        label="Permissao"
                        disabled={!per.ativo}
                        value={per.permissao}
                        onChange={(e) =>
                          salvar({
                            ...per,
                            permissao: e.target.value as any,
                          })
                        }
                        options={PERMISSAO_OPTIONS}
                      />
                    </AppCard>
                  );
                })}
              </div>
            </AppCard>
          ) : (
            <EmptyState title="Nenhum usuario encontrado" />
          )}
        </div>
      )}

      {!loading && (
        <div className="hidden sm:block">
          <AppCard tone="config" title="Usuarios">
            <DataTable
              className="table-mobile-cards min-w-[900px]"
              headers={
                <tr>
                  <th className="min-w-[180px]">Usuario</th>
                  {MODULOS.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                </tr>
              }
              colSpan={MODULOS.length + 1}
              loading={loading}
              empty={usuarios.length === 0}
              emptyMessage="Nenhum usuario encontrado."
            >
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td data-label="Usuario">
                    <strong>{u.nome_completo}</strong>
                    <br />
                    <small>{u.email}</small>
                    <br />
                    <small>Tipo: {u.tipo}</small>
                  </td>
                  {MODULOS.map((m) => {
                    const per = getPermissao(u.id, m);
                    return (
                      <td key={m} data-label={m}>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs">
                            <input
                              type="checkbox"
                              checked={per.ativo}
                              onChange={(e) =>
                                salvar({
                                  ...per,
                                  ativo: e.target.checked,
                                })
                              }
                            />{" "}
                            ativo
                          </label>
                          <select
                            disabled={!per.ativo}
                            value={per.permissao}
                            onChange={(e) =>
                              salvar({
                                ...per,
                                permissao: e.target.value as any,
                              })
                            }
                            className="text-xs form-select"
                          >
                            <option value="view">View</option>
                            <option value="edit">Edit</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </DataTable>
          </AppCard>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
