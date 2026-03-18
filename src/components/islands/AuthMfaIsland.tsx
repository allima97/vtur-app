import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { clearPermissoesCache } from "../../lib/permissoesCache";
import { refreshPermissoes } from "../../lib/permissoesStore";
import { registrarLog } from "../../lib/logs";
import {
  getPrimaryVerifiedTotpFactor,
  normalizeMfaCode,
  normalizeMfaRedirectPath,
} from "../../lib/authMfa";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  factor_type?: string | null;
  status?: string | null;
};

export default function AuthMfaIsland() {
  const [loading, setLoading] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [factor, setFactor] = useState<MfaFactor | null>(null);

  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return "/dashboard";
    const params = new URLSearchParams(window.location.search);
    return normalizeMfaRedirectPath(params.get("next"), "/dashboard");
  }, []);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        setErro(null);

        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user) {
          window.location.replace("/auth/login");
          return;
        }

        const [{ data: aalData, error: aalError }, { data: factorsData, error: factorsError }] =
          await Promise.all([
            supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
            supabase.auth.mfa.listFactors(),
          ]);

        if (aalError) throw aalError;
        if (factorsError) throw factorsError;

        if (aalData?.currentLevel === "aal2") {
          clearPermissoesCache();
          await refreshPermissoes();
          window.location.replace(nextPath);
          return;
        }

        const verifiedFactor = getPrimaryVerifiedTotpFactor(factorsData || null);
        if (!verifiedFactor) {
          const policyResp = await fetch("/api/v1/auth/mfa-policy");
          const policyPayload = policyResp.ok
            ? ((await policyResp.json()) as { required?: boolean })
            : { required: false };
          if (policyPayload.required) {
            window.location.replace(`/perfil?setup_2fa=1&next=${encodeURIComponent(nextPath)}`);
            return;
          }
          setErro("Nenhum fator 2FA ativo foi encontrado para esta conta.");
          return;
        }

        setFactor(verifiedFactor as MfaFactor);
        setMsg("Informe o código do seu aplicativo autenticador para continuar.");
      } catch (e: any) {
        console.error("Erro ao carregar desafio MFA", e);
        setErro("Não foi possível carregar a verificação em duas etapas.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [nextPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factor) return;
    const code = normalizeMfaCode(codigo);
    if (code.length !== 6) {
      setErro("Informe o código de 6 dígitos do autenticador.");
      return;
    }

    try {
      setVerificando(true);
      setErro(null);
      setMsg(null);

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (error) throw error;

      await registrarLog({
        user_id: userId,
        acao: "mfa_verificado",
        modulo: "auth_mfa",
        detalhes: { factorId: factor.id },
      });

      clearPermissoesCache();
      await refreshPermissoes();
      window.location.replace(nextPath);
    } catch (e: any) {
      console.error("Erro ao verificar MFA", e);
      setErro("Código inválido ou expirado. Tente novamente.");
      setCodigo("");
      const { data: authData } = await supabase.auth.getUser();
      await registrarLog({
        user_id: authData?.user?.id || null,
        acao: "mfa_verificacao_falhou",
        modulo: "auth_mfa",
        detalhes: { erro: e?.message || "codigo_invalido", factorId: factor.id },
      });
    } finally {
      setVerificando(false);
    }
  }

  async function sair() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Erro ao encerrar sessão MFA", e);
    }
    clearPermissoesCache();
    window.location.replace("/auth/login");
  }

  return (
    <AppPrimerProvider>
      <div className="auth-container auth-container-wide">
        <AppCard
          className="auth-card auth-card-lg auth-card-login"
          title="Verificação em duas etapas"
          subtitle="Confirme o código do seu aplicativo autenticador para finalizar o acesso."
        >
          {loading ? (
            <p>Carregando verificação...</p>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form-stack">
              {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
              {msg && <AlertMessage variant="info">{msg}</AlertMessage>}

              <AppField
                label="Código do autenticador"
                value={codigo}
                onChange={(e) => setCodigo(normalizeMfaCode(e.target.value))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
              />

              {factor && (
                <small>
                  Fator ativo: <strong>{factor.friendly_name || "Aplicativo autenticador"}</strong>
                </small>
              )}

              <div className="mobile-stack-buttons">
                <AppButton type="submit" variant="primary" disabled={verificando || !factor}>
                  {verificando ? "Verificando..." : "Confirmar acesso"}
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={sair} disabled={verificando}>
                  Voltar ao login
                </AppButton>
              </div>
            </form>
          )}
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}
