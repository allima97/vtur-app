import React from "react";

type AppCardProps = React.HTMLAttributes<HTMLElement> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: "default" | "info" | "config";
};

type TableDetection = {
  hasTable: boolean;
  hasDataTable: boolean;
  hasNestedCard: boolean;
};

function mergeTableDetection(base: TableDetection, next: TableDetection): TableDetection {
  return {
    hasTable: base.hasTable || next.hasTable,
    hasDataTable: base.hasDataTable || next.hasDataTable,
    hasNestedCard: base.hasNestedCard || next.hasNestedCard,
  };
}

function detectTableContent(node: React.ReactNode): TableDetection {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { hasTable: false, hasDataTable: false, hasNestedCard: false };
  }

  if (Array.isArray(node)) {
    return node.reduce<TableDetection>(
      (acc, child) => mergeTableDetection(acc, detectTableContent(child)),
      { hasTable: false, hasDataTable: false, hasNestedCard: false }
    );
  }

  if (!React.isValidElement(node)) {
    return { hasTable: false, hasDataTable: false, hasNestedCard: false };
  }

  const rawType = node.type as unknown;
  const isNativeTable = rawType === "table";
  const componentName =
    typeof rawType === "function"
      ? (rawType as { displayName?: string; name?: string }).displayName ||
        (rawType as { displayName?: string; name?: string }).name ||
        ""
      : "";
  const isDataTableComponent = componentName === "DataTable";
  const className = typeof node.props?.className === "string" ? node.props.className : "";
  const classHintsTable = /\b(vtur-data-table-shell|vtur-data-table|table-default|table-mobile-cards|table-mobile-grid|ranking-table)\b/.test(
    className
  );
  const classHintsDataTable = /\b(vtur-data-table-shell|vtur-data-table)\b/.test(className);
  const isNestedCardComponent = componentName === "AppCard";

  const own: TableDetection = {
    hasTable: Boolean(isNativeTable || isDataTableComponent || classHintsTable),
    hasDataTable: Boolean(isDataTableComponent || classHintsDataTable),
    hasNestedCard: Boolean(isNestedCardComponent || /\bvtur-app-card\b/.test(className)),
  };

  return mergeTableDetection(own, detectTableContent(node.props?.children));
}

export default function AppCard({
  title,
  subtitle,
  actions,
  tone = "default",
  className,
  children,
  ...props
}: AppCardProps) {
  const tableDetection = detectTableContent(children);
  const tableLayoutClass = tableDetection.hasTable
    ? tableDetection.hasDataTable
      ? "vtur-app-card-has-datatable"
      : "vtur-app-card-has-table"
    : "";
  const shellLayoutClass =
    tableDetection.hasNestedCard && !tableDetection.hasTable ? "vtur-app-card-shell" : "";

  return (
    <section
      {...props}
      className={["vtur-app-card", `vtur-app-card-${tone}`, tableLayoutClass, shellLayoutClass, className]
        .filter(Boolean)
        .join(" ")}
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
