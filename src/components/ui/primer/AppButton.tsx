import React from "react";
import { Button as PrimerButton } from "@primer/react";

type PrimerButtonProps = React.ComponentProps<typeof PrimerButton>;

type AppButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "link";

type AppButtonProps = Omit<PrimerButtonProps, "variant"> & {
  variant?: AppButtonVariant;
  block?: boolean;
};

const variantMap: Record<AppButtonVariant, NonNullable<PrimerButtonProps["variant"]>> = {
  default: "default",
  primary: "primary",
  secondary: "default",
  danger: "danger",
  ghost: "invisible",
  link: "link",
};

export default function AppButton({
  variant = "default",
  block = false,
  className,
  ...props
}: AppButtonProps) {
  return (
    <PrimerButton
      {...props}
      block={block}
      variant={variantMap[variant]}
      className={["vtur-app-button", `vtur-app-button-${variant}`, className].filter(Boolean).join(" ")}
    />
  );
}
