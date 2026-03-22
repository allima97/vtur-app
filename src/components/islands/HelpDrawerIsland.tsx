import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import {
  type DocumentationSection,
  findDocumentationHelpSection,
  renderDocumentationMarkdownHtml,
  resolveDocumentationModuleContext,
  resolveDocumentationRoleScope,
} from "../../lib/documentation";
import AppButton from "../ui/primer/AppButton";
import EmptyState from "../ui/EmptyState";

export default function HelpDrawerIsland() {
  const { userType, isSystemAdmin } = usePermissoesStore();
  const [sections, setSections] = useState<DocumentationSection[]>([]);
  const [open, setOpen] = useState(false);
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPathname(window.location.pathname || "");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOpen = () => setOpen(true);
    window.addEventListener("sgtur:open-help", handleOpen as EventListener);
    return () => window.removeEventListener("sgtur:open-help", handleOpen as EventListener);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/documentacao");
        if (!res.ok) throw new Error("Falha ao carregar documentação.");
        const data = await res.json();
        setSections(Array.isArray(data?.sections) ? data.sections : []);
      } catch {
        setSections([]);
      }
    }
    load();
  }, []);

  const roleScope = resolveDocumentationRoleScope(userType, isSystemAdmin);
  const moduleContext = resolveDocumentationModuleContext(pathname || "");
  const moduleKey = moduleContext.moduleKey;

  const helpSection = useMemo(() => {
    if (sections.length === 0) return null;
    return findDocumentationHelpSection(sections, {
      roleScope,
      moduleKey,
      pathname,
    });
  }, [sections, moduleKey, pathname, roleScope]);

  const helpHtml = useMemo(() => {
    if (!helpSection) return "";
    const markdown = [`### ${helpSection.title}`, "", helpSection.summary || "", helpSection.content_markdown]
      .filter(Boolean)
      .join("\n");
    return renderDocumentationMarkdownHtml(markdown);
  }, [helpSection]);

  if (pathname.startsWith("/documentacao")) return null;

  return (
    <>
      {open && (
        <div className="help-drawer">
          <div className="help-drawer-header">
            <strong>Ajuda do módulo</strong>
            <AppButton type="button" variant="secondary" onClick={() => setOpen(false)}>
              Fechar
            </AppButton>
          </div>
          <div className="help-drawer-body doc-content">
            {helpHtml ? (
              <div dangerouslySetInnerHTML={{ __html: helpHtml }} />
            ) : (
              <EmptyState title="Ajuda indisponivel" description="Ajuda ainda nao cadastrada para este modulo." />
            )}
          </div>
        </div>
      )}
    </>
  );
}
