import React, { useState } from "react";
import AppField from "../ui/primer/AppField";

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
          <i className="fa-solid fa-lock"></i> Senha
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
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            tabIndex={disabled ? -1 : 0}
          >
            <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
          </button>
        </div>
      </div>
      <p className="auth-hint">
        <i className="fa-solid fa-info-circle"></i> A senha deve conter no mínimo 6 caracteres
      </p>
      <div className="form-group">
        <label htmlFor="cadastro-confirmar">
          <i className="fa-solid fa-lock"></i> Confirmar senha
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
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showConfirmPassword}
            tabIndex={disabled ? -1 : 0}
          >
            <i className={`fa-solid ${showConfirmPassword ? "fa-eye-slash" : "fa-eye"}`} />
          </button>
        </div>
      </div>
    </>
  );
}
