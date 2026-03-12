import React from "react";
import { Button as PrimeButton } from "primereact/button";

type PrimeButtonProps = React.ComponentProps<typeof PrimeButton>;

type AppButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "link";

type AppButtonProps = Omit<PrimeButtonProps, "severity" | "outlined" | "text" | "link" | "label"> & {
  variant?: AppButtonVariant;
  block?: boolean;
  children?: React.ReactNode;
};

const variantClassMap: Record<AppButtonVariant, string> = {
  default: "",
  primary: "",
  secondary: "p-button-outlined",
  danger: "p-button-danger",
  ghost: "p-button-text",
  link: "p-button-link",
};

function getClassName(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(getNodeText).join(" ").trim();
}

function isSrOnlyNode(node: React.ReactNode): boolean {
  return React.isValidElement(node) && getClassName(node.props.className).split(/\s+/).includes("sr-only");
}

function isIconOnlyNode(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false;

  if (typeof node.type === "string") {
    if (node.type === "i" || node.type === "svg") return true;

    if (node.type === "span" && node.props["aria-hidden"] === true) {
      const nested = React.Children.toArray(node.props.children).filter(Boolean);
      return nested.length === 1 && isIconOnlyNode(nested[0]);
    }
  }

  const className = getClassName(node.props.className);
  if (/(^|\s)(pi|pi-[\w-]+)(\s|$)/.test(className)) return true;
  if (className.includes("p-button-icon")) return true;

  return false;
}

export default function AppButton({
  variant = "default",
  block = false,
  className,
  children,
  ...props
}: AppButtonProps) {
  const isPrimitiveChild = typeof children === "string" || typeof children === "number";
  const resolvedLabel = isPrimitiveChild ? String(children) : undefined;
  const childNodes = isPrimitiveChild ? [] : React.Children.toArray(children).filter(Boolean);
  const contentNodes = childNodes.filter((child) => !isSrOnlyNode(child));
  const srOnlyText = childNodes
    .filter((child) => isSrOnlyNode(child))
    .map(getNodeText)
    .filter(Boolean)
    .join(" ")
    .trim();
  const extractedIcon =
    !props.icon &&
    !resolvedLabel &&
    contentNodes.length === 1 &&
    childNodes.every((child) => isSrOnlyNode(child) || child === contentNodes[0]) &&
    isIconOnlyNode(contentNodes[0])
      ? contentNodes[0]
      : undefined;
  const resolvedIcon = props.icon ?? extractedIcon;
  const isIconOnlyButton = !resolvedLabel && Boolean(resolvedIcon) && contentNodes.length <= 1;
  const resolvedAriaLabel =
    props["aria-label"] || (typeof props.title === "string" ? props.title : undefined) || srOnlyText || undefined;

  return (
    <PrimeButton
      {...props}
      icon={resolvedIcon}
      label={resolvedLabel}
      aria-label={resolvedAriaLabel}
      className={[
        "vtur-app-button",
        `vtur-app-button-${variant}`,
        variantClassMap[variant],
        isIconOnlyButton ? "p-button-icon-only" : "",
        block ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isPrimitiveChild || extractedIcon ? null : children}
    </PrimeButton>
  );
}
