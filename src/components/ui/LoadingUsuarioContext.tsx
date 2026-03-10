import React from "react";
import AppCard from "./primer/AppCard";

type LoadingUsuarioContextProps = {
  className?: string;
};

export default function LoadingUsuarioContext({ className = "" }: LoadingUsuarioContextProps) {
  return (
    <AppCard tone="config" className={className}>
      <strong>Carregando contexto do usuário...</strong>
    </AppCard>
  );
}
