import React from "react";
import AppPrimerProvider from "./AppPrimerProvider";
import AppToolbar from "./AppToolbar";

type AppPageHeaderProps = {
  title: React.ReactNode;
  subtitle?: string;
  subtitleHtml?: string;
  color?: "blue" | "teal" | "green" | "config";
  stackActionsOnMobile?: boolean;
  children?: React.ReactNode;
};

export default function AppPageHeader({
  title,
  subtitle = "",
  subtitleHtml = "",
  color = "blue",
  stackActionsOnMobile = false,
  children,
}: AppPageHeaderProps) {
  return (
    <AppPrimerProvider>
      <AppToolbar
        className={[
          "vtur-page-header",
          `vtur-page-header-${color}`,
          stackActionsOnMobile ? "vtur-page-header-stack" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={title}
        subtitle={subtitleHtml ? <span dangerouslySetInnerHTML={{ __html: subtitleHtml }} /> : subtitle}
        actions={children}
      />
    </AppPrimerProvider>
  );
}
