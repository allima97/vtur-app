import React, { useId } from "react";

type FileUploadFieldProps = {
  label: React.ReactNode;
  accept?: string;
  disabled?: boolean;
  multiple?: boolean;
  fileName?: React.ReactNode;
  caption?: React.ReactNode;
  wrapperClassName?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  buttonLabel?: React.ReactNode;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
};

export default function FileUploadField({
  label,
  accept,
  disabled,
  multiple,
  fileName,
  caption,
  wrapperClassName,
  inputRef,
  buttonLabel,
  onChange,
}: FileUploadFieldProps) {
  const generatedId = useId();
  const triggerClassName = [
    "vtur-import-upload-trigger",
    "p-button",
    "p-component",
    "vtur-app-button",
    "vtur-app-button-primary",
    disabled ? "is-disabled p-disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={["vtur-app-field", wrapperClassName].filter(Boolean).join(" ")}>
      <label htmlFor={generatedId} className="vtur-app-field-label">
        {label}
      </label>
      <div className="vtur-import-upload-stack">
        <div className="vtur-import-upload-row">
          <input
            id={generatedId}
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={accept}
            disabled={disabled}
            multiple={multiple}
            onChange={onChange}
          />
          <label
            htmlFor={generatedId}
            className={triggerClassName}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const input = document.getElementById(generatedId) as HTMLInputElement | null;
                input?.click();
              }
            }}
          >
            <span className="p-button-icon p-c pi pi-upload" aria-hidden="true" />
            <span className="p-button-label p-c">{buttonLabel || "Escolher arquivo"}</span>
          </label>
          <span className="vtur-import-file-name">{fileName || "Nenhum arquivo escolhido"}</span>
        </div>
      </div>
      {caption ? <small className="vtur-app-field-caption">{caption}</small> : null}
    </div>
  );
}
