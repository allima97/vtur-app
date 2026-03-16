import React, { useEffect, useState } from "react";
import AppCard from "../ui/primer/AppCard";

export default function DocumentationIsland() {
  const [content, setContent] = useState<string>("Carregando documentação...");

  useEffect(() => {
    async function loadDoc() {
      try {
        const res = await fetch("/api/documentacao", { credentials: "include" });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const payload = await res.json();
        setContent(String(payload?.markdown || ""));
      } catch (e) {
        setContent("Não foi possível carregar a documentação.");
        console.error(e);
      }
    }

    loadDoc();
  }, []);

  return (
    <section className="documentation-page">
      <AppCard
        tone="info"
        title="Documentacao do sistema"
        subtitle="Guia tecnico e operacional centralizado."
      />
      <AppCard tone="info">
        <div
          style={{
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            fontSize: "0.9rem",
            overflowX: "auto",
          }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
        />
      </AppCard>
    </section>
  );
}

// Conversor simplificado — suficiente para MD básico.
function markdownToHtml(md: string) {
  return md
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    .replace(/^- (.*$)/gim, "<li>$1</li>")
    .replace(/\n{2,}/g, "<br/><br/>");
}
