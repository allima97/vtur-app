import React from "react";
import { Dialog } from "primereact/dialog";
import AppPrimerProvider from "./AppPrimerProvider";
import AppButton from "./AppButton";

type AppNoticeDialogProps = {
  open: boolean;
  title?: React.ReactNode;
  message?: React.ReactNode;
  icon?: React.ReactNode;
  closeLabel?: React.ReactNode;
  onClose: () => void;
};

export default function AppNoticeDialog({
  open,
  title = "Aviso",
  message,
  icon,
  closeLabel = "Fechar",
  onClose,
}: AppNoticeDialogProps) {
  if (!open) return null;

  return (
    <AppPrimerProvider>
      <Dialog
        header={
          <span className="vtur-app-dialog-title">
            {icon ? <span className="vtur-app-dialog-icon">{icon}</span> : null}
            <span>{title}</span>
          </span>
        }
        visible={open}
        style={{ width: "min(36rem, 95vw)" }}
        onHide={onClose}
        footer={
          <div className="vtur-form-actions">
            <AppButton variant="secondary" type="button" onClick={onClose}>
              {closeLabel}
            </AppButton>
          </div>
        }
      >
        <div className="vtur-app-dialog-body">
          {typeof message === "string" ? <p>{message}</p> : message}
        </div>
      </Dialog>
    </AppPrimerProvider>
  );
}
