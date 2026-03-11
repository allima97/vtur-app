import React from "react";
import AppField from "./primer/AppField";
import AppPrimerProvider from "./primer/AppPrimerProvider";

type SearchInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  helpText?: string;
  wrapperClassName?: string;
  inputClassName?: string;
};

export default function SearchInput({
  label,
  value,
  onChange,
  placeholder = "Buscar...",
  name,
  disabled = false,
  helpText,
  wrapperClassName,
  inputClassName,
}: SearchInputProps) {
  return (
    <AppPrimerProvider>
      <AppField
        label={label || "Buscar"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        name={name}
        disabled={disabled}
        caption={helpText}
        wrapperClassName={wrapperClassName}
        className={["w-full", "search-input-field", inputClassName].filter(Boolean).join(" ")}
      />
    </AppPrimerProvider>
  );
}
