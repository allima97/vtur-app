import React from "react";
import { PrimeReactProvider } from "primereact/api";
import "primereact/resources/themes/lara-light-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";

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
    <PrimeReactProvider>
      <div className={["vtur-primer-scope", className].filter(Boolean).join(" ")} style={style}>
        {children}
      </div>
    </PrimeReactProvider>
  );
}
