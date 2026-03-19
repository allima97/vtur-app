import React, { useId, useState } from "react";
import { InputText } from "primereact/inputtext";
import AppButton from "./AppButton";

type PasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: React.ReactNode;
  wrapperClassName?: string;
  caption?: React.ReactNode;
  toggleLabels?: {
    show: string;
    hide: string;
  };
};

export default function PasswordField({
  label,
  wrapperClassName,
  caption,
  id,
  className,
  disabled,
  toggleLabels,
  ...rest
}: PasswordFieldProps) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const [visible, setVisible] = useState(false);
  const labels = {
    show: toggleLabels?.show || "Mostrar senha",
    hide: toggleLabels?.hide || "Ocultar senha",
  };
  const { value, defaultValue, ...inputRest } = rest;
  const resolvedValue =
    typeof value === "string" ? value : value == null ? undefined : String(value);
  const resolvedDefaultValue =
    typeof defaultValue === "string" ? defaultValue : defaultValue == null ? undefined : String(defaultValue);

  return (
    <div className={["vtur-app-field", wrapperClassName].filter(Boolean).join(" ")}>
      <label htmlFor={controlId} className="vtur-app-field-label">
        {label}
      </label>
      <div className="password-field">
        <InputText
          id={controlId}
          type={visible ? "text" : "password"}
          className={["form-input", "w-full", className].filter(Boolean).join(" ")}
          disabled={disabled}
          value={resolvedValue}
          defaultValue={resolvedDefaultValue}
          {...inputRest}
        />
        <AppButton
          type="button"
          variant="ghost"
          className="password-toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? labels.hide : labels.show}
          aria-pressed={visible}
          disabled={disabled}
        >
          <i className={`pi ${visible ? "pi-eye-slash" : "pi-eye"}`} aria-hidden="true" />
        </AppButton>
      </div>
      {caption ? <small className="vtur-app-field-caption">{caption}</small> : null}
    </div>
  );
}
