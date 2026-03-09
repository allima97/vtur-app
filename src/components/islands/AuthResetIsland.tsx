import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { registrarLog } from "../../lib/logs";
import { SYSTEM_NAME } from "../../lib/systemName";

export default function AuthResetIsland() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    async function exchangeCode() {
      if (!code) {
        setErro("Link de recuperação inválido ou expirado.");
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error(error);
        setErro("Link de recuperação inválido ou expirado.");
        await registrarLog({
          user_id: null,
          acao: "reset_link_invalido",
          modulo: "login",
          detalhes: { motivo: error.message },
        });
      } else {
        setValidLink(true);
      }

      setLoading(false);
    }

    exchangeCode();
  }, []);

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
    <div className="auth-container">
      <div className="auth-card auth-card-lg">
        <div className="auth-header">
          <div className="auth-icon">
            <i className="fa-solid fa-plane-departure"></i>
          </div>
          <h1>Definir nova senha</h1>
          <h2 className="auth-subtitle">
            Crie uma nova senha para voltar a usar o {SYSTEM_NAME}.
          </h2>
        </div>
        {erro && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{erro}</div>}
        {ok && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            Senha alterada com sucesso! Redirecionando...
          </div>
        )}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="senha">
              <i className="fa-solid fa-lock"></i> Nova senha
            </label>
            <div className="password-field">
              <input
                type={mostrarSenha ? "text" : "password"}
                id="senha"
                className="form-input"
                placeholder="Mínimo 6 caracteres"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setMostrarSenha((prev) => !prev)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarSenha}
                tabIndex={loading ? -1 : 0}
              >
                <i className={`fa-solid ${mostrarSenha ? "fa-eye-slash" : "fa-eye"}`} />
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="confirmar">
              <i className="fa-solid fa-lock"></i> Confirmar nova senha
            </label>
            <div className="password-field">
              <input
                type={mostrarConfirmacao ? "text" : "password"}
                id="confirmar"
                className="form-input"
                placeholder="Repita a senha"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setMostrarConfirmacao((prev) => !prev)}
                aria-label={mostrarConfirmacao ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarConfirmacao}
                tabIndex={loading ? -1 : 0}
              >
                <i className={`fa-solid ${mostrarConfirmacao ? "fa-eye-slash" : "fa-eye"}`} />
              </button>
            </div>
          </div>
          <div className="auth-actions">
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              <i className="fa-solid fa-key"></i>
              {loading ? " Salvando..." : " Salvar nova senha"}
            </button>
            <div className="auth-divider">
              <span>ou</span>
            </div>
            <a href="/auth/login" className="btn btn-secondary btn-block">
              <i className="fa-solid fa-right-to-bracket"></i>
              Voltar ao login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
