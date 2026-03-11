import React from "react";

type AppToolbarProps = React.HTMLAttributes<HTMLElement> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  sticky?: boolean;
  tone?: "default" | "info" | "config";
};

export default function AppToolbar({
  title,
  subtitle,
  actions,
  sticky = false,
  tone = "default",
  className,
  children,
  ...props
}: AppToolbarProps) {
  return (
    <section
      {...props}
      className={[
        "vtur-app-toolbar",
        `vtur-app-toolbar-${tone}`,
        sticky ? "vtur-app-toolbar-sticky" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {(title || subtitle || actions) && (
        <div className="vtur-app-toolbar-head">
          <div className="vtur-app-toolbar-copy">
            {title && (
              <h2 className="vtur-app-toolbar-title">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="vtur-app-toolbar-subtitle">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="vtur-app-toolbar-actions">{actions}</div>}
        </div>
      )}
      {children ? <div className="vtur-app-toolbar-body">{children}</div> : null}
    </section>
  );
}
