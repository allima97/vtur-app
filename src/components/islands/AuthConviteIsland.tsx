import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { SYSTEM_NAME } from "../../lib/systemName";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import PasswordField from "../ui/primer/PasswordField";

function parseHashTokens(hash: string) {
  const params = new URLSearchParams((hash || "").replace(/^#/, ""));
  return {
    accessToken: params.get("access_token") || "",
    refreshToken: params.get("refresh_token") || "",
    type: params.get("type") || "",
  };
}

export default function AuthConviteIsland() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [inviteId, setInviteId] = useState("");

  const inviteIdLabel = useMemo(() => (inviteId ? `#${inviteId.slice(0, 8)}` : ""), [inviteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const invite = String(url.searchParams.get("invite") || "").trim();
    const code = url.searchParams.get("code");
    const { accessToken, refreshToken } = parseHashTokens(url.hash);

    setInviteId(invite);

    async function exchange() {
      setErro(null);

      if (!invite) {
        setErro("Convite inválido.");
        return;
      }

      setLoading(true);
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error(error);
            setErro("Link de convite inválido ou expirado.");
            setValidLink(false);
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error(error);
            setErro("Link de convite inválido ou expirado.");
            setValidLink(false);
            return;
          }
        } else {
          // Se já existir sessão, permite continuar (ex.: usuário clicou no link logado)
          const { data } = await supabase.auth.getUser();
          if (!data?.user?.id) {
            setErro("Link de convite inválido ou expirado.");
            setValidLink(false);
            return;
          }
        }

        // Limpa a URL (remove code/tokens), mas preserva o invite_id.
        try {
          url.searchParams.delete("code");
          ["type", "token", "access_token", "refresh_token"].forEach((key) =>
            url.searchParams.delete(key)
          );
          url.hash = "";
          const cleaned = `${url.pathname}?invite=${encodeURIComponent(invite)}`;
          window.history.replaceState({}, "", cleaned);
        } catch {}

        setValidLink(true);
      } finally {
        setLoading(false);
      }
    }

    exchange();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);

    if (!validLink) {
      setErro("Link de convite inválido ou expirado.");
      return;
    }
    if (!inviteId) {
      setErro("Convite inválido.");
      return;
    }
    if (password.length < 6) {
      setErro("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setErro("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const { error: passErr } = await supabase.auth.updateUser({ password });
      if (passErr) {
        console.error(passErr);
        setErro("Não foi possível definir a senha.");
        return;
      }

      const resp = await fetch("/api/convites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_id: inviteId }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        setErro(text || "Não foi possível aceitar o convite.");
        return;
      }

      setOk(true);
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        window.location.href = "/perfil/onboarding";
      }, 900);
    } catch (err) {
      console.error(err);
      setErro("Erro inesperado ao aceitar convite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppPrimerProvider>
      <div className="auth-container">
        <AppCard
          className="auth-card auth-card-lg"
          title="Aceitar convite"
          subtitle={`Defina uma senha para acessar o ${SYSTEM_NAME}. ${inviteIdLabel}`}
        >
          <div className="auth-header">
            <div className="auth-icon">
              <i className="pi pi-user-plus" />
            </div>
          </div>

          {erro && (
            <AlertMessage variant="error" className="mb-3">
              {erro}
            </AlertMessage>
          )}
          {ok && (
            <AlertMessage variant="success" className="mb-3">
              Convite aceito! Redirecionando...
            </AlertMessage>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <PasswordField
              id="senha"
              label={
                <>
                  <i className="pi pi-lock" /> Nova senha
                </>
              }
              placeholder="Minimo 6 caracteres"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />

            <PasswordField
              id="confirmar"
              label={
                <>
                  <i className="pi pi-lock" /> Confirmar senha
                </>
              }
              placeholder="Repita a senha"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />

            <div className="auth-actions">
              <AppButton type="submit" variant="primary" block disabled={loading}>
                <i className="pi pi-check" />
                {loading ? " Salvando..." : " Definir senha e continuar"}
              </AppButton>
              <div className="auth-divider">
                <span>ou</span>
              </div>
              <AppButton as="a" href="/auth/login" variant="secondary" block>
                <i className="pi pi-sign-in" />
                Ir para login
              </AppButton>
            </div>
          </form>
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}
