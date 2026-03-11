import React, { useId } from "react";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";

type AppFieldOption = {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
};

type AppFieldCommonProps = {
  as?: "input" | "select" | "textarea";
  label: React.ReactNode;
  caption?: React.ReactNode;
  validation?: React.ReactNode;
  validationVariant?: "error" | "success";
  wrapperClassName?: string;
  block?: boolean;
  options?: AppFieldOption[];
};

type AppFieldProps = AppFieldCommonProps &
  (
    | React.InputHTMLAttributes<HTMLInputElement>
    | React.SelectHTMLAttributes<HTMLSelectElement>
    | React.TextareaHTMLAttributes<HTMLTextAreaElement>
  );

export default function AppField(props: AppFieldProps) {
  const {
    as = "input",
    label,
    caption,
    validation,
    validationVariant = "error",
    wrapperClassName,
    block = true,
    options = [],
    id,
    required,
    disabled,
    ...rest
  } = props;
  const generatedId = useId();
  const controlId = id || generatedId;
  const validationStatus = validation ? validationVariant : undefined;

  return (
    <div className={["vtur-app-field", wrapperClassName].filter(Boolean).join(" ")}>
      <label htmlFor={controlId} className="vtur-app-field-label">
        {label}
      </label>

      {as === "textarea" ? (
        <InputTextarea
          id={controlId}
          className={block ? "w-full" : undefined}
          disabled={disabled}
          required={required}
          invalid={validationStatus === "error"}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : as === "select" ? (
        <select
          id={controlId}
          className={["p-inputtext p-component", block ? "w-full" : ""].filter(Boolean).join(" ")}
          disabled={disabled}
          required={required}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <InputText
          id={controlId}
          className={block ? "w-full" : undefined}
          disabled={disabled}
          required={required}
          invalid={validationStatus === "error"}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {caption && <small className="vtur-app-field-caption">{caption}</small>}
      {validation && (
        <small className={`vtur-app-field-validation vtur-app-field-validation-${validationVariant}`}>
          {validation}
        </small>
      )}
    </div>
  );
}
