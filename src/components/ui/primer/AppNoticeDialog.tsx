import React from "react";
import { Dialog, Text } from "@primer/react";
import AppPrimerProvider from "./AppPrimerProvider";

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
        title={
          <span className="vtur-app-dialog-title">
            {icon ? <span className="vtur-app-dialog-icon">{icon}</span> : null}
            <span>{title}</span>
          </span>
        }
        width="medium"
        role="alertdialog"
        onClose={() => onClose()}
        footerButtons={[
          {
            content: closeLabel,
            buttonType: "primary",
            onClick: onClose,
          },
        ]}
      >
        <div className="vtur-app-dialog-body">
          {typeof message === "string" ? <Text as="p">{message}</Text> : message}
        </div>
      </Dialog>
    </AppPrimerProvider>
  );
}
