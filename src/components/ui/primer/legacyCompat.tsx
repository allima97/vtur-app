import React from "react";
import { Dialog as PrimeDialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import AppButton from "./AppButton";

type LegacyDialogFooterButton = {
  content: React.ReactNode;
  buttonType?: "default" | "primary" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type LegacyDialogProps = {
  title?: React.ReactNode;
  width?: "small" | "medium" | "large" | "xlarge";
  onClose: () => void;
  footerButtons?: LegacyDialogFooterButton[];
  children?: React.ReactNode;
  role?: string;
};

const dialogWidthMap: Record<NonNullable<LegacyDialogProps["width"]>, string> = {
  small: "min(28rem, 95vw)",
  medium: "min(36rem, 95vw)",
  large: "min(48rem, 95vw)",
  xlarge: "min(72rem, 97vw)",
};

export function Dialog({
  title,
  width = "large",
  onClose,
  footerButtons = [],
  children,
}: LegacyDialogProps) {
  return (
    <PrimeDialog
      visible
      onHide={onClose}
      header={title}
      style={{ width: dialogWidthMap[width] }}
      footer={
        footerButtons.length ? (
          <div className="vtur-form-actions">
            {footerButtons.map((button, idx) => (
              <AppButton
                key={`${idx}-${String(button.content)}`}
                type="button"
                variant={
                  button.buttonType === "primary"
                    ? "primary"
                    : button.buttonType === "danger"
                    ? "danger"
                    : "secondary"
                }
                disabled={button.disabled}
                loading={button.loading}
                onClick={button.onClick}
              >
                {button.content}
              </AppButton>
            ))}
          </div>
        ) : null
      }
    >
      {children}
    </PrimeDialog>
  );
}

type LegacySelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  block?: boolean;
  validationStatus?: "error" | "success";
};

type LegacyOptionProps = React.OptionHTMLAttributes<HTMLOptionElement>;

function LegacyOption({ children, ...props }: LegacyOptionProps) {
  return <option {...props}>{children}</option>;
}

function LegacySelect({ block = false, className, validationStatus, children, ...props }: LegacySelectProps) {
  return (
    <select
      {...props}
      className={[
        "p-inputtext p-component",
        block ? "w-full" : "",
        validationStatus === "error" ? "p-invalid" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </select>
  );
}

LegacySelect.Option = LegacyOption;

type LegacyTextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  block?: boolean;
  validationStatus?: "error" | "success";
};

export function TextInput({ block = false, className, validationStatus, ...props }: LegacyTextInputProps) {
  return (
    <InputText
      {...props}
      className={[
        block ? "w-full" : "",
        validationStatus === "error" ? "p-invalid" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

type LegacyTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  block?: boolean;
  validationStatus?: "error" | "success";
};

export function Textarea({ block = false, className, validationStatus, ...props }: LegacyTextareaProps) {
  return (
    <InputTextarea
      {...props}
      className={[
        block ? "w-full" : "",
        validationStatus === "error" ? "p-invalid" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

type NavListProps = React.HTMLAttributes<HTMLElement>;
type NavListItemProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

function NavListRoot({ className, children, ...props }: NavListProps) {
  return (
    <nav {...props} className={className}>
      <ul className="vtur-legacy-navlist">{children}</ul>
    </nav>
  );
}

function NavListItem({ className, children, ...props }: NavListItemProps) {
  return (
    <li className="vtur-legacy-navitem">
      <a {...props} className={className}>
        {children}
      </a>
    </li>
  );
}

function NavListLeadingVisual({ children }: { children: React.ReactNode }) {
  return <span className="vtur-legacy-nav-leading">{children}</span>;
}

export const NavList = Object.assign(NavListRoot, {
  Item: NavListItem,
  LeadingVisual: NavListLeadingVisual,
});

export const Select = LegacySelect;
