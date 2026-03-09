import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { DEFAULT_FROM_EMAILS } from "../../lib/systemName";

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
      <div style={{ padding: 20 }}>
        <h3>Apenas administradores podem acessar este módulo.</h3>
      </div>
    );
  }

  return (
    <div className="mt-6 admin-page admin-email-page">
      <div className="card-base card-config mb-3 list-toolbar-sticky">
        <div className="form-row mobile-stack" style={{ gap: 12 }}>
          <div className="form-group">
            <h3 className="page-title">✉️ Configurações de envio de e-mail</h3>
            <p className="page-subtitle">
              Em hospedagens como Cloudflare Pages, SMTP via porta TCP não funciona. Para envio, prefira Resend (API
              HTTP). SMTP fica como fallback para ambientes com TCP. Recebimento foi desativado.
            </p>
          </div>
        </div>
      </div>

      {erro && (
        <div className="mt-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {loading ? (
        <p className="mt-4">Carregando configurações...</p>
      ) : (
        <form className="card-base card-config mt-4" onSubmit={salvar}>
          <div className="form-group">
            <label className="form-label">Resend API Key (recomendado)</label>
            <div className="password-field">
              <input
                className="form-input"
                type={mostrarResend ? "text" : "password"}
                value={form.resend_api_key}
                onChange={(e) => setForm((prev) => ({ ...prev, resend_api_key: e.target.value }))}
                placeholder="re_..."
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setMostrarResend((prev) => !prev)}
                aria-label={mostrarResend ? "Ocultar chave" : "Mostrar chave"}
              >
                {mostrarResend ? "🙈" : "👁️"}
              </button>
            </div>
            <small style={{ color: "#94a3b8" }}>
              Esta chave é usada para enviar via API HTTP (Resend).
            </small>
          </div>

          <div className="form-row mobile-stack">
            <div className="form-group flex-1">
              <label className="form-label">Enviar teste para</label>
              <input
                className="form-input"
                type="email"
                value={testeEmail}
                onChange={(e) => setTesteEmail(e.target.value.toLowerCase())}
                placeholder={form.admin_from_email || DEFAULT_FROM_EMAILS.admin}
              />
            </div>
            <div className="form-group w-full sm:w-40">
              <label className="form-label">&nbsp;</label>
              <button
                type="button"
                className="btn btn-light w-full"
                onClick={enviarTeste}
                disabled={enviandoTeste}
              >
                {enviandoTeste ? "Enviando..." : "Testar envio"}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Usar SMTP como fallback?</label>
            <label className="flex items-center gap-2 text-sm text-slate-400">
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
              Ative somente se seu servidor permite conexões SMTP (TCP).
            </label>
          </div>

          {usarSmtp && (
          <>
          <div className="form-row mobile-stack">
            <div className="form-group flex-1">
              <label className="form-label">SMTP Host</label>
              <input
                className="form-input"
                value={form.smtp_host}
                onChange={(e) => setForm((prev) => ({ ...prev, smtp_host: e.target.value }))}
                disabled={!usarSmtp}
                placeholder="smtp.hostinger.com"
              />
            </div>
            <div className="form-group w-full sm:w-40">
              <label className="form-label">Porta</label>
              <input
                className="form-input"
                type="number"
                min="1"
                value={form.smtp_port}
                onChange={(e) => setForm((prev) => ({ ...prev, smtp_port: e.target.value }))}
                disabled={!usarSmtp}
                placeholder="465"
              />
            </div>
            <div className="form-group w-full sm:w-40">
              <label className="form-label">SSL?</label>
              <select
                className="form-select"
                value={form.smtp_secure ? "true" : "false"}
                onChange={(e) => setForm((prev) => ({ ...prev, smtp_secure: e.target.value === "true" }))}
                disabled={!usarSmtp}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
          </div>

          <div className="form-row mobile-stack">
            <div className="form-group flex-1">
              <label className="form-label">Usuário SMTP</label>
              <input
                className="form-input"
                value={form.smtp_user}
                onChange={(e) => setForm((prev) => ({ ...prev, smtp_user: e.target.value }))}
                disabled={!usarSmtp}
              />
            </div>
            <div className="form-group flex-1">
              <label className="form-label">Senha SMTP</label>
              <div className="password-field">
                <input
                  className="form-input"
                  type={mostrarSenha ? "text" : "password"}
                  value={form.smtp_pass}
                  onChange={(e) => setForm((prev) => ({ ...prev, smtp_pass: e.target.value }))}
                  disabled={!usarSmtp}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setMostrarSenha((prev) => !prev)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  disabled={!usarSmtp}
                >
                  {mostrarSenha ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
          </div>
          </>
          )}

          <div className="form-row">
            <div className="form-group flex-1">
              <label className="form-label">E-mail padrão (fallback)</label>
              <input
                className="form-input"
                type="email"
                value={form.alerta_from_email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, alerta_from_email: e.target.value.toLowerCase() }))
                }
                placeholder={DEFAULT_FROM_EMAILS.admin}
              />
              <small style={{ color: "#94a3b8" }}>
                Se não informar os específicos, o sistema usa este.
              </small>
            </div>
            <div className="form-group flex-1">
              <label className="form-label">E-mail admin</label>
              <input
                className="form-input"
                type="email"
                value={form.admin_from_email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, admin_from_email: e.target.value.toLowerCase() }))
                }
                placeholder={DEFAULT_FROM_EMAILS.admin}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label className="form-label">E-mail de avisos</label>
              <input
                className="form-input"
                type="email"
                value={form.avisos_from_email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, avisos_from_email: e.target.value.toLowerCase() }))
                }
                placeholder={DEFAULT_FROM_EMAILS.avisos}
              />
            </div>
            <div className="form-group flex-1">
              <label className="form-label">E-mail financeiro</label>
              <input
                className="form-input"
                type="email"
                value={form.financeiro_from_email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, financeiro_from_email: e.target.value.toLowerCase() }))
                }
                placeholder={DEFAULT_FROM_EMAILS.financeiro}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label className="form-label">E-mail suporte</label>
              <input
                className="form-input"
                type="email"
                value={form.suporte_from_email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, suporte_from_email: e.target.value.toLowerCase() }))
                }
                placeholder={DEFAULT_FROM_EMAILS.suporte}
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>
        </form>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default EmailSettingsAdminIsland;
