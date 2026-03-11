import React, { useState } from "react";
import AppField from "../ui/primer/AppField";
import AppButton from "../ui/primer/AppButton";

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      <div className="form-group">
        <label htmlFor="cadastro-senha">
          <i className="pi pi-lock"></i> Senha
        </label>
        <div className="password-field">
          <input
            id="cadastro-senha"
            type={showPassword ? "text" : "password"}
            className="form-input"
            placeholder="Mínimo 6 caracteres"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={disabled}
          />
          <AppButton
            type="button"
            variant="ghost"
            className="password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            tabIndex={disabled ? -1 : 0}
          >
            <i className={showPassword ? "pi pi-eye-slash" : "pi pi-eye"} />
          </AppButton>
        </div>
      </div>
      <p className="auth-hint">
        <i className="pi pi-info-circle"></i> A senha deve conter no mínimo 6 caracteres
      </p>
      <div className="form-group">
        <label htmlFor="cadastro-confirmar">
          <i className="pi pi-lock"></i> Confirmar senha
        </label>
        <div className="password-field">
          <input
            id="cadastro-confirmar"
            type={showConfirmPassword ? "text" : "password"}
            className="form-input"
            placeholder="Repita a senha"
            required
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            disabled={disabled}
          />
          <AppButton
            type="button"
            variant="ghost"
            className="password-toggle"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showConfirmPassword}
            tabIndex={disabled ? -1 : 0}
          >
            <i className={showConfirmPassword ? "pi pi-eye-slash" : "pi pi-eye"} />
          </AppButton>
        </div>
      </div>
    </>
  );
}
