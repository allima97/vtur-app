import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { registrarLog } from "../../lib/logs";
import { SYSTEM_NAME } from "../../lib/systemName";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
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

export default function AuthResetIsland() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [hasRecoveryToken, setHasRecoveryToken] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const { accessToken, refreshToken, type } = parseHashTokens(url.hash);
    const hasToken = Boolean(code || (type === "recovery" && accessToken && refreshToken));

    setHasRecoveryToken(hasToken);
    if (!hasToken) {
      void supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.id) {
          setValidLink(true);
          return;
        }
        setErro("Link de recuperação inválido ou expirado.");
      });
    }
  }, []);

  async function validarLink() {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const { accessToken, refreshToken, type } = parseHashTokens(url.hash);

    setErro("");
    setLoading(true);

    try {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (type === "recovery" && accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      } else {
        const { data } = await supabase.auth.getUser();
        if (!data?.user?.id) {
          throw new Error("Link de recuperação inválido ou expirado.");
        }
      }

      try {
        url.searchParams.delete("code");
        ["type", "token", "access_token", "refresh_token"].forEach((key) => url.searchParams.delete(key));
        url.hash = "";
        window.history.replaceState({}, "", url.pathname);
      } catch {}

      setValidLink(true);
      setHasRecoveryToken(false);
    } catch (error: any) {
      console.error(error);
      setErro("Link de recuperação inválido ou expirado.");
      await registrarLog({
        user_id: null,
        acao: "reset_link_invalido",
        modulo: "login",
        detalhes: { motivo: error?.message || "token_invalido" },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOk(false);

    if (!validLink) {
      setErro("Link de recuperação inválido ou expirado.");
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
      const { error } = await supabase.auth.updateUser({ password });
      const { data: usuario } = await supabase.auth.getUser();
      const userId = usuario?.user?.id ?? null;

      if (error) {
        setErro("Não foi possível alterar a senha.");
        await registrarLog({
          user_id: userId,
          acao: "reset_senha_falhou",
          modulo: "login",
          detalhes: { motivo: error.message },
        });
        return;
      }

      if (userId) {
        await supabase
          .from("users")
          .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
          .eq("id", userId);
      }

      await registrarLog({
        user_id: userId,
        acao: "reset_senha_sucesso",
        modulo: "login",
        detalhes: {},
      });

      setOk(true);
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        window.location.href = "/auth/login";
      }, 1200);
    } catch (err) {
      console.error(err);
      setErro("Erro inesperado ao alterar senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppPrimerProvider>
      <div className="auth-container">
        <AppCard
          className="auth-card auth-card-lg auth-card-reset"
          title="Definir nova senha"
          subtitle={`Crie uma nova senha para voltar a usar o ${SYSTEM_NAME}.`}
        >
        {erro && <AlertMessage variant="error" className="mb-3">{erro}</AlertMessage>}
        {ok && (
          <AlertMessage variant="success" className="mb-3">
            Senha alterada com sucesso. Redirecionando...
          </AlertMessage>
        )}
        {!ok && !validLink && hasRecoveryToken && (
          <AlertMessage variant="warn" className="mb-3">
            Para sua segurança, valide o link antes de definir a nova senha.
          </AlertMessage>
        )}
        {!ok && !validLink && hasRecoveryToken ? (
          <div className="auth-actions mb-3">
            <AppButton type="button" variant="primary" disabled={loading} onClick={validarLink}>
              {loading ? "Validando..." : "Validar link de recuperação"}
            </AppButton>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="auth-form">
          <PasswordField
            id="senha"
            label={<><i className="pi pi-lock" aria-hidden="true"></i> Nova senha</>}
            placeholder="Mínimo 6 caracteres"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading || !validLink}
          />
          <PasswordField
            id="confirmar"
            label={<><i className="pi pi-lock" aria-hidden="true"></i> Confirmar nova senha</>}
            placeholder="Repita a senha"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading || !validLink}
          />
          <div className="auth-actions">
            <AppButton type="submit" variant="primary" disabled={loading || !validLink}>
              {loading ? "Salvando..." : "Salvar nova senha"}
            </AppButton>
            <div className="auth-divider">
              <span>ou</span>
            </div>
            <AppButton as="a" href="/auth/login" variant="secondary" block>
              Voltar ao login
            </AppButton>
          </div>
        </form>
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}
