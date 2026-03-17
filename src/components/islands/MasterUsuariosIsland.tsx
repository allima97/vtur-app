import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { fetchGestorEquipeVendedorIds } from "../../lib/gestorEquipe";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type UserRow = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  active: boolean;
  user_type_id?: string | null;
  company_id?: string | null;
  uso_individual?: boolean | null;
  user_types?: {
    name: string;
  } | null;
  companies?: {
    nome_fantasia: string;
  } | null;
};

type UserType = {
  id: string;
  name: string;
};

type CompanyRow = {
  id: string;
  nome_fantasia: string;
};

type ConviteRow = {
  id: string;
  invited_email: string;
  company_id: string;
  user_type_id: string | null;
  invited_by: string;
  invited_by_name: string | null;
  status: string;
  created_at: string;
  expires_at?: string | null;
};

const isType = (u: UserRow, role: string) =>
  String(u.user_types?.name || "").toUpperCase().includes(role);

export default function MasterUsuariosIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("MasterUsuarios");
  const isMaster = /MASTER/i.test(String(userType || ""));

  const [usuarios, setUsuarios] = useState<UserRow[]>([]);
  const [empresas, setEmpresas] = useState<CompanyRow[]>([]);
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [empresaFiltro, setEmpresaFiltro] = useState("all");
  const [empresaEquipeId, setEmpresaEquipeId] = useState("");
  const [gestorEquipeId, setGestorEquipeId] = useState("");
  const [gestorEquipeBaseId, setGestorEquipeBaseId] = useState("");
  const [relacoes, setRelacoes] = useState<Record<string, boolean>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [salvandoEquipeCompartilhada, setSalvandoEquipeCompartilhada] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [novoNomeCompleto, setNovoNomeCompleto] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaEmpresaId, setNovaEmpresaId] = useState("");
  const [novoTipoUsuarioId, setNovoTipoUsuarioId] = useState("");
  const [novoAtivo, setNovoAtivo] = useState(true);
  const [convitesPendentes, setConvitesPendentes] = useState<ConviteRow[]>([]);
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [mensagemConvite, setMensagemConvite] = useState<string | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    if (!loadingPerm && podeVer && isMaster) {
      carregarTipos();
    }
  }, [loadingPerm, podeVer, isMaster]);

  useEffect(() => {
    if (!loadingPerm && podeVer && isMaster) {
      carregarUsuarios();
    }
  }, [loadingPerm, podeVer, isMaster]);

  useEffect(() => {
    if (!empresaEquipeId && empresas.length > 0) {
      setEmpresaEquipeId(empresas[0].id);
    }
  }, [empresaEquipeId, empresas]);

  useEffect(() => {
    if (!empresaFiltro && empresas.length > 0) {
      setEmpresaFiltro("all");
    }
  }, [empresaFiltro, empresas]);

  async function carregarTipos() {
    const { data, error } = await supabase.from("user_types").select("id, name").order("name");
    if (error) {
      console.error(error);
      return;
    }
    const tiposFiltrados = (data || []).filter((t) => {
      const nome = String(t.name || "").toUpperCase();
      return !nome.includes("ADMIN") && !nome.includes("MASTER");
    });
    setUserTypes(tiposFiltrados as UserType[]);
  }

  async function carregarUsuarios() {
    try {
      setLoading(true);
      setErro(null);

      const { data: auth } = await supabase.auth.getUser();
      const masterId = auth?.user?.id || null;
      if (!masterId) {
        setErro("Usuário não autenticado.");
        setUsuarios([]);
        setEmpresas([]);
        setConvitesPendentes([]);
        return;
      }

      const { data: vinculos, error: vincErr } = await supabase
        .from("master_empresas")
        .select("company_id, status, companies(id, nome_fantasia)")
        .eq("master_id", masterId);
      if (vincErr) throw vincErr;

      const empresasVinculadas = (vinculos || [])
        .filter((v: any) => String(v?.status || "").toLowerCase() !== "rejected")
        .map((v: any) => ({
          id: v.company_id,
          nome_fantasia: v.companies?.nome_fantasia || "Empresa",
        }))
        .filter((e: CompanyRow) => Boolean(e.id));

      const empresasUnicas = Array.from(
        new Map(empresasVinculadas.map((e) => [e.id, e])).values()
      );
      let empresasFinal = empresasUnicas;
      if (empresasFinal.length === 0) {
        const { data: masterUser, error: masterUserErr } = await supabase
          .from("users")
          .select("company_id, companies(nome_fantasia)")
          .eq("id", masterId)
          .maybeSingle();
        if (masterUserErr) throw masterUserErr;
        const companyIdPrincipal = (masterUser as any)?.company_id || null;
        if (companyIdPrincipal) {
          empresasFinal = [
            {
              id: companyIdPrincipal,
              nome_fantasia: (masterUser as any)?.companies?.nome_fantasia || "Empresa",
            },
          ];
        }
      }

      setEmpresas(empresasFinal);

      const idsEmpresas = empresasFinal.map((e) => e.id);
      if (idsEmpresas.length === 0) {
        setUsuarios([]);
        setConvitesPendentes([]);
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id,
          nome_completo,
          email,
          active,
          user_type_id,
          company_id,
          uso_individual,
          user_types(name),
          companies (nome_fantasia)
        `
        )
        .in("company_id", idsEmpresas)
        .order("nome_completo", { ascending: true });

      if (error) throw error;

      const filtrados = (data as UserRow[]).filter((u) => {
        const nome = String(u.user_types?.name || "").toUpperCase();
        return !nome.includes("ADMIN") && !nome.includes("MASTER");
      });
      setUsuarios(filtrados);
      await carregarConvites(idsEmpresas);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarConvites(idsEmpresas: string[]) {
    if (!idsEmpresas.length) {
      setConvitesPendentes([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_convites")
        .select("id, invited_email, company_id, user_type_id, invited_by, status, created_at, expires_at")
        .eq("status", "pending")
        .in("company_id", idsEmpresas)
        .order("created_at", { ascending: false });

      if (error) {
        const code = String((error as any)?.code || "");
        if (code === "42P01") {
          setConvitesPendentes([]);
          return;
        }
        throw error;
      }

      const convitesRaw = (data || []) as Array<Omit<ConviteRow, "invited_by_name">>;
      const idsCriadores = Array.from(
        new Set(convitesRaw.map((item) => item.invited_by).filter(Boolean))
      );

      let criadoresMap = new Map<string, string | null>();
      if (idsCriadores.length > 0) {
        const { data: criadores } = await supabase
          .from("users")
          .select("id, nome_completo")
          .in("id", idsCriadores);
        criadoresMap = new Map(
          (criadores || []).map((u: any) => [u.id, u.nome_completo || null])
        );
      }

      setConvitesPendentes(
        convitesRaw.map((item) => ({
          ...item,
          invited_by_name: criadoresMap.get(item.invited_by) || null,
        }))
      );
    } catch (error) {
      console.error(error);
      setConvitesPendentes([]);
    }
  }

  async function toggleAtivo(user: UserRow, ativo: boolean) {
    try {
      const resp = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          active: ativo,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Falha ao atualizar status do usuário.");
      }

      await carregarUsuarios();
    } catch (e) {
      const msg = String(e?.message || "Erro ao atualizar status do usuário.");
      showToast(msg, "error");
    }
  }

  const usuariosFiltrados = useMemo(() => {
    if (empresaFiltro === "all") return usuarios;
    return usuarios.filter((u) => u.company_id === empresaFiltro);
  }, [usuarios, empresaFiltro]);

  const gestoresDisponiveis = useMemo(
    () =>
      usuarios.filter(
        (u) => u.company_id === empresaEquipeId && isType(u, "GESTOR")
      ),
    [usuarios, empresaEquipeId]
  );

  const vendedoresDisponiveis = useMemo(
    () =>
      usuarios.filter(
        (u) => u.company_id === empresaEquipeId && isType(u, "VENDEDOR")
      ),
    [usuarios, empresaEquipeId]
  );

  const userTypesMap = useMemo(
    () => new Map(userTypes.map((tipo) => [tipo.id, tipo.name])),
    [userTypes]
  );
  const empresasMap = useMemo(
    () => new Map(empresas.map((empresa) => [empresa.id, empresa.nome_fantasia])),
    [empresas]
  );

  useEffect(() => {
    if (!gestorEquipeId && gestoresDisponiveis.length > 0) {
      setGestorEquipeId(gestoresDisponiveis[0].id);
    } else if (
      gestorEquipeId &&
      !gestoresDisponiveis.some((g) => g.id === gestorEquipeId)
    ) {
      setGestorEquipeId(gestoresDisponiveis[0]?.id || "");
    }
  }, [gestorEquipeId, gestoresDisponiveis]);

  useEffect(() => {
    carregarRelacoes();
  }, [gestorEquipeId]);

  useEffect(() => {
    carregarEquipeCompartilhada();
  }, [gestorEquipeId]);

  async function carregarEquipeCompartilhada() {
    if (!gestorEquipeId) {
      setGestorEquipeBaseId("");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("gestor_equipe_compartilhada")
        .select("gestor_base_id")
        .eq("gestor_id", gestorEquipeId)
        .maybeSingle();
      if (error) {
        const code = String((error as any)?.code || "");
        if (code === "42P01") {
          setGestorEquipeBaseId("");
          return;
        }
        throw error;
      }
      setGestorEquipeBaseId(String((data as any)?.gestor_base_id || ""));
    } catch (e) {
      console.error(e);
      setGestorEquipeBaseId("");
    }
  }

  async function salvarEquipeCompartilhada(baseId: string) {
    if (!gestorEquipeId) return;
    setSalvandoEquipeCompartilhada(true);
    try {
      if (!baseId) {
        const { error } = await supabase
          .from("gestor_equipe_compartilhada")
          .delete()
          .eq("gestor_id", gestorEquipeId);
        if (error) throw error;
        setGestorEquipeBaseId("");
        await carregarRelacoes();
        showToast("Equipe compartilhada removida.", "success");
        return;
      }

      const { error } = await supabase
        .from("gestor_equipe_compartilhada")
        .upsert({ gestor_id: gestorEquipeId, gestor_base_id: baseId }, { onConflict: "gestor_id" });
      if (error) throw error;
      setGestorEquipeBaseId(baseId);
      await carregarRelacoes();
      showToast("Equipe compartilhada atualizada.", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao salvar equipe compartilhada.", "error");
    } finally {
      setSalvandoEquipeCompartilhada(false);
    }
  }

  async function carregarRelacoes() {
    if (!gestorEquipeId) {
      setRelacoes({});
      return;
    }
    const map: Record<string, boolean> = {};
    try {
      const ids = await fetchGestorEquipeVendedorIds(gestorEquipeId);
      ids.forEach((id) => {
        map[id] = true;
      });
    } catch (error) {
      console.error(error);
    }
    setRelacoes(map);
  }

  async function toggleEquipe(vendedorId: string) {
    if (!gestorEquipeId) return;
    if (gestorEquipeBaseId) {
      showToast(
        "Este gestor está usando uma equipe compartilhada. Edite a equipe pelo gestor base.",
        "warning"
      );
      return;
    }
    setSalvandoId(vendedorId);
    const ativoAtual = Boolean(relacoes[vendedorId]);

    try {
      if (ativoAtual) {
        const { error } = await supabase
          .from("gestor_vendedor")
          .delete()
          .eq("gestor_id", gestorEquipeId)
          .eq("vendedor_id", vendedorId);
        if (error) throw error;
        setRelacoes((prev) => {
          const next = { ...prev };
          delete next[vendedorId];
          return next;
        });
        showToast("Vendedor removido da equipe.", "success");
      } else {
        await supabase
          .from("gestor_vendedor")
          .delete()
          .eq("gestor_id", gestorEquipeId)
          .eq("vendedor_id", vendedorId);
        const { error } = await supabase
          .from("gestor_vendedor")
          .insert({ gestor_id: gestorEquipeId, vendedor_id: vendedorId, ativo: true });
        if (error) throw error;
        setRelacoes((prev) => ({ ...prev, [vendedorId]: true }));
        showToast("Vendedor adicionado à equipe.", "success");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao atualizar equipe.", "error");
    } finally {
      setSalvandoId(null);
    }
  }

  const openCreateUserModal = () => {
    setNovoNomeCompleto("");
    setNovoEmail("");
    setNovaEmpresaId("");
    setNovoTipoUsuarioId("");
    setNovoAtivo(true);
    setMensagemConvite(null);
    setCreateModalOpen(true);
  };

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer || !isMaster) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">Apenas usuários MASTER podem acessar este módulo.</AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="mt-6 admin-page admin-usuarios-page vtur-legacy-module page-content-wrap">
        <AppCard
          className="mb-3 list-toolbar-sticky"
          tone="info"
          title="Usuários do portfólio"
          subtitle="Cadastre, ative e organize equipes das empresas aprovadas."
          actions={
            <AppButton type="button" variant="primary" onClick={openCreateUserModal}>
              Enviar convite
            </AppButton>
          }
        >
          <div className="vtur-card-form-grid">
            <AppField
              as="select"
              label="Filial"
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
              options={[
                { label: "Todas", value: "all" },
                ...empresas.map((c) => ({ label: c.nome_fantasia, value: c.id })),
              ]}
            />
          </div>
        </AppCard>

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {loading ? (
        <AppCard tone="config" className="mt-4">
          Carregando usuários...
        </AppCard>
      ) : (
        <div className="table-container overflow-x-auto mt-4">
          <table className="table-default table-header-blue table-mobile-cards min-w-[980px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Cargo</th>
                <th>Empresa</th>
                <th>Status</th>
                <th className="th-actions">Ações</th>
              </tr>
            </thead>

            <tbody>
              {usuariosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum usuário corporativo encontrado.</td>
                </tr>
              )}
              {usuariosFiltrados.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nome">{u.nome_completo || "-"}</td>
                  <td data-label="E-mail">{u.email || "-"}</td>
                  <td data-label="Cargo">{u.user_types?.name || "-"}</td>
                  <td data-label="Empresa">{u.companies?.nome_fantasia || "—"}</td>
                  <td data-label="Status">
                    <span className={u.active ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="th-actions" data-label="Ações">
                    <div className="action-buttons">
                      <AppButton
                        variant="ghost"
                        className="icon-action-btn"
                        onClick={() => toggleAtivo(u, !u.active)}
                        title={u.active ? "Desativar" : "Ativar"}
                        aria-label={u.active ? "Desativar" : "Ativar"}
                      >
                        <span aria-hidden="true">
                          <i className={u.active ? "pi pi-pause-circle" : "pi pi-check-circle"} />
                        </span>
                        <span className="sr-only">{u.active ? "Desativar" : "Ativar"}</span>
                      </AppButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AppCard className="mt-6" tone="config" title="Equipes (Gestor x Vendedores)">
        <div className="vtur-card-form-grid vtur-form-grid-3">
          <AppField
            as="select"
            label="Filial"
            value={empresaEquipeId}
            onChange={(e) => setEmpresaEquipeId(e.target.value)}
            options={
              empresas.length === 0
                ? [{ label: "Sem empresas", value: "" }]
                : empresas.map((c) => ({ label: c.nome_fantasia, value: c.id }))
            }
          />
          <AppField
            as="select"
            label="Gestor"
            value={gestorEquipeId}
            onChange={(e) => setGestorEquipeId(e.target.value)}
            options={
              gestoresDisponiveis.length === 0
                ? [{ label: "Sem gestores", value: "" }]
                : gestoresDisponiveis.map((g) => ({ label: g.nome_completo || "Gestor", value: g.id }))
            }
          />
          <AppField
            as="select"
            label="Equipe compartilhada"
            value={gestorEquipeBaseId}
            onChange={(e) => salvarEquipeCompartilhada(e.target.value)}
            disabled={!gestorEquipeId || salvandoEquipeCompartilhada}
            options={[
              { label: "Equipe própria", value: "" },
              ...gestoresDisponiveis
                .filter((g) => g.id !== gestorEquipeId)
                .map((g) => ({ label: `Usar equipe de ${g.nome_completo || "Gestor"}`, value: g.id })),
            ]}
          />
        </div>

        {gestorEquipeBaseId && (
          <div className="mt-3">
            <AlertMessage variant="info">
              Este gestor está usando uma equipe compartilhada. Para editar vendedores, selecione o gestor base.
            </AlertMessage>
          </div>
        )}

        <div className="table-container overflow-x-auto mt-3">
          <table className="table-default table-header-blue table-mobile-cards min-w-[720px]">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>E-mail</th>
                <th>Status</th>
                <th className="th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendedoresDisponiveis.length === 0 && (
                <tr>
                  <td colSpan={4}>Nenhum vendedor nesta filial.</td>
                </tr>
              )}
              {vendedoresDisponiveis.map((v) => {
                const ativo = Boolean(relacoes[v.id]);
                return (
                  <tr key={v.id}>
                    <td data-label="Vendedor">{v.nome_completo || "Vendedor"}</td>
                    <td data-label="E-mail">{v.email || "-"}</td>
                    <td data-label="Status">{ativo ? "Na equipe" : "Fora da equipe"}</td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons">
                        <AppButton
                          variant={ativo ? "danger" : "secondary"}
                          onClick={() => toggleEquipe(v.id)}
                          disabled={!gestorEquipeId || salvandoId === v.id || Boolean(gestorEquipeBaseId)}
                          title={ativo ? "Remover da equipe" : "Adicionar à equipe"}
                          aria-label={ativo ? "Remover da equipe" : "Adicionar à equipe"}
                        >
                          <i className={ativo ? "pi pi-minus-circle" : "pi pi-plus-circle"} aria-hidden="true" />
                        </AppButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCard
        className="mt-6"
        tone="config"
        title="Convites pendentes"
        subtitle="Usuários convidados que ainda não finalizaram o perfil."
      >
        <div className="table-container overflow-x-auto">
          <table className="table-default table-header-blue table-mobile-cards min-w-[900px]">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Cargo</th>
                <th>Empresa</th>
                <th>Criado por</th>
                <th>Criado em</th>
                <th>Expira em</th>
              </tr>
            </thead>
            <tbody>
              {convitesPendentes.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum convite pendente no portfolio.</td>
                </tr>
              )}
              {convitesPendentes.map((convite) => (
                <tr key={convite.id}>
                  <td data-label="E-mail">{convite.invited_email}</td>
                  <td data-label="Cargo">{userTypesMap.get(convite.user_type_id || "") || "-"}</td>
                  <td data-label="Empresa">{empresasMap.get(convite.company_id) || "-"}</td>
                  <td data-label="Criado por">{convite.invited_by_name || "-"}</td>
                  <td data-label="Criado em">
                    {new Date(convite.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td data-label="Expira em">
                    {convite.expires_at
                      ? new Date(convite.expires_at).toLocaleString("pt-BR")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>

      {createModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form
            className="card-config w-full max-w-xl vtur-modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              setMensagemConvite(null);
              if (!novoTipoUsuarioId || !novaEmpresaId) {
                setMensagemConvite("Selecione a empresa e o cargo.");
                return;
              }
              const emailNovo = novoEmail.trim().toLowerCase();
              if (!emailNovo) {
                setMensagemConvite("Informe o e-mail.");
                return;
              }
              const convitePendente = convitesPendentes.some(
                (convite) =>
                  convite.company_id === novaEmpresaId &&
                  convite.invited_email.trim().toLowerCase() === emailNovo &&
                  String(convite.status || "").toLowerCase() === "pending" &&
                  (!convite.expires_at || new Date(convite.expires_at).getTime() > Date.now())
              );
              if (convitePendente) {
                setMensagemConvite(
                  "Ja existe um convite pendente para este e-mail nesta empresa."
                );
                return;
              }
              const usuarioCorporativoExiste = usuarios.some(
                (usuarioAtual) =>
                  (usuarioAtual.email || "").trim().toLowerCase() === emailNovo &&
                  usuarioAtual.company_id === novaEmpresaId
              );
              if (usuarioCorporativoExiste) {
                setMensagemConvite(
                  "Ja existe um usuario corporativo com este e-mail nesta empresa."
                );
                return;
              }
              (async () => {
                try {
                  setEnviandoConvite(true);
                  const resp = await fetch("/api/convites/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: emailNovo,
                      company_id: novaEmpresaId,
                      user_type_id: novoTipoUsuarioId,
                      nome_completo: titleCaseWithExceptions(novoNomeCompleto) || null,
                      active: novoAtivo,
                    }),
                  });
                  if (!resp.ok) {
                    throw new Error(await resp.text());
                  }
                  showToast("Convite enviado! Expira em 1 hora.", "success");
                  await carregarUsuarios();
                  setCreateModalOpen(false);
                  setNovoNomeCompleto("");
                  setNovoEmail("");
                  setNovaEmpresaId("");
                  setNovoTipoUsuarioId("");
                  setNovoAtivo(true);
                  setMensagemConvite(null);
                } catch (err: any) {
                  console.error(err);
                  setMensagemConvite(err?.message || "Falha ao enviar convite.");
                  showToast("Erro ao enviar convite.", "error");
                } finally {
                  setEnviandoConvite(false);
                }
              })();
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-lg font-semibold">Cadastro de usuário corporativo</h4>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setCreateModalOpen(false)}
                disabled={enviandoConvite}
              >
                Fechar
              </AppButton>
            </div>

            {mensagemConvite && (
              <AlertMessage variant="warning" className="mb-3">
                {mensagemConvite}
              </AlertMessage>
            )}

            <div className="vtur-card-form-grid vtur-form-grid-2">
              <AppField
                label="Nome completo"
                value={novoNomeCompleto}
                onChange={(e) => setNovoNomeCompleto(e.target.value)}
                onBlur={(e) => setNovoNomeCompleto(titleCaseWithExceptions(e.target.value))}
                required
                placeholder="Nome do usuário"
              />
              <AppField
                as="input"
                type="email"
                label="E-mail"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value.toLowerCase())}
                required
                placeholder="usuario@empresa.com"
                disabled={enviandoConvite}
              />
              <AppField
                as="select"
                label="Cargo"
                value={novoTipoUsuarioId}
                onChange={(e) => setNovoTipoUsuarioId(e.target.value)}
                options={[
                  { label: "Selecione", value: "" },
                  ...userTypes.map((t) => ({ label: t.name, value: t.id })),
                ]}
              />
              <AppField
                as="select"
                label="Empresa"
                value={novaEmpresaId}
                onChange={(e) => setNovaEmpresaId(e.target.value)}
                options={[
                  { label: "Selecione", value: "" },
                  ...empresas.map((c) => ({ label: c.nome_fantasia, value: c.id })),
                ]}
              />
              <AppField
                as="select"
                label="Ativo?"
                value={novoAtivo ? "true" : "false"}
                onChange={(e) => setNovoAtivo(e.target.value === "true")}
                options={[
                  { label: "Sim", value: "true" },
                  { label: "Não", value: "false" },
                ]}
              />
            </div>

            <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
              <AppButton
                type="submit"
                variant="primary"
                disabled={enviandoConvite}
              >
                Enviar convite
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setCreateModalOpen(false)}
                disabled={enviandoConvite}
              >
                Cancelar
              </AppButton>
            </div>
          </form>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
