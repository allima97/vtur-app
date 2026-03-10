import React, { useId } from "react";
import { FormControl, Select, Textarea, TextInput } from "@primer/react";

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
    <FormControl
      id={controlId}
      required={required}
      disabled={disabled}
      className={["vtur-app-field", wrapperClassName].filter(Boolean).join(" ")}
    >
      <FormControl.Label>{label}</FormControl.Label>

      {as === "textarea" ? (
        <Textarea
          id={controlId}
          block={block}
          disabled={disabled}
          required={required}
          validationStatus={validationStatus}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : as === "select" ? (
        <Select
          id={controlId}
          block={block}
          disabled={disabled}
          required={required}
          validationStatus={validationStatus}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {options.map((option) => (
            <Select.Option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      ) : (
        <TextInput
          id={controlId}
          block={block}
          disabled={disabled}
          required={required}
          validationStatus={validationStatus}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {caption && <FormControl.Caption>{caption}</FormControl.Caption>}
      {validation && <FormControl.Validation variant={validationVariant}>{validation}</FormControl.Validation>}
    </FormControl>
  );
}
