import React from "react";
import { PageHeader } from "@primer/react";
import AppPrimerProvider from "./AppPrimerProvider";

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
      <PageHeader
        className={[
          "vtur-page-header",
          `vtur-page-header-${color}`,
          stackActionsOnMobile ? "vtur-page-header-stack" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        hasBorder={false}
      >
        <PageHeader.TitleArea variant="large">
          <PageHeader.Title>{title}</PageHeader.Title>
          {subtitleHtml ? (
            <PageHeader.Description>
              <span dangerouslySetInnerHTML={{ __html: subtitleHtml }} />
            </PageHeader.Description>
          ) : subtitle ? (
            <PageHeader.Description>{subtitle}</PageHeader.Description>
          ) : null}
        </PageHeader.TitleArea>
        {children ? <PageHeader.Actions>{children}</PageHeader.Actions> : null}
      </PageHeader>
    </AppPrimerProvider>
  );
}
