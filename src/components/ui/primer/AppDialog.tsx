import React from "react";
import { Dialog, Text } from "@primer/react";
import AppPrimerProvider from "./AppPrimerProvider";

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
        title={
          <span className="vtur-app-dialog-title">
            {icon && <span className="vtur-app-dialog-icon">{icon}</span>}
            <span style={titleColor ? { color: titleColor } : undefined}>{title}</span>
          </span>
        }
        width="large"
        role="alertdialog"
        onClose={() => onCancel()}
        footerButtons={[
          {
            content: cancelLabel,
            buttonType: "default",
            onClick: onCancel,
          },
          {
            content: confirmLabel,
            buttonType: confirmVariant === "danger" ? "danger" : "primary",
            onClick: onConfirm,
            disabled: confirmDisabled,
            loading: confirmLoading,
          },
        ]}
      >
        <div className="vtur-app-dialog-body">
          {children ? (
            children
          ) : message ? (
            typeof message === "string" ? (
              <Text as="p">{message}</Text>
            ) : (
              message
            )
          ) : null}
        </div>
      </Dialog>
    </AppPrimerProvider>
  );
}
