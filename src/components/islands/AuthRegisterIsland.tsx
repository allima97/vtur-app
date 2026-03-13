import React, { useState } from "react";
import { useRegisterForm } from "../../lib/useRegisterForm";
import CredentialsForm from "../forms/CredentialsForm";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppNoticeDialog from "../ui/primer/AppNoticeDialog";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

export default function AuthRegisterIsland() {
  const [modalSucesso, setModalSucesso] = useState(false);
  const [successMode, setSuccessMode] = useState<"signup" | "recovery">("signup");

  const registerForm = useRegisterForm({
    showSuccessMessage: false,
    resetOnSuccess: true,
    onSuccess: () => {
      setSuccessMode("signup");
      setModalSucesso(true);
    },
    onExistingEmail: () => {
      setSuccessMode("recovery");
      setModalSucesso(true);
    },
  });

  function fecharModalSucesso() {
    setModalSucesso(false);
    window.location.href = "/auth/login";
  }

  return (
    <AppPrimerProvider>
      <div className="auth-container auth-container-wide">
        <AppCard
          className="auth-card auth-card-lg auth-card-with-logo auth-card-register"
          title={
            <span className="auth-brand-title">
              <img className="auth-brand-logo" src="/brand/vtur-logo-stacked.svg" alt="VTUR" />
              <span>Bem-vindo!</span>
            </span>
          }
          subtitle="Cadastre-se, confirme o e-mail e complete seus dados no primeiro acesso."
        >
          <AppNoticeDialog
            open={modalSucesso}
            title={successMode === "signup" ? "Confirme seu e-mail" : "Acesso enviado por e-mail"}
            onClose={fecharModalSucesso}
            message={
              successMode === "signup"
                ? "Conta criada com sucesso. Para continuar, confirme o e-mail de cadastro e depois faça login."
                : "Identificamos um cadastro anterior no Auth. Enviamos e-mail de acesso, confirmação ou recuperação conforme disponibilidade. Se não receber, aguarde alguns minutos e tente novamente."
            }
          />

          {registerForm.message && (
            <AlertMessage variant="error" className="mb-3">
              {registerForm.message}
            </AlertMessage>
          )}

          <form onSubmit={registerForm.handleSubmit} className="auth-form">
            <CredentialsForm
              email={registerForm.email}
              password={registerForm.password}
              confirmPassword={registerForm.confirmPassword}
              onEmailChange={registerForm.setEmail}
              onPasswordChange={registerForm.setPassword}
              onConfirmPasswordChange={registerForm.setConfirmPassword}
              disabled={registerForm.loading}
            />

            <div className="auth-actions">
              <AppButton type="submit" variant="primary" disabled={registerForm.loading} block>
                {registerForm.loading ? "Criando..." : "Criar conta"}
              </AppButton>

              <div className="auth-divider">
                <span>ou</span>
              </div>

              <AppButton as="a" href="/auth/login" variant="secondary" block>
                Já tenho conta
              </AppButton>
            </div>
          </form>
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}
