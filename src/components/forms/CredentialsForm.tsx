import React from "react";
import AppField from "../ui/primer/AppField";
import AppButton from "../ui/primer/AppButton";
import PasswordField from "../ui/primer/PasswordField";

type CredentialsFormProps = {
  email: string;
  password: string;
  confirmPassword: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  disabled?: boolean;
};

export default function CredentialsForm({
  email,
  password,
  confirmPassword,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  disabled = false,
}: CredentialsFormProps) {
  return (
    <>
      <AppField
        as="input"
        id="cadastro-email"
        type="email"
        label="E-mail"
        placeholder="seu@email.com"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value.toLowerCase())}
        disabled={disabled}
      />
      <PasswordField
        id="cadastro-senha"
        label={<><i className="pi pi-lock" aria-hidden="true"></i> Senha</>}
        placeholder="Mínimo 6 caracteres"
        required
        autoComplete="new-password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        disabled={disabled}
      />
      <p className="auth-hint">
        <i className="pi pi-info-circle"></i> A senha deve conter no mínimo 6 caracteres
      </p>
      <PasswordField
        id="cadastro-confirmar"
        label={<><i className="pi pi-lock" aria-hidden="true"></i> Confirmar senha</>}
        placeholder="Repita a senha"
        required
        value={confirmPassword}
        onChange={(e) => onConfirmPasswordChange(e.target.value)}
        disabled={disabled}
      />
    </>
  );
}
