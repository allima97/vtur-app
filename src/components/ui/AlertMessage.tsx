import React from "react";

type AlertVariant = "success" | "error" | "warning" | "info";

type AlertMessageProps = {
  variant?: AlertVariant;
  className?: string;
  children: React.ReactNode;
};

const variantMap: Record<AlertVariant, { severity: "success" | "error" | "warn" | "info"; icon: string }> = {
  success: { severity: "success", icon: "pi pi-check-circle" },
  error: { severity: "error", icon: "pi pi-times-circle" },
  warning: { severity: "warn", icon: "pi pi-exclamation-triangle" },
  info: { severity: "info", icon: "pi pi-info-circle" },
};

export default function AlertMessage({
  variant = "info",
  className = "",
  children,
}: AlertMessageProps) {
  if (!children) return null;
  const config = variantMap[variant] || variantMap.info;
  return (
    <div className={`vtur-alert ${className}`.trim()}>
      <div className={`p-message p-component p-message-${config.severity}`}>
        <div className="p-message-wrapper">
          <span className={`p-message-icon ${config.icon}`} />
          <div className="p-message-text">{children}</div>
        </div>
      </div>
    </div>
  );
}
