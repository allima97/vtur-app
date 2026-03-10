import React from "react";
import { BaseStyles, ThemeProvider } from "@primer/react";

type AppPrimerProviderProps = {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export default function AppPrimerProvider({
  children,
  className,
  style,
}: AppPrimerProviderProps) {
  return (
    <ThemeProvider colorMode="light" dayScheme="light" preventSSRMismatch>
      <BaseStyles>
        <div className={["vtur-primer-scope", className].filter(Boolean).join(" ")} style={style}>
          {children}
        </div>
      </BaseStyles>
    </ThemeProvider>
  );
}
