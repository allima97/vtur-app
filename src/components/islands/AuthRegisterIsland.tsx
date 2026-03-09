import React, { useState } from "react";
import { useRegisterForm } from "../../lib/useRegisterForm";
import CredentialsForm from "../forms/CredentialsForm";
import { SYSTEM_NAME } from "../../lib/systemName";

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
    <div className="auth-container">
      <div className="auth-card auth-card-lg">
        {modalSucesso && (
          <div className="modal">
            <div className="modal-overlay" onClick={fecharModalSucesso}></div>
            <div className="modal-content">
              <div className="modal-header">
                <i className="fa-solid fa-envelope-open-text text-green-600"></i>
                <h2>{successMode === "signup" ? "Confirme seu e-mail" : "Acesso enviado por e-mail"}</h2>
              </div>
              <div className="modal-body">
                {successMode === "signup" ? (
                  <p>
                    Conta criada com sucesso! Para continuar, confirme o e-mail de cadastro e depois faca login.
                  </p>
                ) : (
                  <p>
                    Identificamos um cadastro anterior no Auth. Enviamos e-mail de acesso (confirmacao ou
                    recuperacao, conforme disponibilidade). Se nao receber, aguarde alguns minutos por limite do
                    provedor e tente novamente.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button onClick={fecharModalSucesso} className="btn btn-primary">
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="auth-header">
          <div className="auth-icon">
            <i className="fa-solid fa-plane-departure"></i>
          </div>
          <h1>{`Bem-vindo ao ${SYSTEM_NAME}`}</h1>
          <h2>Sistema de Gerenciamento de Vendas para Turismo</h2>
          <p className="auth-subtitle">
            Cadastre-se, confirme o e-mail e complete seus dados no primeiro acesso.
          </p>
        </div>

        {registerForm.message && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            {registerForm.message}
          </div>
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
            <button type="submit" className="btn btn-primary w-full" disabled={registerForm.loading}>
              <i className="fa-solid fa-user-plus"></i>
              {registerForm.loading ? " Criando..." : " Criar Conta"}
            </button>

            <div className="auth-divider">
              <span>ou</span>
            </div>

            <a href="/auth/login" className="btn btn-secondary w-full">
              <i className="fa-solid fa-right-to-bracket"></i>
              Ja tenho conta
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
