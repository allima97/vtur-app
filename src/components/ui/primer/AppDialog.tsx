import React from "react";
import { Dialog } from "primereact/dialog";
import AppPrimerProvider from "./AppPrimerProvider";
import AppButton from "./AppButton";

type AppDialogProps = {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  icon?: React.ReactNode;
  titleColor?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
};

export default function AppDialog({
  open,
  title = "Confirmar",
  message,
  icon,
  titleColor,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  confirmDisabled = false,
  confirmLoading = false,
  onConfirm,
  onCancel,
  children,
}: AppDialogProps) {
  if (!open) return null;

  return (
    <AppPrimerProvider>
      <Dialog
        header={
          <span className="vtur-app-dialog-title">
            {icon && <span className="vtur-app-dialog-icon">{icon}</span>}
            <span style={titleColor ? { color: titleColor } : undefined}>{title}</span>
          </span>
        }
        visible={open}
        style={{ width: "min(42rem, 95vw)" }}
        onHide={onCancel}
        footer={
          <div className="vtur-form-actions">
            <AppButton variant="secondary" type="button" onClick={onCancel}>
              {cancelLabel}
            </AppButton>
            <AppButton
              variant={confirmVariant === "danger" ? "danger" : "primary"}
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              loading={confirmLoading}
            >
              {confirmLabel}
            </AppButton>
          </div>
        }
      >
        <div className="vtur-app-dialog-body">
          {children ? (
            children
          ) : message ? (
            typeof message === "string" ? <p>{message}</p> : message
          ) : null}
        </div>
      </Dialog>
    </AppPrimerProvider>
  );
}
