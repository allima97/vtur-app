import React, { useId, useMemo } from "react";

type AppMultiSelectOption = {
  label: React.ReactNode;
  value: string;
  disabled?: boolean;
};

type AppMultiSelectFieldProps = {
  label: React.ReactNode;
  values: string[];
  options: AppMultiSelectOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  caption?: React.ReactNode;
  wrapperClassName?: string;
  emptyLabel?: React.ReactNode;
};

function labelToText(label: React.ReactNode) {
  if (typeof label === "string" || typeof label === "number") {
    return String(label);
  }
  return "";
}

export default function AppMultiSelectField({
  label,
  values,
  options,
  onChange,
  placeholder = "Selecione",
  caption,
  wrapperClassName,
  emptyLabel = "Nenhuma opção disponível",
}: AppMultiSelectFieldProps) {
  const generatedId = useId();
  const selectedSet = useMemo(() => new Set(values), [values]);
  const selectableValues = useMemo(
    () => options.filter((option) => !option.disabled).map((option) => option.value),
    [options]
  );

  const selectedLabels = useMemo(
    () =>
      options
        .filter((option) => selectedSet.has(option.value))
        .map((option) => labelToText(option.label))
        .filter(Boolean),
    [options, selectedSet]
  );

  const summaryText =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
      ? selectedLabels.join(", ")
      : `${selectedLabels.length} selecionados`;

  const toggleValue = (value: string) => {
    if (!value) return;
    if (selectedSet.has(value)) {
      onChange(values.filter((current) => current !== value));
      return;
    }
    onChange([...values, value]);
  };

  const selecionarTodos = () => {
    onChange(selectableValues);
  };

  const limparSelecao = () => {
    onChange([]);
  };

  return (
    <div className={["vtur-app-field", wrapperClassName].filter(Boolean).join(" ")}>
      <label htmlFor={generatedId} className="vtur-app-field-label">
        {label}
      </label>

      <details className="vtur-multi-select" id={generatedId}>
        <summary className="p-inputtext p-component vtur-multi-select-summary">
          <span
            className={
              selectedLabels.length > 0
                ? "vtur-multi-select-summary-text"
                : "vtur-multi-select-summary-text is-placeholder"
            }
          >
            {summaryText}
          </span>
          <span className="vtur-multi-select-summary-meta">
            {selectedLabels.length > 0 ? `${selectedLabels.length}` : ""}
          </span>
        </summary>

        <div className="vtur-multi-select-panel">
          <div className="vtur-multi-select-actions">
            <button type="button" onClick={selecionarTodos}>
              Selecionar todos
            </button>
            <button type="button" onClick={limparSelecao}>
              Limpar
            </button>
          </div>

          {options.length === 0 ? (
            <div className="vtur-multi-select-empty">{emptyLabel}</div>
          ) : (
            <div className="vtur-multi-select-options">
              {options.map((option) => {
                const checked = selectedSet.has(option.value);
                return (
                  <label
                    key={option.value}
                    className={`vtur-multi-select-option${checked ? " is-selected" : ""}${
                      option.disabled ? " is-disabled" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={option.disabled}
                      onChange={() => toggleValue(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </details>

      {caption && <small className="vtur-app-field-caption">{caption}</small>}
    </div>
  );
}
