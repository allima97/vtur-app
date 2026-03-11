import React from "react";
import { Button as PrimeButton } from "primereact/button";

type PrimeButtonProps = React.ComponentProps<typeof PrimeButton>;

type AppButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "link";

type AppButtonProps = Omit<PrimeButtonProps, "severity" | "outlined" | "text" | "link" | "label"> & {
  variant?: AppButtonVariant;
  block?: boolean;
  children?: React.ReactNode;
};

const variantClassMap: Record<AppButtonVariant, string> = {
  default: "",
  primary: "",
  secondary: "p-button-outlined",
  danger: "p-button-danger",
  ghost: "p-button-text",
  link: "p-button-link",
};

export default function AppButton({
  variant = "default",
  block = false,
  className,
  children,
  ...props
}: AppButtonProps) {
  const isPrimitiveChild = typeof children === "string" || typeof children === "number";
  const resolvedLabel = isPrimitiveChild ? String(children) : undefined;

  return (
    <PrimeButton
      {...props}
      label={resolvedLabel}
      className={[
        "vtur-app-button",
        `vtur-app-button-${variant}`,
        variantClassMap[variant],
        block ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isPrimitiveChild ? null : children}
    </PrimeButton>
  );
}
