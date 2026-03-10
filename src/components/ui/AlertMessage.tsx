import React from "react";
import { Flash } from "@primer/react";

type AlertVariant = "success" | "error" | "warning" | "info";

type AlertMessageProps = {
  variant?: AlertVariant;
  className?: string;
  children: React.ReactNode;
};

const variantMap: Record<AlertVariant, "success" | "danger" | "warning" | "default"> = {
  success: "success",
  error: "danger",
  warning: "warning",
  info: "default",
};

export default function AlertMessage({
  variant = "info",
  className = "",
  children,
}: AlertMessageProps) {
  if (!children) return null;
  return (
    <Flash variant={variantMap[variant] || "default"} className={`vtur-alert ${className}`.trim()}>
      {children}
    </Flash>
  );
}
