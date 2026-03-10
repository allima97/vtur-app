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
  editIcon = "✏️",
  deleteIcon = "🗑️",
  className = "",
}: TableActionsProps) {
  if (!show) return null;

  const normalizedActions = (actions || []).filter(Boolean);
  if (normalizedActions.length > 0) {
    return (
      <div className={`action-buttons vtur-table-actions ${className}`.trim()}>
        {normalizedActions.map((action) => {
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
              title={action.title || action.label}
              aria-label={action.title || action.label}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon ?? action.label}
            </AppButton>
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
          title={editLabel}
          aria-label={editLabel}
          onClick={onEdit}
          disabled={editDisabled}
        >
          {editIcon}
        </AppButton>
      )}
      {shouldShowDelete && onDelete && (
        <AppButton
          type="button"
          variant="danger"
          className="vtur-table-action"
          title={deleteLabel}
          aria-label={deleteLabel}
          onClick={onDelete}
          disabled={deleteDisabled}
        >
          {deleteIcon}
        </AppButton>
      )}
    </div>
  );
}
