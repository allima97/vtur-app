import React from "react";

type AppCardProps = React.HTMLAttributes<HTMLElement> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: "default" | "info" | "config";
};

export default function AppCard({
  title,
  subtitle,
  actions,
  tone = "default",
  className,
  children,
  ...props
}: AppCardProps) {
  return (
    <section
      {...props}
      className={["vtur-app-card", `vtur-app-card-${tone}`, className].filter(Boolean).join(" ")}
    >
      {(title || subtitle || actions) && (
        <div className="vtur-app-card-header">
          <div className="vtur-app-card-copy">
            {title && (
              <h3 className="vtur-app-card-title">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="vtur-app-card-subtitle">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="vtur-app-card-actions">{actions}</div>}
        </div>
      )}
      <div className="vtur-app-card-body">{children}</div>
    </section>
  );
}
