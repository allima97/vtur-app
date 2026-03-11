import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { DEFAULT_FROM_EMAILS } from "../../lib/systemName";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type EmailSettings = {
  id?: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  resend_api_key: string;
  alerta_from_email: string;
  admin_from_email: string;
  avisos_from_email: string;
  financeiro_from_email: string;
  suporte_from_email: string;
};

const DEFAULT_SETTINGS: EmailSettings = {
  smtp_host: "",
  smtp_port: "",
  smtp_secure: true,
  smtp_user: "",
  smtp_pass: "",
  resend_api_key: "",
  alerta_from_email: "",
  admin_from_email: "",
  avisos_from_email: "",
  financeiro_from_email: "",
  suporte_from_email: "",
};

const EmailSettingsAdminIsland: React.FC = () => {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminUsers") || can("AdminDashboard") || can("Admin");

  const [form, setForm] = useState<EmailSettings>({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarResend, setMostrarResend] = useState(false);
  const [usarSmtp, setUsarSmtp] = useState(false);
  const [testeEmail, setTesteEmail] = useState("");
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_email_settings")
        .select(
          "id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, resend_api_key, alerta_from_email, admin_from_email, avisos_from_email, financeiro_from_email, suporte_from_email"
        )
        .eq("singleton", true)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setForm({
          id: data.id,
          smtp_host: data.smtp_host || DEFAULT_SETTINGS.smtp_host,
          smtp_port: String(data.smtp_port ?? DEFAULT_SETTINGS.smtp_port),
          smtp_secure: data.smtp_secure ?? true,
          smtp_user: data.smtp_user || "",
          smtp_pass: data.smtp_pass || "",
          resend_api_key: data.resend_api_key || "",
          alerta_from_email: data.alerta_from_email || "",
          admin_from_email: data.admin_from_email || "",
          avisos_from_email: data.avisos_from_email || "",
          financeiro_from_email: data.financeiro_from_email || "",
          suporte_from_email: data.suporte_from_email || "",
        });
        setUsarSmtp(Boolean(data.smtp_host && data.smtp_user && data.smtp_pass));
      } else {
        setForm({ ...DEFAULT_SETTINGS });
        setUsarSmtp(false);
      }
    } catch (e: any) {
      console.error(e);
      setErro("Erro ao carregar configurações de e-mail.");
    } finally {
      setLoading(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (usarSmtp) {
      if (
        !form.smtp_host.trim() ||
        !form.smtp_port.trim() ||
        !form.smtp_user.trim() ||
        !form.smtp_pass.trim()
      ) {
        setErro("Preencha todos os campos SMTP ou desative o SMTP.");
        return;
      }
    }

    const anyFrom = [
      form.alerta_from_email,
      form.admin_from_email,
      form.avisos_from_email,
      form.financeiro_from_email,
      form.suporte_from_email,
    ].some((val) => val.trim());
    if (!anyFrom) {
      setErro("Informe ao menos um e-mail de envio.");
      return;
    }

    const payload = {
      singleton: true,
      smtp_host: usarSmtp ? form.smtp_host.trim() : null,
      smtp_port: usarSmtp ? Number(form.smtp_port) || 465 : null,
      smtp_secure: Boolean(form.smtp_secure),
      smtp_user: usarSmtp ? form.smtp_user.trim() : null,
      smtp_pass: usarSmtp ? form.smtp_pass.trim() : null,
      resend_api_key: form.resend_api_key.trim(),
      alerta_from_email: form.alerta_from_email.trim(),
      admin_from_email: form.admin_from_email.trim(),
      avisos_from_email: form.avisos_from_email.trim(),
      financeiro_from_email: form.financeiro_from_email.trim(),
      suporte_from_email: form.suporte_from_email.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      setSalvando(true);
      const { data, error } = await supabase
        .from("admin_email_settings")
        .upsert(payload, { onConflict: "singleton" })
        .select("id")
        .single();
      if (error) throw error;
      setForm((prev) => ({ ...prev, id: data?.id || prev.id }));
      showToast("Configurações salvas.", "success");
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao salvar configurações.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarTeste() {
    const destino =
      testeEmail.trim() ||
      form.admin_from_email.trim() ||
      form.alerta_from_email.trim() ||
      form.avisos_from_email.trim();
    if (!destino) {
      setErro("Informe um e-mail para teste.");
      return;
    }
    setEnviandoTeste(true);
    setErro(null);
    try {
      const resp = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: destino }),
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
          `Falha no envio de teste (status ${resp.status}).`;
        if (typeof msg === "object") {
          msg = JSON.stringify(msg);
        }
        throw new Error(msg);
      }
      if (!payload?.id || payload?.provider !== "resend") {
        const debug = rawText || JSON.stringify(payload || {});
        throw new Error(`Envio não foi processado pelo Resend. Resposta: ${debug}`);
      }
      const idLabel = payload?.id ? ` (ID: ${payload.id})` : "";
      showToast(`Teste enviado com sucesso${idLabel}.`, "success");
    } catch (err: any) {
      showToast(err?.message || "Falha ao enviar teste.", "error");
    } finally {
      setEnviandoTeste(false);
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Apenas administradores podem acessar este modulo.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="mt-6 admin-page admin-email-page">
        <AppToolbar
          sticky
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Configuracoes de envio de e-mail"
          subtitle="Em hospedagens como Cloudflare Pages, SMTP via TCP normalmente nao funciona. Prefira Resend via API HTTP e mantenha SMTP apenas como fallback."
        />

        {erro && (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        )}

        {loading ? (
          <AppCard tone="config">
            <p>Carregando configuracoes...</p>
          </AppCard>
        ) : (
          <form onSubmit={salvar}>
            <AppCard
              tone="info"
              title="Envio principal"
              subtitle="Configure a API do Resend e valide rapidamente com um envio de teste."
            >
              <div className="vtur-form-grid vtur-form-grid-2">
                <div>
                  <label className="form-label">Resend API Key (recomendado)</label>
                  <div className="password-field">
                    <input
                      className="form-input"
                      type={mostrarResend ? "text" : "password"}
                      value={form.resend_api_key}
                      onChange={(e) => setForm((prev) => ({ ...prev, resend_api_key: e.target.value }))}
                      placeholder="re_..."
                    />
                    <AppButton
                      type="button"
                      variant="ghost"
                      className="password-toggle"
                      onClick={() => setMostrarResend((prev) => !prev)}
                      aria-label={mostrarResend ? "Ocultar chave" : "Mostrar chave"}
                      aria-pressed={mostrarResend}
                    >
                      <i className={mostrarResend ? "pi pi-eye-slash" : "pi pi-eye"} aria-hidden="true" />
                    </AppButton>
                  </div>
                  <div className="vtur-inline-note">
                    Esta chave e usada para enviar via API HTTP, evitando limitacoes de SMTP no ambiente Cloudflare.
                  </div>
                </div>

                <div className="vtur-form-grid vtur-form-grid-2">
                  <AppField
                    type="email"
                    label="Enviar teste para"
                    value={testeEmail}
                    onChange={(e) => setTesteEmail(e.target.value.toLowerCase())}
                    placeholder={form.admin_from_email || DEFAULT_FROM_EMAILS.admin}
                    caption="Se vazio, o sistema usa admin, alerta ou avisos como destino padrao."
                  />
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <AppButton
                      type="button"
                      variant="secondary"
                      block
                      onClick={enviarTeste}
                      disabled={enviandoTeste}
                    >
                      {enviandoTeste ? "Enviando..." : "Testar envio"}
                    </AppButton>
                  </div>
                </div>
              </div>
            </AppCard>

            <AppCard
              className="vtur-sales-embedded-card"
              tone="config"
              title="Fallback SMTP"
              subtitle="Ative apenas se o ambiente permitir conexoes TCP para SMTP."
            >
              <label className="vtur-sales-principal-label">
                <input
                  type="checkbox"
                  checked={usarSmtp}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUsarSmtp(checked);
                    if (!checked) {
                      setForm((prev) => ({
                        ...prev,
                        smtp_host: "",
                        smtp_port: "",
                        smtp_user: "",
                        smtp_pass: "",
                      }));
                    } else {
                      setForm((prev) => ({
                        ...prev,
                        smtp_host: prev.smtp_host || "smtp.hostinger.com",
                        smtp_port: prev.smtp_port || "465",
                      }));
                    }
                  }}
                />
                Usar SMTP como fallback
              </label>
              <div className="vtur-inline-note">
                Deixe desligado em ambientes serverless puros. Use somente quando houver suporte real a conexoes SMTP.
              </div>

              {usarSmtp && (
                <>
                  <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 16 }}>
                    <AppField
                      label="SMTP Host"
                      value={form.smtp_host}
                      onChange={(e) => setForm((prev) => ({ ...prev, smtp_host: e.target.value }))}
                      disabled={!usarSmtp}
                      placeholder="smtp.hostinger.com"
                    />
                    <AppField
                      type="number"
                      min="1"
                      label="Porta"
                      value={form.smtp_port}
                      onChange={(e) => setForm((prev) => ({ ...prev, smtp_port: e.target.value }))}
                      disabled={!usarSmtp}
                      placeholder="465"
                    />
                    <AppField
                      as="select"
                      label="SSL?"
                      value={form.smtp_secure ? "true" : "false"}
                      onChange={(e) => setForm((prev) => ({ ...prev, smtp_secure: e.target.value === "true" }))}
                      disabled={!usarSmtp}
                      options={[
                        { value: "true", label: "Sim" },
                        { value: "false", label: "Nao" },
                      ]}
                    />
                  </div>

                  <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
                    <AppField
                      label="Usuario SMTP"
                      value={form.smtp_user}
                      onChange={(e) => setForm((prev) => ({ ...prev, smtp_user: e.target.value }))}
                      disabled={!usarSmtp}
                    />
                    <div>
                      <label className="form-label">Senha SMTP</label>
                      <div className="password-field">
                        <input
                          className="form-input"
                          type={mostrarSenha ? "text" : "password"}
                          value={form.smtp_pass}
                          onChange={(e) => setForm((prev) => ({ ...prev, smtp_pass: e.target.value }))}
                          disabled={!usarSmtp}
                        />
                        <AppButton
                          type="button"
                          variant="ghost"
                          className="password-toggle"
                          onClick={() => setMostrarSenha((prev) => !prev)}
                          aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                          aria-pressed={mostrarSenha}
                          disabled={!usarSmtp}
                        >
                          <i className={mostrarSenha ? "pi pi-eye-slash" : "pi pi-eye"} aria-hidden="true" />
                        </AppButton>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </AppCard>

            <AppCard
              className="vtur-sales-embedded-card"
              tone="config"
              title="Remetentes por contexto"
              subtitle="Defina identidades de envio por area e mantenha um fallback padrao para quando algum contexto nao tiver remetente proprio."
            >
              <div className="vtur-form-grid vtur-form-grid-2">
                <AppField
                  type="email"
                  label="E-mail padrao (fallback)"
                  value={form.alerta_from_email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, alerta_from_email: e.target.value.toLowerCase() }))
                  }
                  placeholder={DEFAULT_FROM_EMAILS.admin}
                  caption="Se nao informar os especificos, o sistema usa este remetente."
                />
                <AppField
                  type="email"
                  label="E-mail admin"
                  value={form.admin_from_email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, admin_from_email: e.target.value.toLowerCase() }))
                  }
                  placeholder={DEFAULT_FROM_EMAILS.admin}
                />
                <AppField
                  type="email"
                  label="E-mail de avisos"
                  value={form.avisos_from_email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, avisos_from_email: e.target.value.toLowerCase() }))
                  }
                  placeholder={DEFAULT_FROM_EMAILS.avisos}
                />
                <AppField
                  type="email"
                  label="E-mail financeiro"
                  value={form.financeiro_from_email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, financeiro_from_email: e.target.value.toLowerCase() }))
                  }
                  placeholder={DEFAULT_FROM_EMAILS.financeiro}
                />
                <AppField
                  type="email"
                  label="E-mail suporte"
                  value={form.suporte_from_email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, suporte_from_email: e.target.value.toLowerCase() }))
                  }
                  placeholder={DEFAULT_FROM_EMAILS.suporte}
                />
              </div>
            </AppCard>

            <div className="vtur-form-actions">
              <AppButton type="submit" variant="primary" disabled={salvando} loading={salvando}>
                {salvando ? "Salvando..." : "Salvar configuracoes"}
              </AppButton>
            </div>
          </form>
        )}

        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
};

export default EmailSettingsAdminIsland;
