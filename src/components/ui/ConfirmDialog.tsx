import React from "react";
import AppDialog from "./primer/AppDialog";

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  icon?: React.ReactNode;
  titleColor?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
};

export default function ConfirmDialog({
  open,
  title = "Confirmar",
  message,
  icon,
  titleColor,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmVariant = "primary",
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      title={title}
      message={message}
      icon={icon}
      titleColor={titleColor}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmVariant={confirmVariant}
      confirmDisabled={confirmDisabled}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {children}
    </AppDialog>
  );
}
