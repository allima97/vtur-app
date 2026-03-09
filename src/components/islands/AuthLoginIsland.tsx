import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { registrarLog } from "../../lib/logs";
import { SUPPORT_EMAIL, SYSTEM_NAME } from "../../lib/systemName";
import { clearPermissoesCache } from "../../lib/permissoesCache";
import { refreshPermissoes } from "../../lib/permissoesStore";

export default function AuthLoginIsland() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: "success" | "danger" | "warning" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalSuspenso, setModalSuspenso] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function getIP() {
    try {
      const resp = await fetch("https://api.ipify.org?format=json");
      const j = await resp.json();
      return j.ip || "";
    } catch {
      return "";
    }
  }

  function mostrarMensagem(msg: string, tipo: "success" | "danger" | "warning" = "danger") {
    setMensagem({ texto: msg, tipo });
    setTimeout(() => setMensagem(null), 5000);
  }

  async function ensureUserProfile(userId: string, email: string) {
    try {
      const resp = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, email }),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
    } catch (err) {
      console.error("Falha ao criar perfil mínimo", err);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "signup") {
      mostrarMensagem("E-mail confirmado! Faça login para continuar.", "success");
      ["type", "access_token", "token"].forEach((key) => params.delete(key));
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  function abrirModalSuspenso() {
    setModalSuspenso(true);
  }
  function fecharModalSuspenso() {
    setModalSuspenso(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMensagem(null);
    setLoading(true);

    const emailLimpo = email.trim().toLowerCase();
    const senha = password;

    if (!emailLimpo || !senha) {
      mostrarMensagem("Informe e-mail e senha");
      setLoading(false);
      return;
    }

    const ip = await getIP();
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

    try {
      await registrarLog({ user_id: null, acao: "tentativa_login", modulo: "login", detalhes: { email: emailLimpo } });
      const { data, error } = await supabase.auth.signInWithPassword({ email: emailLimpo, password: senha });
      if (error) {
        await registrarLog({ user_id: null, acao: "login_falhou", modulo: "login", detalhes: { email, motivo: error.message, ip, userAgent } });
        const rawMsg = String(error?.message || "").toLowerCase();
        const needsEmailConfirm =
          rawMsg.includes("email not confirmed") ||
          rawMsg.includes("confirm your email") ||
          rawMsg.includes("confirm email") ||
          rawMsg.includes("email needs to be confirmed");
        if (needsEmailConfirm) {
          mostrarMensagem("Confirme seu e-mail antes de acessar o sistema.", "warning");
          setLoading(false);
          return;
        }
        const invalidCreds =
          rawMsg.includes("invalid login credentials") ||
          rawMsg.includes("invalid_credentials") ||
          rawMsg.includes("email not found") ||
          rawMsg.includes("senha") ||
          rawMsg.includes("password");
        if (invalidCreds) {
          mostrarMensagem(
            "Credenciais inválidas. Se sua conta foi recriada recentemente, use 'Esqueci minha senha' para definir uma nova senha.",
            "warning"
          );
        } else {
          mostrarMensagem("E-mail ou senha incorretos. Verifique seus dados e tente novamente.");
        }
        setLoading(false);
        return;
      }
      const user = data.user;
      const userId = user?.id || null;
      await registrarLog({ user_id: userId, acao: "login_sucesso", modulo: "login", detalhes: { email: emailLimpo, userId, ip, userAgent } });
      const authedEmail = user?.email || emailLimpo;
      // Buscar dados do usuário
      const { data: perfil, error: userError } = await supabase
        .from("users")
        .select(
          "nome_completo, active, company_id, cpf, telefone, cidade, estado, uso_individual, must_change_password, user_types(name)"
        )
        .eq("id", userId)
        .maybeSingle();
      // Fallback para bancos sem coluna active
      let perfilFinal = perfil;
      const missingActiveColumn = userError && (userError.code === "42703" || userError.message?.toLowerCase().includes("active"));
      if (missingActiveColumn) {
        const { data: fallbackData } = await supabase
          .from("users")
          .select("nome_completo, company_id, cpf, telefone, cidade, estado, uso_individual")
          .eq("id", userId)
          .maybeSingle();
        perfilFinal = fallbackData;
      }
      const hasFatalProfileError = Boolean(userError && !missingActiveColumn);

      // Se deu erro ao consultar o perfil (ex.: RLS/perm), não trate como "perfil inexistente".
      // Isso evita mandar TODO MUNDO para onboarding e perder sessão no redirect.
      if (hasFatalProfileError) {
        console.error("Falha ao carregar perfil do usuário no login", userError);
      }

      if (!perfilFinal && !hasFatalProfileError) {
        await ensureUserProfile(userId, authedEmail);
        mostrarMensagem("Criando seu perfil de acesso. Complete os dados abaixo.");
        window.location.replace("/perfil/onboarding");
        return;
      }

      // Se não conseguimos ler o perfil por erro (ex.: RLS), não faça checks que dependem do perfil.
      // Deixa o middleware/server decidir o redirecionamento; aqui só evita loop/crash no client.
      if (!perfilFinal && hasFatalProfileError) {
        const tipoRaw =
          (user?.user_metadata as any)?.tipo_usuario ||
          (user?.user_metadata as any)?.role ||
          "";
        const tipoNorm = String(tipoRaw).trim().toUpperCase();
        const destino = tipoNorm.includes("ADMIN")
          ? "/dashboard/admin"
          : tipoNorm.includes("GESTOR")
          ? "/dashboard/gestor"
          : "/dashboard";

        clearPermissoesCache();
        await refreshPermissoes();
        window.location.replace(destino);
        return;
      }
      // Usuário suspenso
      if (perfilFinal && (perfilFinal as any).active === false) {
        abrirModalSuspenso();
        await supabase.auth.signOut();
        clearPermissoesCache();
        setLoading(false);
        return;
      }
      // Onboarding
      const precisaOnboarding =
        !perfilFinal.nome_completo ||
        !perfilFinal.telefone ||
        !perfilFinal.cidade ||
        !perfilFinal.estado ||
        perfilFinal.uso_individual === null ||
        perfilFinal.uso_individual === undefined;
      if (precisaOnboarding) {
        window.location.replace("/perfil/onboarding");
        return;
      }

      if ((perfilFinal as any)?.must_change_password === true) {
        window.location.replace("/perfil?force_password=1");
        return;
      }

      const tipoRaw =
        perfilFinal.user_types?.name ||
        (user?.user_metadata as any)?.tipo_usuario ||
        (user?.user_metadata as any)?.role ||
        "";
      const tipoNorm = tipoRaw.trim().toUpperCase();

      const destino = tipoNorm.includes("ADMIN")
        ? "/dashboard/admin"
        : tipoNorm.includes("GESTOR")
        ? "/dashboard/gestor"
        : "/dashboard";

      clearPermissoesCache();
      await refreshPermissoes();

      window.location.replace(destino);
    } catch (e: any) {
      await registrarLog({ user_id: null, acao: "login_erro_interno", modulo: "login", detalhes: { email, erro: e.message, ip, userAgent } });
      mostrarMensagem("Erro inesperado ao fazer login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card auth-card-lg">
        <div className="auth-header">
          <div className="auth-icon">
            <i className="fa-solid fa-plane-departure" aria-hidden />
          </div>
          <h1>{`Bem-vindo ao ${SYSTEM_NAME}`}</h1>
          <p className="auth-subtitle">Use seu e-mail e senha para acessar ou faça seu cadastro</p>
        </div>

        {mensagem && (
          <div className={`alert alert-${mensagem.tipo}`} style={{ marginBottom: 12 }}>
            {mensagem.texto}
          </div>
        )}
        {erro && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{erro}</div>}

        {/* Modal de Acesso Suspenso */}
        {modalSuspenso && (
          <div className="modal">
            <div className="modal-overlay" onClick={fecharModalSuspenso}></div>
            <div className="modal-content">
              <div className="modal-header">
                <i className="fa-solid fa-triangle-exclamation text-yellow-600"></i>
                <h2>Acesso Suspenso</h2>
              </div>
              <div className="modal-body">
                <p className="text-lg font-semibold mb-4">Atenção!</p>
                <p className="text-gray-700 mb-6">
                  Seu acesso está suspenso, por favor entrar em contato com o Gestor ou Administrador do sistema.
                </p>
                <div className="contact-info">
                  <p className="text-sm text-gray-600">Se você acredita que isto é um erro, entre em contato:</p>
                  <ul className="mt-3 space-y-2 text-sm">
                    <li><strong>Email:</strong> {SUPPORT_EMAIL}</li>
                    <li><strong>Telefone:</strong> (11) 1234-5678</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button onClick={fecharModalSuspenso} className="btn btn-secondary">Fechar</button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email"><i className="fa-solid fa-envelope"></i> E-mail</label>
            <input
              type="email"
              id="email"
              className="form-input"
              placeholder="seu@email.com"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value.toLowerCase())}
            />
          </div>
          <div className="form-group">
            <label htmlFor="senha"><i className="fa-solid fa-lock"></i> Senha</label>
            <div className="password-field">
              <input
                type={mostrarSenha ? "text" : "password"}
                id="senha"
                className="form-input"
                placeholder="Digite sua senha"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setMostrarSenha((prev) => !prev)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarSenha}
              >
                <i className={`fa-solid ${mostrarSenha ? "fa-eye-slash" : "fa-eye"}`} />
              </button>
            </div>
          </div>
          <div className="auth-links auth-links-forgot">
            <a href="/auth/recover">
              <i className="fa-solid fa-unlock-keyhole"></i>
              Esqueceu a senha? Redefinir
            </a>
          </div>
          <div className="auth-actions">
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              <i className="fa-solid fa-right-to-bracket"></i>
              {loading ? " Entrando..." : " Entrar"}
            </button>
            <a
              href="/auth/register"
              className="btn btn-secondary btn-block"
            >
              <i className="fa-solid fa-user-plus"></i>
              Criar Nova Conta
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
