import React from "react";
import AppButton from "./primer/AppButton";

type ActionVariant = "danger" | "primary" | "light" | "ghost";

type ActionItem = {
  key: string;
  label: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: ActionVariant;
  disabled?: boolean;
  title?: string;
  className?: string;
};

type TableActionsProps = {
  show?: boolean;
  actions?: ActionItem[];
  onEdit?: () => void;
  onDelete?: () => void;
  showEdit?: boolean;
  showDelete?: boolean;
  editLabel?: string;
  deleteLabel?: string;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  editIcon?: React.ReactNode;
  deleteIcon?: React.ReactNode;
  className?: string;
};

function normalizeIconFromLabel(label: string): string {
  const key = String(label || "").trim().toLowerCase();
  if (!key) return "pi pi-cog";
  if (key.includes("editar")) return "pi pi-pencil";
  if (key.includes("excluir") || key.includes("remover")) return "pi pi-trash";
  if (key.includes("abrir") || key.includes("visual") || key === "ver") return "pi pi-eye";
  if (key.includes("whatsapp")) return "pi pi-whatsapp";
  if (key.includes("intera")) return "pi pi-file-edit";
  if (key.includes("senha")) return "pi pi-key";
  if (key.includes("ativar") || key.includes("aprovar")) return "pi pi-check-circle";
  if (key.includes("desativ") || key.includes("inativ") || key.includes("rejeitar")) return "pi pi-times-circle";
  if (key.includes("suspender") || key.includes("bloquear")) return "pi pi-ban";
  if (key.includes("atras")) return "pi pi-clock";
  if (key.includes("adicionar")) return "pi pi-plus-circle";
  return "pi pi-cog";
}

function resolveActionIcon(icon: React.ReactNode, label: string): React.ReactNode {
  if (React.isValidElement(icon)) return icon;
  if (typeof icon === "string") {
    const raw = icon.trim();
    if (!raw) return <i className={normalizeIconFromLabel(label)} aria-hidden="true" />;
    if (raw.startsWith("pi ")) return <i className={raw} aria-hidden="true" />;
    if (raw === "↑") return <i className="pi pi-arrow-up" aria-hidden="true" />;
    if (raw === "↓") return <i className="pi pi-arrow-down" aria-hidden="true" />;
    if (raw === "×" || raw.toLowerCase() === "x") return <i className="pi pi-times" aria-hidden="true" />;
    if (raw === "+") return <i className="pi pi-plus" aria-hidden="true" />;
    if (raw === "-") return <i className="pi pi-minus" aria-hidden="true" />;
    return <i className={normalizeIconFromLabel(label)} aria-hidden="true" />;
  }
  return <i className={normalizeIconFromLabel(label)} aria-hidden="true" />;
}

export default function TableActions({
  show = true,
  actions,
  onEdit,
  onDelete,
  showEdit,
  showDelete,
  editLabel = "Editar",
  deleteLabel = "Excluir",
  editDisabled = false,
  deleteDisabled = false,
  editIcon = <i className="pi pi-pencil" aria-hidden="true" />,
  deleteIcon = <i className="pi pi-trash" aria-hidden="true" />,
  className = "",
}: TableActionsProps) {
  if (!show) return null;

  const normalizedActions = (actions || []).filter(Boolean);
  if (normalizedActions.length > 0) {
    return (
      <div className={`action-buttons vtur-table-actions ${className}`.trim()}>
        {normalizedActions.map((action) => {
          const actionLabel = action.title || action.label;
          const actionIcon = resolveActionIcon(action.icon, actionLabel);
          return (
            <AppButton
              key={action.key}
              type="button"
              variant={
                action.variant === "danger"
                  ? "danger"
                  : action.variant === "primary"
                    ? "primary"
                    : action.variant === "light"
                      ? "secondary"
                      : "ghost"
              }
              className={`vtur-table-action ${action.className || ""}`.trim()}
              icon={actionIcon}
              title={actionLabel}
              aria-label={actionLabel}
              onClick={action.onClick}
              disabled={action.disabled}
            />
          );
        })}
      </div>
    );
  }

  const shouldShowEdit = showEdit ?? Boolean(onEdit);
  const shouldShowDelete = showDelete ?? Boolean(onDelete);

  if (!shouldShowEdit && !shouldShowDelete) return null;

  return (
    <div className={`action-buttons vtur-table-actions ${className}`.trim()}>
      {shouldShowEdit && onEdit && (
        <AppButton
          type="button"
          variant="ghost"
          className="vtur-table-action"
          icon={editIcon}
          title={editLabel}
          aria-label={editLabel}
          onClick={onEdit}
          disabled={editDisabled}
        />
      )}
      {shouldShowDelete && onDelete && (
        <AppButton
          type="button"
          variant="danger"
          className="vtur-table-action"
          icon={deleteIcon}
          title={deleteLabel}
          aria-label={deleteLabel}
          onClick={onDelete}
          disabled={deleteDisabled}
        />
      )}
    </div>
  );
}
