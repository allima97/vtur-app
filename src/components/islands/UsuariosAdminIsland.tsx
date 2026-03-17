import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useRegisterForm } from "../../lib/useRegisterForm";
import CredentialsForm from "../forms/CredentialsForm";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import FileUploadField from "../ui/primer/FileUploadField";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { DEFAULT_FROM_EMAILS } from "../../lib/systemName";

type UserRow = {
  id: string;
  nome_completo: string;
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

type AvisoTemplate = {
  id: string;
  nome: string;
  assunto: string;
  mensagem: string;
  ativo: boolean;
  sender_key: string;
};

const REMETENTE_OPTIONS = [
  { value: "admin", label: `Depto. Administrativo (${DEFAULT_FROM_EMAILS.admin})` },
  { value: "avisos", label: `Avisos (${DEFAULT_FROM_EMAILS.avisos})` },
  { value: "financeiro", label: `Depto. Financeiro (${DEFAULT_FROM_EMAILS.financeiro})` },
  { value: "suporte", label: `Suporte (${DEFAULT_FROM_EMAILS.suporte})` },
];

const getRemetenteLabel = (senderKey?: string) => {
  const key = String(senderKey || "avisos").toLowerCase();
  return REMETENTE_OPTIONS.find((opt) => opt.value === key)?.label || `Avisos (${DEFAULT_FROM_EMAILS.avisos})`;
};

const UsuariosAdminIsland: React.FC = () => {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminUsers") || can("AdminDashboard") || can("Admin");

  const [usuarios, setUsuarios] = useState<UserRow[]>([]);
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [empresas, setEmpresas] = useState<CompanyRow[]>([]);
  const [avisosTemplates, setAvisosTemplates] = useState<AvisoTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [novoNomeCompleto, setNovoNomeCompleto] = useState("");
  const [novaEmpresaId, setNovaEmpresaId] = useState("");
  const [novoTipoUsuarioId, setNovoTipoUsuarioId] = useState("");
  const [novoAtivo, setNovoAtivo] = useState(true);
  const [novoUsoIndividual, setNovoUsoIndividual] = useState(false);
  const [docContrato, setDocContrato] = useState<File | null>(null);
  const [docRg, setDocRg] = useState<File | null>(null);
  const [docCpf, setDocCpf] = useState<File | null>(null);
  const [docOutros, setDocOutros] = useState<File[]>([]);
  const [docErro, setDocErro] = useState<string | null>(null);
  const [enviandoDocs, setEnviandoDocs] = useState(false);
  const [avisoModalOpen, setAvisoModalOpen] = useState(false);
  const [avisoUsuario, setAvisoUsuario] = useState<UserRow | null>(null);
  const [avisoTemplateId, setAvisoTemplateId] = useState("");
  const [avisoErro, setAvisoErro] = useState<string | null>(null);
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [senhaModalOpen, setSenhaModalOpen] = useState(false);
  const [senhaUsuario, setSenhaUsuario] = useState<UserRow | null>(null);
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirmacao, setSenhaConfirmacao] = useState("");
  const [senhaConfirmarEmail, setSenhaConfirmarEmail] = useState(true);
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const tipoSelecionado = userTypes.find((t) => t.id === novoTipoUsuarioId) || null;
  const isMasterSelecionado = String(tipoSelecionado?.name || "").toUpperCase().includes("MASTER");

  useEffect(() => {
    carregarUsuarios();
    carregarTipos();
    carregarEmpresas();
    carregarAvisosTemplates();
  }, []);

  useEffect(() => {
    if (isMasterSelecionado && novoUsoIndividual) {
      setNovoUsoIndividual(false);
    }
  }, [isMasterSelecionado, novoUsoIndividual]);

  async function carregarTipos() {
    const { data, error } = await supabase
      .from("user_types")
      .select("id, name")
      .order("name");
    if (!error && data) setUserTypes(data);
  }

  async function carregarEmpresas() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, nome_fantasia")
      .order("nome_fantasia");
    if (!error && data) setEmpresas(data as CompanyRow[]);
  }

  async function carregarAvisosTemplates() {
    const { data, error } = await supabase
      .from("admin_avisos_templates")
      .select("id, nome, assunto, mensagem, ativo, sender_key")
      .eq("ativo", true)
      .order("nome");
    if (error) {
      const msg = error.message || "";
      if (msg.includes("sender_key") || msg.includes("schema cache")) {
        const fallback = await supabase
          .from("admin_avisos_templates")
          .select("id, nome, assunto, mensagem, ativo")
          .eq("ativo", true)
          .order("nome");
        if (!fallback.error && fallback.data) {
          const normalized = fallback.data.map((row: any) => ({
            ...row,
            sender_key: "avisos",
          }));
          setAvisosTemplates(normalized as AvisoTemplate[]);
          showToast(
            "Atualize o banco: adicione a coluna sender_key em admin_avisos_templates.",
            "warning"
          );
          return;
        }
      }
      console.error(error);
      setErro(error.message || "Erro ao carregar templates.");
      return;
    }
    if (data) {
      const normalized = data.map((row: any) => ({
        ...row,
        sender_key: row.sender_key || "avisos",
      }));
      setAvisosTemplates(normalized as AvisoTemplate[]);
    }
  }

  async function carregarUsuarios() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select(`
          id,
          nome_completo,
          email,
          active,
          user_type_id,
          company_id,
          uso_individual,
          user_types(name),
          companies (nome_fantasia)
        `)
        .order("nome_completo", { ascending: true });

      if (error) throw error;

      setUsuarios(data as UserRow[]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  async function atualizarTipoUsuario(id: string, user_type_id: string) {
    try {
      const tipoSelecionadoAtual = userTypes.find((t) => t.id === user_type_id);
      const tipoNome = String(tipoSelecionadoAtual?.name || "").toUpperCase();
      const isCargoCorporativo = tipoNome.includes("GESTOR") || tipoNome.includes("VENDEDOR");
      const { error } = await supabase
        .from("users")
        .update({
          user_type_id: user_type_id || null,
          ...(isCargoCorporativo ? { uso_individual: false } : {}),
        })
        .eq("id", id);

      if (error) throw error;
      await carregarUsuarios();
    } catch (e) {
      showToast("Erro ao mudar tipo do usuário.", "error");
    }
  }

  async function atualizarEmpresa(id: string, company_id: string) {
    try {
      const usuarioAtual = usuarios.find((u) => u.id === id);
      const tipoNome = String(usuarioAtual?.user_types?.name || "").toUpperCase();
      const isAdminOuMaster = tipoNome.includes("ADMIN") || tipoNome.includes("MASTER");
      const { error } = await supabase
        .from("users")
        .update({
          company_id: company_id || null,
          ...(company_id && !isAdminOuMaster ? { uso_individual: false } : {}),
        })
        .eq("id", id);

      if (error) throw error;
      await carregarUsuarios();
    } catch (e) {
      showToast("Erro ao vincular empresa.", "error");
    }
  }

  async function atualizarUsoIndividual(id: string, uso_individual: boolean) {
    try {
      const { error } = await supabase
        .from("users")
        .update({ uso_individual })
        .eq("id", id);

      if (error) throw error;
      await carregarUsuarios();
    } catch (e) {
      showToast("Erro ao atualizar tipo de uso.", "error");
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
      const msg = String(e?.message || "Erro ao atualizar status.");
      showToast(msg, "error");
    }
  }

  const openAvisoModal = (usuario: UserRow) => {
    setAvisoUsuario(usuario);
    setAvisoTemplateId(avisosTemplates[0]?.id || "");
    setAvisoErro(null);
    setAvisoModalOpen(true);
  };

  const openSenhaModal = (usuario: UserRow) => {
    setSenhaUsuario(usuario);
    setSenhaNova("");
    setSenhaConfirmacao("");
    setSenhaConfirmarEmail(true);
    setSenhaErro(null);
    setSenhaModalOpen(true);
  };

  const redefinirSenha = async () => {
    if (!senhaUsuario) return;
    const senha = String(senhaNova || "");
    const confirmacao = String(senhaConfirmacao || "");

    if (senha.length < 6) {
      setSenhaErro("A senha deve conter ao menos 6 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setSenhaErro("A confirmacao da senha nao confere.");
      return;
    }

    setSalvandoSenha(true);
    setSenhaErro(null);
    try {
      const resp = await fetch("/api/admin/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: senhaUsuario.id,
          email: senhaUsuario.email || undefined,
          password: senha,
          confirm_email: senhaConfirmarEmail,
        }),
      });

      const rawText = await resp.text();
      let payload: any = {};
      try {
        payload = rawText ? JSON.parse(rawText) : {};
      } catch {
        payload = {};
      }

      if (!resp.ok) {
        const msg =
          payload?.error?.message ||
          payload?.error ||
          payload?.message ||
          rawText ||
          "Falha ao redefinir senha.";
        throw new Error(String(msg));
      }

      showToast("Senha redefinida com sucesso.", "success");
      setSenhaModalOpen(false);
      setSenhaUsuario(null);
      setSenhaNova("");
      setSenhaConfirmacao("");
      setSenhaConfirmarEmail(true);
    } catch (err: any) {
      const msg = String(err?.message || "Falha ao redefinir senha.");
      setSenhaErro(msg);
      showToast("Erro ao redefinir senha.", "error");
    } finally {
      setSalvandoSenha(false);
    }
  };

  const enviarAviso = async () => {
    if (!avisoUsuario) return;
    if (!avisoTemplateId) {
      setAvisoErro("Selecione um template de aviso.");
      return;
    }
    if (!avisoUsuario.email) {
      setAvisoErro("Usuário sem e-mail cadastrado.");
      return;
    }
    setEnviandoAviso(true);
    setAvisoErro(null);
    try {
      const resp = await fetch("/api/admin/avisos/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: avisoUsuario.id, templateId: avisoTemplateId }),
        credentials: "include",
      });
      const rawText = await resp.text();
      let payload: any = {};
      try {
        payload = rawText ? JSON.parse(rawText) : {};
      } catch {
        // ignore parse error
      }
      const rawLower = rawText.trim().toLowerCase();
      if (rawLower.startsWith("<!doctype") || rawLower.startsWith("<html")) {
        throw new Error(
          "Endpoint de API não está ativo. Verifique se o deploy está em modo server (Cloudflare Functions) e não em modo estático."
        );
      }
      if (!resp.ok) {
        let msg =
          payload?.error?.message ||
          payload?.error ||
          payload?.message ||
          payload?.raw ||
          rawText ||
          "Falha ao enviar aviso.";
        if (typeof msg === "object") {
          msg = JSON.stringify(msg);
        }
        throw new Error(msg);
      }
      if (!payload?.provider) {
        throw new Error("Envio não foi processado por nenhum provedor.");
      }
      if (payload?.provider !== "resend" && payload?.provider !== "sendgrid" && payload?.provider !== "smtp") {
        throw new Error("Envio não foi processado por nenhum provedor.");
      }
      const providerLabel = payload?.provider ? ` (${payload.provider})` : "";
      const idLabel = payload?.id ? ` (ID: ${payload.id})` : "";
      showToast(`Aviso enviado com sucesso${providerLabel}${idLabel}.`, "success");
      setAvisoModalOpen(false);
      setAvisoUsuario(null);
      setAvisoTemplateId("");
    } catch (err: any) {
      setAvisoErro(err?.message || "Falha ao enviar aviso.");
      showToast("Erro ao enviar aviso.", "error");
    } finally {
      setEnviandoAviso(false);
    }
  };

  async function uploadMasterDocs(masterId: string) {
    const uploads: Array<{ docType: string; file: File }> = [];
    if (docContrato) uploads.push({ docType: "contrato_social", file: docContrato });
    if (docRg) uploads.push({ docType: "rg", file: docRg });
    if (docCpf) uploads.push({ docType: "cpf", file: docCpf });
    if (docOutros.length) {
      docOutros.forEach((file) => uploads.push({ docType: "outros", file }));
    }
    if (uploads.length === 0) return;

    setEnviandoDocs(true);
    setDocErro(null);
    try {
      for (const item of uploads) {
        const form = new FormData();
        form.append("master_id", masterId);
        form.append("doc_type", item.docType);
        form.append("file", item.file);
        const resp = await fetch("/api/admin/master-docs", {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || "Falha ao enviar documentos.");
        }
      }
    } catch (err: any) {
      const msg = err?.message || "Falha ao enviar documentos.";
      setDocErro(msg);
      showToast("Erro ao enviar documentos do Master.", "error");
    } finally {
      setEnviandoDocs(false);
    }
  }

  const registerForm = useRegisterForm({
    skipAuthSignUp: true,
    successMessage:
      "Usuário cadastrado! Ele receberá instruções por e-mail para validar o endereço.",
    onSuccess: async (user) => {
      const resp = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          password: (user as any)?.password || null,
          nome_completo: titleCaseWithExceptions(novoNomeCompleto) || null,
          company_id: novaEmpresaId || null,
          user_type_id: novoTipoUsuarioId || null,
          active: novoAtivo,
          uso_individual: novoUsoIndividual,
        }),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      let createdUserId = user.id || "";
      try {
        const payload = await resp.json();
        createdUserId = String(payload?.id || createdUserId);
      } catch {
        createdUserId = user.id || "";
      }
      if (isMasterSelecionado) {
        if (!createdUserId) {
          throw new Error("Nao foi possivel identificar o usuario criado para enviar os documentos.");
        }
        await uploadMasterDocs(createdUserId);
      }
      await carregarUsuarios();
      setCreateModalOpen(false);
      setNovoNomeCompleto("");
      setNovaEmpresaId("");
      setNovoTipoUsuarioId("");
      setNovoAtivo(true);
      setNovoUsoIndividual(false);
      setDocContrato(null);
      setDocRg(null);
      setDocCpf(null);
      setDocOutros([]);
      setDocErro(null);
    },
  });

  const openCreateUserModal = () => {
    setNovoNomeCompleto("");
    setNovaEmpresaId("");
    setNovoTipoUsuarioId("");
    setNovoAtivo(true);
    setNovoUsoIndividual(false);
    setDocContrato(null);
    setDocRg(null);
    setDocCpf(null);
    setDocOutros([]);
    setDocErro(null);
    registerForm.resetFields();
    setCreateModalOpen(true);
  };

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <AppCard tone="config" className="admin-page admin-usuarios-page">
        Apenas administradores podem acessar este modulo.
      </AppCard>
    );
  }

  return (
    <div className="mt-6 admin-page admin-usuarios-page page-content-wrap">
      <AppCard
        tone="config"
        className="mb-3 list-toolbar-sticky"
        title="Usuarios do sistema"
        subtitle="Gerencie cargos, empresas e status de acesso."
        actions={
          <AppButton type="button" variant="primary" onClick={openCreateUserModal}>
            Novo usuario
          </AppButton>
        }
      />

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {loading ? (
        <AppCard tone="config">Carregando usuarios...</AppCard>
      ) : (
        <AppCard tone="config">
          {usuarios.length === 0 ? (
            <EmptyState title="Nenhum usuario encontrado" />
          ) : (
            <DataTable
              className="table-header-blue table-mobile-cards min-w-[980px]"
              headers={
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Cargo</th>
                  <th>Empresa</th>
                  <th>Uso</th>
                  <th>Status</th>
                  <th className="th-actions">Aviso</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              colSpan={8}
            >
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nome">{u.nome_completo}</td>
                  <td data-label="E-mail">{u.email}</td>
                  <td data-label="Cargo">
                    <select
                      className="form-select"
                      value={u.user_type_id || ""}
                      onChange={(e) => atualizarTipoUsuario(u.id, e.target.value)}
                    >
                      <option value="">Selecionar cargo</option>
                      {userTypes.map((tipo) => (
                        <option key={tipo.id} value={tipo.id}>
                          {tipo.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Empresa">
                    <select
                      className="form-select"
                      value={u.company_id || ""}
                      onChange={(e) => atualizarEmpresa(u.id, e.target.value)}
                    >
                      <option value="">Sem empresa</option>
                      {empresas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome_fantasia}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td data-label="Uso">
                    <select
                      className="form-select"
                      value={typeof u.uso_individual === "boolean" ? String(u.uso_individual) : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        atualizarUsoIndividual(u.id, value === "true");
                      }}
                    >
                      <option value="">Selecionar</option>
                      <option value="true">Individual</option>
                      <option value="false">Corporativo</option>
                    </select>
                  </td>

                  <td data-label="Status">
                    <span className={u.active ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>

                  <td className="th-actions" data-label="Aviso">
                    <div className="action-buttons">
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => openAvisoModal(u)}
                        disabled={!u.email || avisosTemplates.length === 0}
                        title={
                          !u.email
                            ? "Usuario sem e-mail cadastrado"
                            : avisosTemplates.length === 0
                              ? "Nenhum template de aviso disponivel"
                              : "Enviar aviso"
                        }
                        aria-label="Enviar aviso"
                      >
                        <i className="pi pi-send" aria-hidden="true" />
                      </AppButton>
                    </div>
                  </td>

                  <td className="th-actions" data-label="Ações">
                    <div className="action-buttons">
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => openSenhaModal(u)}
                        title="Redefinir senha"
                        aria-label="Redefinir senha"
                      >
                        <i className="pi pi-key" aria-hidden="true" />
                      </AppButton>
                      <AppButton
                        type="button"
                        variant={u.active ? "danger" : "primary"}
                        onClick={() => toggleAtivo(u, !u.active)}
                        title={u.active ? "Desativar" : "Ativar"}
                        aria-label={u.active ? "Desativar" : "Ativar"}
                      >
                        <i className={u.active ? "pi pi-times-circle" : "pi pi-check-circle"} aria-hidden="true" />
                      </AppButton>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </AppCard>
      )}

      {avisoModalOpen && avisoUsuario && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form
            className="w-full max-w-lg"
            onSubmit={(e) => {
              e.preventDefault();
              enviarAviso();
            }}
          >
            <AppCard
              tone="config"
              title="Enviar aviso"
              actions={
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => setAvisoModalOpen(false)}
                  disabled={enviandoAviso}
                >
                  Fechar
                </AppButton>
              }
            >

            {avisoErro && (
              <div className="mb-3">
                <AlertMessage variant="error">{avisoErro}</AlertMessage>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Usuário</label>
              <div className="form-input" style={{ background: "#f1f5f9" }}>
                {avisoUsuario.nome_completo || "Usuário"}{" "}
                <span style={{ color: "#64748b" }}>({avisoUsuario.email || "sem e-mail"})</span>
              </div>
            </div>

            <div className="form-group">
              <AppField
                as="select"
                label="Template de aviso"
                value={avisoTemplateId}
                onChange={(e) => setAvisoTemplateId(e.target.value)}
                options={[
                  { value: "", label: "Selecione" },
                  ...avisosTemplates.map((t) => ({
                    value: t.id,
                    label: `${t.nome} — ${getRemetenteLabel(t.sender_key)}`,
                  })),
                ]}
              />
              {avisosTemplates.length === 0 && (
                <small style={{ color: "#94a3b8" }}>Nenhum template ativo cadastrado.</small>
              )}
              {avisoTemplateId && (
                <small style={{ color: "#64748b" }}>
                  Remetente:{" "}
                  {getRemetenteLabel(
                    avisosTemplates.find((t) => t.id === avisoTemplateId)?.sender_key
                  )}
                </small>
              )}
            </div>

            <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
              <AppButton type="submit" variant="primary" disabled={enviandoAviso}>
                {enviandoAviso ? "Enviando..." : "Enviar aviso"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setAvisoModalOpen(false)}
                disabled={enviandoAviso}
              >
                Cancelar
              </AppButton>
            </div>
            </AppCard>
          </form>
        </div>
      )}
      {senhaModalOpen && senhaUsuario && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form
            className="w-full max-w-lg"
            onSubmit={(e) => {
              e.preventDefault();
              redefinirSenha();
            }}
          >
            <AppCard
              tone="config"
              title="Redefinir senha"
              actions={
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => setSenhaModalOpen(false)}
                  disabled={salvandoSenha}
                >
                  Fechar
                </AppButton>
              }
            >

            {senhaErro && (
              <div className="mb-3">
                <AlertMessage variant="error">{senhaErro}</AlertMessage>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Usuario</label>
              <div className="form-input" style={{ background: "#f1f5f9" }}>
                {senhaUsuario.nome_completo || "Usuario"}{" "}
                <span style={{ color: "#64748b" }}>({senhaUsuario.email || "sem e-mail"})</span>
              </div>
            </div>

            <div className="form-group">
              <AppField
                as="input"
                label="Nova senha"
                type="password"
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
                minLength={6}
                required
                disabled={salvandoSenha}
                placeholder="Minimo de 6 caracteres"
              />
            </div>

            <div className="form-group">
              <AppField
                as="input"
                label="Confirmar nova senha"
                type="password"
                value={senhaConfirmacao}
                onChange={(e) => setSenhaConfirmacao(e.target.value)}
                minLength={6}
                required
                disabled={salvandoSenha}
                placeholder="Repita a senha"
              />
            </div>

            <label className="inline-flex items-center gap-2 mb-3" style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                checked={senhaConfirmarEmail}
                onChange={(e) => setSenhaConfirmarEmail(e.target.checked)}
                disabled={salvandoSenha}
              />
              Confirmar e-mail no Auth junto com a redefinicao
            </label>

            <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
              <AppButton type="submit" variant="primary" disabled={salvandoSenha}>
                {salvandoSenha ? "Salvando..." : "Salvar nova senha"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setSenhaModalOpen(false)}
                disabled={salvandoSenha}
              >
                Cancelar
              </AppButton>
            </div>
            </AppCard>
          </form>
        </div>
      )}
      {createModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form
            className="w-full max-w-xl"
            onSubmit={(e) => {
              if (isMasterSelecionado && !novaEmpresaId) {
                e.preventDefault();
                registerForm.showMessage(
                  "O usuário MASTER precisa ter uma empresa principal vinculada."
                );
                return;
              }
              registerForm.handleSubmit(e);
            }}
          >
            <AppCard
              tone="config"
              title="Cadastro administrativo de usuario"
              actions={
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={registerForm.loading}
                >
                  Fechar
                </AppButton>
              }
            >

            {registerForm.message && (
              <AlertMessage variant="error" className="mb-3">
                {registerForm.message}
              </AlertMessage>
            )}

            <div className="form-group">
              <AppField
                as="input"
                label="Nome completo"
                value={novoNomeCompleto}
                onChange={(e) => setNovoNomeCompleto(e.target.value)}
                onBlur={(e) => setNovoNomeCompleto(titleCaseWithExceptions(e.target.value))}
                required
                placeholder="Nome do usuário"
              />
            </div>

            <CredentialsForm
              email={registerForm.email}
              password={registerForm.password}
              confirmPassword={registerForm.confirmPassword}
              onEmailChange={registerForm.setEmail}
              onPasswordChange={registerForm.setPassword}
              onConfirmPasswordChange={registerForm.setConfirmPassword}
              disabled={registerForm.loading}
            />

            <div className="form-row mt-2">
              <AppField
                as="select"
                wrapperClassName="form-group flex-1"
                label="Cargo"
                value={novoTipoUsuarioId}
                onChange={(e) => setNovoTipoUsuarioId(e.target.value)}
                options={[
                  { value: "", label: "Selecione" },
                  ...userTypes.map((t) => ({
                    value: t.id,
                    label: t.name,
                  })),
                ]}
              />
              <AppField
                as="select"
                wrapperClassName="form-group flex-1"
                label="Empresa"
                value={novaEmpresaId}
                onChange={(e) => setNovaEmpresaId(e.target.value)}
                required={isMasterSelecionado}
                options={[
                  { value: "", label: "Sem empresa" },
                  ...empresas.map((c) => ({
                    value: c.id,
                    label: c.nome_fantasia,
                  })),
                ]}
              />
              <AppField
                as="select"
                wrapperClassName="form-group flex-1"
                label="Ativo?"
                value={novoAtivo ? "true" : "false"}
                onChange={(e) => setNovoAtivo(e.target.value === "true")}
                options={[
                  { value: "true", label: "Sim" },
                  { value: "false", label: "Nao" },
                ]}
              />
              <AppField
                as="select"
                wrapperClassName="form-group flex-1"
                label="Uso do sistema"
                value={novoUsoIndividual ? "true" : "false"}
                onChange={(e) => setNovoUsoIndividual(e.target.value === "true")}
                disabled={isMasterSelecionado}
                options={[
                  { value: "false", label: "Corporativo" },
                  { value: "true", label: "Individual" },
                ]}
              />
            </div>

            {isMasterSelecionado && (
              <AppCard className="card-config mt-3">
                <h5 className="mb-2">Documentos do Master</h5>
                {docErro && (
                  <div className="mb-2">
                    <AlertMessage variant="error">{docErro}</AlertMessage>
                  </div>
                )}
                <div className="perfil-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FileUploadField
                    wrapperClassName="form-group"
                    label="Contrato social"
                    accept=".pdf,image/*"
                    onChange={(e) => setDocContrato(e.currentTarget.files?.[0] || null)}
                    disabled={registerForm.loading || enviandoDocs}
                    fileName={docContrato?.name || "Nenhum arquivo escolhido"}
                  />
                  <FileUploadField
                    wrapperClassName="form-group"
                    label="RG"
                    accept=".pdf,image/*"
                    onChange={(e) => setDocRg(e.currentTarget.files?.[0] || null)}
                    disabled={registerForm.loading || enviandoDocs}
                    fileName={docRg?.name || "Nenhum arquivo escolhido"}
                  />
                </div>
                <div className="perfil-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <FileUploadField
                    wrapperClassName="form-group"
                    label="CPF"
                    accept=".pdf,image/*"
                    onChange={(e) => setDocCpf(e.currentTarget.files?.[0] || null)}
                    disabled={registerForm.loading || enviandoDocs}
                    fileName={docCpf?.name || "Nenhum arquivo escolhido"}
                  />
                  <FileUploadField
                    wrapperClassName="form-group"
                    label="Outros documentos"
                    multiple
                    accept=".pdf,image/*"
                    onChange={(e) => setDocOutros(Array.from(e.currentTarget.files || []))}
                    disabled={registerForm.loading || enviandoDocs}
                    fileName={docOutros.length ? `${docOutros.length} arquivo(s) selecionado(s)` : "Nenhum arquivo escolhido"}
                  />
                </div>
              </AppCard>
            )}

            <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
              <AppButton
                type="submit"
                variant="primary"
                disabled={registerForm.loading || enviandoDocs}
              >
                {enviandoDocs ? "Enviando docs..." : "Criar usuario"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setCreateModalOpen(false)}
                disabled={registerForm.loading || enviandoDocs}
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

export default UsuariosAdminIsland;
